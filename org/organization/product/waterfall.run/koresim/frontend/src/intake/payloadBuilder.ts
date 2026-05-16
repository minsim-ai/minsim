import type { RunCreateRequest, SimulationInput, SimulationType, TargetFilter } from "../types/api";
import { asString, asStringArray } from "./slotUtils";
import type {
  CreativeCandidate,
  FieldError,
  IntakeContextEnvelope,
  IntakeRunProvenance,
  IntakeSession,
  SafeIntakeSummary,
} from "./types";

export function buildCreativeTestingPayload(session: IntakeSession): RunCreateRequest {
  const candidates = asCandidateTexts(session);
  return {
    simulation_type: "creative_testing",
    input: {
      creatives: candidates,
    },
    sample_size: parseSampleSize(session.slots.sample_size?.value, 200),
    target_filter: parseTargetFilter([
      asString(session.slots.product_description),
      ...asStringArray(session.slots.target_customers),
    ].join(" ")),
    seed: parseSeed(asString(session.slots.seed)),
    intake_context: buildIntakeContextEnvelope(session),
  };
}

export function validateCreativeTestingPayload(payload: RunCreateRequest): FieldError[] {
  const input = payload.input;
  const creatives = typeof input === "object" && "creatives" in input && Array.isArray(input.creatives)
    ? input.creatives
    : [];
  const errors: FieldError[] = [];
  if (creatives.length < 2) {
    errors.push({ fieldId: "creative_candidates", message: "비교하려면 후보 문구가 최소 2개 필요합니다." });
  }
  if (creatives.length > 10) {
    errors.push({ fieldId: "creative_candidates", message: "후보 문구는 최대 10개까지 비교할 수 있습니다." });
  }
  if (creatives.some((creative) => typeof creative !== "string" || creative.trim().length === 0)) {
    errors.push({ fieldId: "creative_candidates", message: "빈 후보 문구는 사용할 수 없습니다." });
  }
  return errors;
}

export function buildGenericSimulationPayload(session: IntakeSession): RunCreateRequest {
  const simulationType = session.taskFrame?.primarySimulationType;
  if (!simulationType || simulationType === "creative_testing") {
    return buildCreativeTestingPayload(session);
  }
  return {
    simulation_type: simulationType,
    input: buildGenericInput(simulationType, session),
    sample_size: parseSampleSize(session.slots.sample_size?.value, 200),
    target_filter: parseTargetFilter(buildTargetFilterText(session)),
    seed: parseSeed(asString(session.slots.seed)),
    intake_context: buildIntakeContextEnvelope(session),
  };
}

export function buildIntakeRunProvenance(session: IntakeSession): IntakeRunProvenance {
  const grouped = Object.values(session.slots).reduce(
    (acc, slot) => {
      const target = slot.source === "user"
        ? acc.userProvided
        : slot.source === "inferred"
          ? acc.inferred
          : slot.source === "generated"
            ? acc.generated
            : acc.defaults;
      target[slot.slotId] = slot.value;
      return acc;
    },
    {
      userProvided: {} as Record<string, unknown>,
      inferred: {} as Record<string, unknown>,
      generated: {} as Record<string, unknown>,
      defaults: {} as Record<string, unknown>,
    },
  );

  return {
    userGoal: session.taskFrame?.userGoal ?? "",
    simulationType: session.taskFrame?.primarySimulationType ?? "creative_testing",
    ...grouped,
    unreviewedAssumptionCount: Object.values(session.slots).filter((slot) => slot.needsUserReview && !slot.reviewed).length,
  };
}

export function buildIntakeContextEnvelope(session: IntakeSession): IntakeContextEnvelope {
  const provenance = buildIntakeRunProvenance(session);
  return {
    schema_version: "intake-context/v1",
    intake_session_id: session.id,
    router_version: "goal-router:v1",
    planner_version: "intake-planner:v2-20260513",
    task_frame: session.taskFrame ? { ...session.taskFrame } : {},
    provenance: {
      user_goal: provenance.userGoal,
      simulation_type: provenance.simulationType,
      user_provided: provenance.userProvided,
      inferred: provenance.inferred,
      generated: provenance.generated,
      defaults: provenance.defaults,
      unreviewed_assumption_count: provenance.unreviewedAssumptionCount,
    },
    safe_intake_summary: buildSafeIntakeSummary(session, provenance),
  };
}

