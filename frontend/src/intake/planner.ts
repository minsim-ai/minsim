import { generateCreativeCandidates, ensureAudienceAssumptions } from "./candidateGenerator";
import { extractSlotsFromMessage, isValidOptionLabel, mergeFormValues, normalizeOptionLabels } from "./extractor";
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

/** Marks that the user already submitted/skipped the optional (secondaryAction) form. */
const OPTIONAL_FORM_DISMISSED_SLOT = "optional_form_dismissed";

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
    const currentForm = session.action?.type === "show_form" ? session.action.form : undefined;
    const formFields = currentForm?.fields;
    // Optional form (has 「넘어가기」) must stay dismissed after submit/skip.
    // Replanning used to re-open it because the guard only checked action===show_form.
    let slots = mergeFormValues(event.values, session.slots);
    if (currentForm?.secondaryAction) {
      slots = upsertSlot(
        slots,
        createSlot(
          OPTIONAL_FORM_DISMISSED_SLOT,
          currentForm.id,
          "user",
          1,
          "optional-form-dismissed",
          false,
        ),
      );
    }
    const next = {
      ...session,
      slots,
      messages: [
        ...session.messages,
        {
          role: "user" as const,
          content: summarizeFormSubmit(event.values, formFields),
        },
      ],
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

export function prepareIntakeSession(session: IntakeSession): IntakeSession {
  return withPlannedAction(session);
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

  // Sanitize multi-option slots that may still hold prose fragments from older sessions.
  session = sanitizeOptionSlots(session);

  const pack = getIntakePack(simulationType);
  const contaminatedItems = optionSlotContamination(session, pack.slots);
  if (contaminatedItems) {
    return {
      type: "repair_input",
      message: contaminatedItems.message,
      fieldErrors: contaminatedItems.fieldErrors,
    };
  }

  const missingFields = pack.slots
    .filter((requirement) => pack.formFieldOrder.includes(requirement.id))
    .filter((requirement) => !hasEnoughCollectedValue(session.slots[requirement.id], requirement));
  const missingCritical = missingFields.filter((requirement) => requirement.importance === "critical");
  const formId = `${pack.simulationType}_intake_v1`;
  const nextCritical = missingCritical[0];
  const hasPartialAnswerToCurrentQuestion = Boolean(
    nextCritical
    && hasCollectedValue(session.slots[nextCritical.id])
    && session.action?.type === "ask_question"
    && session.action.slotIds.includes(nextCritical.id),
  );

  // campus_priority historically chained two similar critical questions
  // (question then items). Skip the chat chain and go to the form.
  const skipChainedCriticalAsk =
    missingCritical.length >= 2 && simulationType === "campus_priority";

  if (
    nextCritical
    && session.turnCount <= 1
    && !hasPartialAnswerToCurrentQuestion
    && !skipChainedCriticalAsk
  ) {
    const target = nextCritical;
    return {
      type: "ask_question",
      message: askCriticalMessage(pack.label, target, session),
      slotIds: [target.id],
    };
  }

  if (missingFields.length > 0) {
    const optionalOnly = missingCritical.length === 0;
    const dismissedOptionalForm = asString(session.slots[OPTIONAL_FORM_DISMISSED_SLOT]).trim() === formId;
    const dismissingCurrentOptionalForm =
      optionalOnly
      && session.action?.type === "show_form"
      && session.action.form.id === formId;
    // After skip/submit of the optional form, never re-open it on replan.
    // (Bug: price_optimization asked the same optional form twice after 「넘어가기」.)
    if (optionalOnly && (dismissedOptionalForm || dismissingCurrentOptionalForm)) {
      return buildGenericRunReadyAction(session);
    }
    return {
      type: "show_form",
      message: optionalOnly
        ? `${pack.label}에 도움이 되는 선택 정보입니다. 모르면 「넘어가기」로 바로 진행할 수 있습니다.`
        : `${pack.label} 시뮬레이션에 필요한 정보를 입력해주세요. 모르는 선택 항목은 비워두고 넘어갈 수 있습니다.`,
      form: {
        id: formId,
        fields: compactFormFields(missingFields).map((requirement) => toFormField(requirement, session.slots[requirement.id])),
        primaryAction: "다음",
        secondaryAction: optionalOnly ? "넘어가기" : undefined,
      },
    };
  }

  return buildGenericRunReadyAction(session);
}

function sanitizeOptionSlots(session: IntakeSession): IntakeSession {
  const simulationType = session.taskFrame?.primarySimulationType;
  if (!simulationType || simulationType === "creative_testing") return session;
  const pack = getIntakePack(simulationType);
  let slots = session.slots;
  let changed = false;
  for (const requirement of pack.slots) {
    if (requirement.dataType !== "multi_text") continue;
    if (requirement.id !== "items" && requirement.id !== "options") continue;
    const current = slots[requirement.id];
    if (!current) continue;
    const raw = Array.isArray(current.value)
      ? current.value.map(String)
      : typeof current.value === "string"
        ? [current.value]
        : [];
    const normalized = normalizeOptionLabels(raw);
    if (normalized.length === 0) {
      if (raw.length > 0) {
        const rest = { ...slots };
        delete rest[requirement.id];
        slots = rest;
        changed = true;
      }
      continue;
    }
    if (JSON.stringify(normalized) !== JSON.stringify(raw.map((item) => String(item).trim()).filter(Boolean))) {
      slots = upsertSlot(
        slots,
        createSlot(requirement.id, normalized, current.source, current.confidence, current.evidence, current.needsUserReview),
      );
      changed = true;
    }
  }
  return changed ? { ...session, slots } : session;
}

function optionSlotContamination(
  session: IntakeSession,
  requirements: SlotRequirement[],
): { message: string; fieldErrors: { fieldId: string; message: string }[] } | null {
  for (const requirement of requirements) {
    if (requirement.dataType !== "multi_text") continue;
    if (requirement.id !== "items" && requirement.id !== "options") continue;
    const slot = session.slots[requirement.id];
    if (!slot) continue;
    const raw = Array.isArray(slot.value) ? slot.value.map(String) : typeof slot.value === "string" ? [slot.value] : [];
    if (raw.length === 0) continue;
    const bad = raw.filter((item) => !isValidOptionLabel(item));
    if (bad.length === 0) continue;
    const minItems = requirement.minItems ?? 2;
    const normalized = normalizeOptionLabels(raw);
    if (normalized.length >= minItems) continue;
    return {
      message: `${requirement.label}에 조사 설명 문장 조각이 섞여 있습니다. 짧은 후보 ${minItems}~${requirement.maxItems ?? 6}개만 줄바꿈으로 다시 적어주세요.`,
      fieldErrors: [{
        fieldId: requirement.id,
        message: "예: 학식 질 개선 / 심야 셔틀 / 스터디룸 증설 (설명 문장 전체 금지)",
      }],
    };
  }
  return null;
}

function buildGenericRunReadyAction(session: IntakeSession): IntakeAction {
  const materialAssumptions = collectUnreviewedAssumptions(session.slots);
  if (materialAssumptions.length > 0) {
    return {
      type: "confirm_assumptions",
      message: "아래 가정을 시뮬레이션에 함께 사용합니다.",
      assumptions: materialAssumptions,
    };
  }
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

function withSubjectParticle(label: string): string {
  const last = label.trim().at(-1);
  if (!last) return label;
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return `${label}이`;
  return (code - 0xac00) % 28 === 0 ? `${label}가` : `${label}이`;
}

function askCriticalMessage(
  packLabel: string,
  target: SlotRequirement,
  session: IntakeSession,
): string {
  // Options/items without the survey stem feel arbitrary — always restate the
  // already-collected question so users know what choices to write.
  if (target.id === "options") {
    const question = asString(session.slots.question).trim();
    if (question) {
      return [
        "지금 물을 설문 질문은 이거예요.",
        `「${truncateForPrompt(question, 220)}」`,
        "",
        "이 질문에 붙일 선택지 2~6개를 줄바꿈·쉼표·/ 로 적어주세요.",
        "예: 매우 관심 있음 / 관심 있음 / 보통 / 관심 없음 / 잘 모름",
      ].join("\n");
    }
    return "설문 선택지 2~6개를 줄바꿈·쉼표·/ 로 적어주세요. 질문이 아직 없다면 질문 한 줄도 함께 적어 주세요.";
  }
  if (target.id === "items") {
    const question = asString(session.slots.question).trim();
    if (question) {
      return [
        "우선순위를 물을 기준은 이거예요.",
        `「${truncateForPrompt(question, 220)}」`,
        "",
        "후보 항목 3~6개를 줄바꿈·쉼표·/ 로 적어주세요.",
        "예: 학식 질 개선 / 심야 셔틀 / 스터디룸 증설",
      ].join("\n");
    }
  }
  return `${withObjectParticle(packLabel)} 실행하려면 먼저 ${withSubjectParticle(target.label)} 필요합니다. ${questionHelpText(target.id)}`;
}

function truncateForPrompt(text: string, max: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, Math.max(0, max - 1)).trim()}…`;
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
    case "channels":
      return "비교할 홍보 채널을 2개 이상 적어주세요. 예: X(트위터) / 인스타그램 / 유튜브";
    case "messages":
      return "비교할 캠페인 문구를 2개 이상 적어주세요. 한 줄에 하나씩 적으면 됩니다.";
    case "question":
      return "예: 복지예산을 어디에 먼저 쓸까요? (긴 조사 설명 대신 한 줄 질문)";
    case "items":
      return "후보 3~6개를 줄바꿈·쉼표·/ 로 적어주세요. 예: 학식 질 개선 / 심야 셔틀 / 스터디룸 증설";
    case "options":
      return "선택지 2~6개를 줄바꿈·쉼표·/ 로 적어주세요. 설문 질문에 맞는 답 보기를 적으면 됩니다.";
    default:
      return "아는 만큼만 짧게 알려주세요.";
  }
}

function summarizeFormSubmit(
  values: Record<string, string | string[] | number>,
  fields?: DynamicFormField[],
): string {
  const labels = new Map((fields ?? []).map((field) => [field.id, field.label]));
  const lines = Object.entries(values)
    .map(([id, value]) => {
      const text = Array.isArray(value)
        ? value.map((item) => String(item).trim()).filter(Boolean).join(", ")
        : String(value ?? "").trim();
      if (!text) return null;
      const label = labels.get(id) ?? id;
      return `${label}: ${text}`;
    })
    .filter((line): line is string => Boolean(line));

  if (lines.length === 0) {
    return "추가 정보 없이 후보 생성을 요청했습니다.";
  }
  // Show what the user actually entered so the chat history remains reviewable.
  return lines.join("\n");
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
