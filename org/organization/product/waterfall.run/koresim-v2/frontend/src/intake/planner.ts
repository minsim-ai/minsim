import { generateCreativeCandidates, ensureAudienceAssumptions } from "./candidateGenerator";
import { extractSlotsFromMessage, mergeFormValues } from "./extractor";
import { materializeIntakeDefaults } from "./executionDefaults";
import { creativeTestingPack } from "./creativeTestingPack";
import { getIntakePack } from "./packRegistry";
import { buildCreativeTestingPayload, buildGenericSimulationPayload, buildIntakeRunProvenance, validateCreativeTestingPayload } from "./payloadBuilder";
import { routeIntent } from "./router";
import { asString, asStringArray, createSlot, upsertSlot } from "./slotUtils";
import type {
  DynamicFormField,
  IntakeAction,
  IntakeEvent,
  IntakeSession,
  IntakeSlotValue,
  SlotRequirement,
} from "./types";

const initialAssistant = "어떤 결정을 돕고 싶으신가요? 제품, 캠페인, 가격, 메시지 고민을 편하게 적어주세요.";

export function createInitialIntakeSession(): IntakeSession {
  return {
    id: `intake-${Date.now()}`,
    status: "collecting",
    messages: [{ role: "assistant", content: initialAssistant }],
    taskFrame: null,
    slots: {},
    action: { type: "ask_question", message: initialAssistant, slotIds: ["goal"] },
    turnCount: 0,
  };
}

export function advanceIntakeSession(session: IntakeSession, event: IntakeEvent): IntakeSession {
  if (event.type === "reset") return createInitialIntakeSession();

  if (event.type === "user_message") {
    const taskFrame = session.taskFrame ?? routeIntent(event.content, event.selectedSimulationType);
    const requestedSlotIds = session.action?.type === "ask_question" ? session.action.slotIds : [];
    const slots = extractSlotsFromMessage(event.content, taskFrame, session.slots, requestedSlotIds);
    const next = {
      ...session,
      taskFrame,
      slots,
      messages: [...session.messages, { role: "user" as const, content: event.content }],
      turnCount: session.turnCount + 1,
    };
    return withPlannedAction(next);
  }

  if (event.type === "form_submit") {
    const next = {
      ...session,
      slots: mergeFormValues(event.values, session.slots),
      messages: [...session.messages, { role: "user" as const, content: summarizeFormSubmit(event.values) }],
      turnCount: session.turnCount + 1,
    };
    return withPlannedAction(next);
  }

  if (event.type === "candidate_accept") {
    const reviewedCandidates = event.candidates.map((candidate) => ({
      ...candidate,
      text: candidate.text.trim(),
    })).filter((candidate) => candidate.text.length > 0);
    const reviewAssumptions = event.assumptions ?? (
      session.action?.type === "candidate_review" ? session.action.assumptions : []
    );
    const assumptionSlots = addAssumptionsToSlots(session.slots, reviewAssumptions);
    const nextSlots = upsertSlot(
      assumptionSlots,
      createSlot("creative_candidates", reviewedCandidates, "user", 0.98, "candidate_review", false),
    );
    const next = {
      ...session,
      slots: markAssumptionsReviewed(nextSlots),
      messages: [
        ...session.messages,
        { role: "user" as const, content: `후보 ${reviewedCandidates.length}개로 진행` },
      ],
      turnCount: session.turnCount + 1,
    };
    return withPlannedAction(next);
  }

  if (event.type === "confirm_assumptions") {
    return withPlannedAction({ ...session, slots: markAssumptionsReviewed(session.slots) });
  }

  return session;
}

export function planNextAction(session: IntakeSession): IntakeAction {
  return planPreparedAction(materializeIntakeDefaults(session));
}