export function buildSafeIntakeSummary(
  session: IntakeSession,
  provenance: IntakeRunProvenance = buildIntakeRunProvenance(session),
): SafeIntakeSummary {
  const reviewedAssumptions = Object.fromEntries(
    Object.values(session.slots)
      .filter((slot) => slot.needsUserReview && slot.reviewed)
      .map((slot) => [slot.slotId, slot.value]),
  );
  const generatedCandidates = asCandidateTexts(session);
  const constraints = Object.fromEntries(
    Object.values(session.slots)
      .filter((slot) => slot.slotId.includes("budget") || slot.slotId.includes("price") || slot.slotId.includes("sample") || slot.slotId.includes("seed"))
      .map((slot) => [slot.slotId, slot.value]),
  );
  return {
    schema_version: "safe-intake-summary/v1",
    user_goal: provenance.userGoal,
    decision_question: session.taskFrame?.decisionQuestion ?? "",
    simulation_type: provenance.simulationType,
    user_provided: provenance.userProvided,
    inferred: provenance.inferred,
    generated: provenance.generated,
    defaults: provenance.defaults,
    reviewed_assumptions: reviewedAssumptions,
    generated_candidates: generatedCandidates,
    constraints,
    source_counts: {
      user: Object.keys(provenance.userProvided).length,
      inferred: Object.keys(provenance.inferred).length,
      generated: Object.keys(provenance.generated).length,
      default: Object.keys(provenance.defaults).length,
    },
    unreviewed_assumption_count: provenance.unreviewedAssumptionCount,
  };
}

function asCandidateTexts(session: IntakeSession): string[] {
  const raw = session.slots.creative_candidates?.value;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((candidate) => {
      if (typeof candidate === "string") return candidate;
      const structured = candidate as Partial<CreativeCandidate>;
      return structured.text;
    })
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim())
    .slice(0, 10);
}

function buildGenericInput(simulationType: Exclude<SimulationType, "creative_testing">, session: IntakeSession): SimulationInput {
  if (simulationType === "price_optimization") {
    const productDescription = asString(session.slots.product_description);
    return {
      product_name: firstPhrase(productDescription, "제품"),
      product_description: productDescription,
      price_points: asNumberArray(session.slots.price_points, [29000, 39000, 49000]).slice(0, 6),
      context_note: asString(session.slots.purchase_context) || null,
    };
  }
  if (simulationType === "product_launch") {
    return {
      product_concept: asString(session.slots.product_concept),
      target_use_case: asString(session.slots.target_use_case),
      key_features: boundedList(asStringArray(session.slots.key_features), ["핵심 기능"], 8),
      expected_price_range: asString(session.slots.expected_price_range) || null,
    };
  }
  if (simulationType === "value_proposition") {
    return {
      product_context: asString(session.slots.product_context),
      statements: boundedList(asStringArray(session.slots.statements), [], 5),
    };
  }
  if (simulationType === "market_segmentation") {
    return {
      category: asString(session.slots.category),
      product_family: asString(session.slots.product_family) || null,
      core_questions: boundedList(asStringArray(session.slots.core_questions), ["구매 기준은 무엇인가요?"], 6),
      n_segments: asNumber(session.slots.n_segments, 6),
    };
  }
  if (simulationType === "competitive_positioning") {
    return {
      category_context: asString(session.slots.category_context),
      products: boundedList(asStringArray(session.slots.products), [], 5),
      attributes: boundedList(asStringArray(session.slots.attributes), ["가격", "품질", "신뢰", "편의"], 8),
    };
  }
  if (simulationType === "brand_perception") {
    return {
      brand_name: asString(session.slots.brand_name),
      category: asString(session.slots.category),
      attributes: boundedList(asStringArray(session.slots.attributes), [], 15),
      context_note: asString(session.slots.recent_context) || null,
    };
  }
  if (simulationType === "churn_prediction") {
    return {
      service_name: asString(session.slots.service_name),
      current_situation: asString(session.slots.current_situation),
      trigger_event: asString(session.slots.trigger_event),
      competitor_offer: asString(session.slots.competitor_offer) || null,
    };
  }
  return {
    product_context: asString(session.slots.product_context),
    channels: boundedList(asStringArray(session.slots.channels), [], 5).map((name) => ({ name })),
    messages: boundedList(asStringArray(session.slots.messages), [], 4).map((creative, index) => ({
      name: `메시지 ${index + 1}`,
      creative,
    })),
    budget: asNumber(session.slots.budget, 100_000_000),
  };
}

function boundedList(values: string[], fallback: string[], maxItems: number): string[] {
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  return (normalized.length > 0 ? normalized : fallback).slice(0, maxItems);
}

function asNumber(slot: IntakeSession["slots"][string] | undefined, fallback: number): number {
  if (typeof slot?.value === "number" && Number.isFinite(slot.value) && slot.value > 0) return slot.value;
  const parsed = Number(String(slot?.value ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function asNumberArray(slot: IntakeSession["slots"][string] | undefined, fallback: number[]): number[] {
  const rawValues = Array.isArray(slot?.value) ? slot.value : [slot?.value];
  const parsed = rawValues
    .flatMap((value) => parseAmountCandidates(String(value ?? "")))
    .filter((value) => Number.isFinite(value) && value > 0);
  return Array.from(new Set(parsed.length > 0 ? parsed : fallback));
}

function firstPhrase(value: string, fallback: string): string {
  return value.split(/[.\n]/)[0]?.trim().slice(0, 120) || fallback;
}

function parseSampleSize(value: unknown, fallback: number): number {
  const match = String(value ?? "").match(/\d+/);
  const parsed = match ? Number(match[0]) : fallback;
  return Math.max(50, Math.min(parsed, 200));
}

function parseSeed(value: string): number {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : 42;
}

function parseTargetFilter(text: string): TargetFilter {
  const targetFilter: TargetFilter = {};
  const ageRange = parseAgeRange(text);
  if (ageRange) {
    targetFilter.age_min = ageRange.age_min;
    targetFilter.age_max = ageRange.age_max;
  }
  if (text.includes("서울")) targetFilter.province = ["서울"];
  if (text.includes("경기")) targetFilter.province = [...(targetFilter.province ?? []), "경기"];
  if (text.includes("여성")) targetFilter.sex = "여자";
  if (text.includes("남성")) targetFilter.sex = "남자";
  return targetFilter;
}

const TARGET_FILTER_SLOT_IDS = new Set([
  "target_customers",
  "target_use_case",
  "purchase_context",
  "category",
  "category_context",
  "product_family",
  "current_situation",
  "recent_context",
]);

function buildTargetFilterText(session: IntakeSession): string {
  return Object.values(session.slots)
    .filter((slot) => TARGET_FILTER_SLOT_IDS.has(slot.slotId))
    .flatMap((slot) => slotValueToText(slot.value))
    .join(" ");
}

function slotValueToText(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(slotValueToText);
  return typeof value === "string" ? [value] : [];
}

function parseAmountCandidates(text: string): number[] {
  return Array.from(text.replaceAll(",", "").matchAll(/(\d+(?:\.\d+)?)\s*(만\s*원|만원|천\s*원|천원|원|달러|usd|krw)?/gi))
    .map((match) => {
      const base = Number(match[1]);
      const unit = (match[2] ?? "").replace(/\s/g, "").toLowerCase();
      if (!Number.isFinite(base)) return null;
      if (unit === "만원") return Math.round(base * 10_000);
      if (unit === "천원") return Math.round(base * 1_000);
      return Math.round(base);
    })
    .filter((value): value is number => value !== null && value > 0);
}

function parseAgeRange(text: string): { age_min: number; age_max: number } | null {
  const normalized = text.replace(/\s+/g, " ");
  const exactAgeRange = normalized.match(/(\d{1,3})\s*(?:세|살)\s*(?:부터|에서|~|-|–|—|to|까지)\s*(\d{1,3})\s*(?:세|살)?/i)
    ?? normalized.match(/(\d{1,3})\s*(?:~|-|–|—|to)\s*(\d{1,3})\s*(?:세|살)/i);
  if (exactAgeRange) return normalizeAgeRange(Number(exactAgeRange[1]), Number(exactAgeRange[2]));

  const decadeRange = normalized.match(/([1-9]\d)\s*(?:대)?\s*(?:부터|에서|~|-|–|—|to|까지)\s*([1-9]\d)\s*대/i);
  if (decadeRange) return normalizeAgeRange(Number(decadeRange[1]), Number(decadeRange[2]) + 9);

  const decades = Array.from(normalized.matchAll(/([1-9]\d)\s*대/g))
    .map((match) => Number(match[1]))
    .filter((value) => value >= 10 && value <= 90);
  if (decades.length > 0) {
    const min = Math.min(...decades);
    const max = Math.max(...decades) + 9;
    return normalizeAgeRange(min, max);
  }
  return null;
}

function normalizeAgeRange(first: number, second: number): { age_min: number; age_max: number } | null {
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  const age_min = Math.max(0, Math.min(first, second));
  const age_max = Math.min(120, Math.max(first, second));
  return { age_min, age_max };
}