function planPreparedAction(session: IntakeSession): IntakeAction {
  const taskFrame = session.taskFrame;
  if (!taskFrame) {
    return { type: "ask_question", message: initialAssistant, slotIds: ["goal"] };
  }

  const sampleSize = numericSlotValue(session.slots.sample_size);
  if (sampleSize !== null && (sampleSize < 50 || sampleSize > 200)) {
    return {
      type: "repair_input",
      message: "현재 제품 패널은 50명부터 200명까지 실행할 수 있습니다. 표본 수를 다시 입력해주세요.",
      fieldErrors: [{ fieldId: "sample_size", message: "표본 수는 50~200명이어야 합니다." }],
    };
  }

  if (taskFrame.primarySimulationType !== "creative_testing") {
    return planGenericSimulationAction(session);
  }

  return planCreativeTestingAction(session);
}

function planGenericSimulationAction(session: IntakeSession): IntakeAction {
  const simulationType = session.taskFrame?.primarySimulationType;
  if (!simulationType || simulationType === "creative_testing") {
    return {
      type: "ask_question",
      message: initialAssistant,
      slotIds: ["goal"],
    };
  }

  const pack = getIntakePack(simulationType);
  const missingFields = pack.slots
    .filter((requirement) => pack.formFieldOrder.includes(requirement.id))
    .filter((requirement) => !hasEnoughCollectedValue(session.slots[requirement.id], requirement));
  const missingCritical = missingFields.filter((requirement) => requirement.importance === "critical");
  const formId = `${pack.simulationType}_intake_v1`;

  if (missingCritical.length > 0 && session.turnCount <= 1) {
    const target = missingCritical[0];
    return {
      type: "ask_question",
      message: `${withObjectParticle(pack.label)} 실행하려면 먼저 ${target.label}이 필요합니다. ${questionHelpText(target.id)}`,
      slotIds: [target.id],
    };
  }

  if (missingFields.length > 0) {
    if (missingCritical.length === 0 && session.action?.type === "show_form" && session.action.form.id === formId) {
      return buildGenericRunReadyAction(session);
    }
    return {
      type: "show_form",
      message: `${pack.label} 시뮬레이션에 필요한 정보를 입력해주세요. 모르는 항목은 비워두고 나중에 보완할 수 있습니다.`,
      form: {
        id: formId,
        fields: compactFormFields(missingFields).map((requirement) => toFormField(requirement, session.slots[requirement.id])),
        primaryAction: "다음",
      },
    };
  }

  return buildGenericRunReadyAction(session);
}

function buildGenericRunReadyAction(session: IntakeSession): IntakeAction {
  return {
    type: "run_ready",
    message: "필요한 입력이 준비되었습니다. 이 조건으로 시뮬레이션을 시작할 수 있습니다.",
    payload: buildGenericSimulationPayload(session),
    assumptions: collectAssumptions(session.slots),
    provenance: buildIntakeRunProvenance(session),
  };
}

function planCreativeTestingAction(session: IntakeSession): IntakeAction {
  if (!asString(session.slots.product_description)) {
    return {
      type: "ask_question",
      message: "좋아요. 어떤 제품이나 서비스인가요?",
      slotIds: ["product_description"],
    };
  }

  if (shouldShowCreativeForm(session)) {
    return {
      type: "show_form",
      message: "헤드라인 후보를 만들고 반응을 시뮬레이션하려면 아래 정보가 있으면 더 정확합니다. 아는 만큼만 채워주세요.",
      form: {
        id: "creative_testing_headline_intake_v1",
        fields: buildCreativeFormFields(session),
        primaryAction: "다음",
      },
    };
  }

  const existingCandidates = candidateTexts(session.slots.creative_candidates);
  if (existingCandidates.length > 0 && existingCandidates.length < 2) {
    return {
      type: "repair_input",
      message: "비교하려면 후보 문구가 최소 2개 필요합니다. 하나 더 직접 쓰거나 제가 만들어드릴 수 있습니다.",
      fieldErrors: [{ fieldId: "creative_candidates", message: "최소 2개 후보가 필요합니다." }],
    };
  }

  if (existingCandidates.length > 10) {
    return {
      type: "repair_input",
      message: "후보 문구는 최대 10개까지 비교할 수 있습니다. 10개 이하로 줄여주세요.",
      fieldErrors: [{ fieldId: "creative_candidates", message: "최대 10개 후보만 사용할 수 있습니다." }],
    };
  }

  if (!session.slots.creative_candidates) {
    const assumptions = ensureAudienceAssumptions(session.slots);
    return {
      type: "candidate_review",
      message: "부족한 고객 정보는 가정으로 보완하고, 서로 다른 각도의 헤드라인 후보를 만들었습니다. 수정한 뒤 진행할 수 있습니다.",
      candidates: generateCreativeCandidates(addAssumptionsToSlots(session.slots, assumptions)),
      assumptions,
    };
  }

  const materialAssumptions = collectUnreviewedAssumptions(session.slots);
  if (materialAssumptions.length > 0) {
    return {
      type: "confirm_assumptions",
      message: "아래 가정을 시뮬레이션에 함께 사용합니다.",
      assumptions: materialAssumptions,
    };
  }

  const payload = buildCreativeTestingPayload(session);
  const errors = validateCreativeTestingPayload(payload);
  if (errors.length > 0) {
    return {
      type: "repair_input",
      message: errors[0]?.message ?? "입력값을 다시 확인해주세요.",
      fieldErrors: errors,
    };
  }

  return {
    type: "run_ready",
    message: "필요한 입력이 준비되었습니다. 이 조건으로 시뮬레이션을 시작할 수 있습니다.",
    payload,
    assumptions: collectAssumptions(session.slots),
    provenance: buildIntakeRunProvenance(session),
  };
}

function withPlannedAction(session: IntakeSession): IntakeSession {
  const prepared = materializeIntakeDefaults(session);
  const action = planPreparedAction(prepared);
  return {
    ...prepared,
    status: action.type === "run_ready" ? "ready" : action.type === "candidate_review" ? "reviewing" : "collecting",
    action,
    messages: action.type === "ask_question" || action.type === "show_form"
      ? appendAssistantMessage(prepared.messages, action.message)
      : prepared.messages,
  };
}

function appendAssistantMessage(messages: IntakeSession["messages"], content: string): IntakeSession["messages"] {
  const last = messages.at(-1);
  if (last?.role === "assistant" && last.content === content) return messages;
  return [...messages, { role: "assistant", content }];
}

function shouldShowCreativeForm(session: IntakeSession): boolean {
  if (session.slots.creative_candidates) return false;
  const hasAudience = asStringArray(session.slots.target_customers).length > 0;
  return !hasAudience;
}

function buildCreativeFormFields(session: IntakeSession): DynamicFormField[] {
  const requirements = creativeTestingPack.slots.filter((slot) =>
    creativeTestingPack.formFieldOrder.includes(slot.id),
  );
  return requirements
    .filter((requirement) => !hasCollectedValue(session.slots[requirement.id]))
    .map((requirement) => toFormField(requirement, session.slots[requirement.id]));
}

function toFormField(requirement: SlotRequirement, slot: IntakeSlotValue | undefined): DynamicFormField {
  const value = Array.isArray(slot?.value) || typeof slot?.value === "string" || typeof slot?.value === "number"
    ? slot.value
    : undefined;
  return {
    id: requirement.id,
    label: requirement.label,
    type: requirement.dataType,
    required: requirement.importance === "critical",
    value,
    source: slot?.source,
    placeholder: requirement.placeholder,
    helperText: requirement.helperText,
    options: requirement.options,
    minItems: requirement.minItems,
    recommendedItems: requirement.recommendedItems,
    allowAutoFill: requirement.canGenerate,
  };
}

function compactFormFields(requirements: SlotRequirement[]): SlotRequirement[] {
  const critical = requirements.filter((requirement) => requirement.importance === "critical");
  const recommended = requirements.filter((requirement) => requirement.importance === "recommended");
  const optional = requirements.filter((requirement) => requirement.importance === "optional");
  return [...critical, ...recommended.slice(0, Math.max(0, 3 - critical.length)), ...optional.slice(0, 1)];
}

function withObjectParticle(label: string): string {
  const last = label.trim().at(-1);
  if (!last) return label;
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return `${label}를`;
  return (code - 0xac00) % 28 === 0 ? `${label}를` : `${label}을`;
}

function questionHelpText(slotId: string): string {
  switch (slotId) {
    case "product_description":
      return "제품명, 판매 방식, 현재 가격대를 한 문장으로 알려주세요. 예: AI 리서치 SaaS 월 구독 상품입니다.";
    case "price_points":
      return "비교하고 싶은 가격 후보를 알려주세요. 예: 29,000원 / 39,000원 / 49,000원";
    case "product_context":
    case "product_concept":
      return "어떤 제품이나 서비스를 검증하려는지 한 문장으로 알려주세요.";
    default:
      return "아는 만큼만 짧게 알려주세요.";
  }
}

function summarizeFormSubmit(values: Record<string, string | string[] | number>): string {
  const filledCount = Object.values(values)
    .filter((value) => Array.isArray(value) ? value.length > 0 : String(value).trim().length > 0)
    .length;
  return filledCount > 0 ? "추가 정보를 반영했습니다." : "추가 정보 없이 후보 생성을 요청했습니다.";
}

function hasCollectedValue(slot: IntakeSlotValue | undefined): boolean {
  if (!slot) return false;
  if (Array.isArray(slot.value)) return slot.value.length > 0;
  if (typeof slot.value === "string") return slot.value.trim().length > 0;
  return slot.value !== null && slot.value !== undefined;
}

function hasEnoughCollectedValue(slot: IntakeSlotValue | undefined, requirement: SlotRequirement): boolean {
  if (!hasCollectedValue(slot)) return false;
  if (Array.isArray(slot?.value)) {
    return slot.value.length >= (requirement.minItems ?? 1);
  }
  return true;
}

function candidateTexts(slot: IntakeSlotValue | undefined): string[] {
  if (!Array.isArray(slot?.value)) return [];
  return slot.value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "text" in item) return String((item as { text?: unknown }).text ?? "");
      return "";
    })
    .map((item) => item.trim())
    .filter(Boolean);
}

function addAssumptionsToSlots(
  slots: Record<string, IntakeSlotValue>,
  assumptions: IntakeSlotValue[],
): Record<string, IntakeSlotValue> {
  return assumptions.reduce((nextSlots, assumption) => {
    const existing = asStringArray(nextSlots[assumption.slotId]);
    return upsertSlot(nextSlots, {
      ...assumption,
      value: [...existing, assumption.value].filter((value): value is string => typeof value === "string"),
    });
  }, slots);
}

function markAssumptionsReviewed(slots: Record<string, IntakeSlotValue>): Record<string, IntakeSlotValue> {
  return Object.fromEntries(
    Object.entries(slots).map(([key, slot]) => [
      key,
      slot.source === "generated" || slot.needsUserReview ? { ...slot, reviewed: true } : slot,
    ]),
  );
}

function collectUnreviewedAssumptions(slots: Record<string, IntakeSlotValue>): IntakeSlotValue[] {
  return collectAssumptions(slots).filter((slot) => slot.needsUserReview && !slot.reviewed);
}

function collectAssumptions(slots: Record<string, IntakeSlotValue>): IntakeSlotValue[] {
  return Object.values(slots).filter((slot) => slot.source === "generated" || slot.source === "inferred" || slot.source === "default");
}

function numericSlotValue(slot: IntakeSlotValue | undefined): number | null {
  if (!slot) return null;
  const value = typeof slot.value === "number" ? slot.value : Number(String(slot.value).replace(/[^\d]/g, ""));
  return Number.isFinite(value) ? value : null;
}
