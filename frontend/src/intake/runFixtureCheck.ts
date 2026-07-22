import { creativeTestingFixtures } from "./fixtures/creativeTestingFixtures";
import { simulationIntakeV2Fixtures } from "./fixtures/simulationIntakeV2Fixtures";
import { campaignStrategyFlowFixtures, simulationRoutingFixtures } from "./fixtures/simulationRoutingFixtures";
import { extractListedItems, normalizeOptionLabels } from "./extractor";
import { buildGenericSimulationPayload } from "./payloadBuilder";
import { advanceIntakeSession, createInitialIntakeSession, prepareIntakeSession } from "./planner";
import { createSlot } from "./slotUtils";
import type { IntakeEvaluationFixture } from "./fixtures/types";
import type { IntakeAction, IntakeSession } from "./types";
import { createProjectIntakeSession } from "../v2/projectIntake";
import type { ProjectResponse } from "../types/api";

export type IntakeFixtureCheckResult = {
  ok: boolean;
  failures: string[];
  checked: number;
};

export function runIntakeFixtureCheck(): IntakeFixtureCheckResult {
  const fixtures = [
    ...creativeTestingFixtures,
    ...simulationRoutingFixtures,
    ...campaignStrategyFlowFixtures,
    ...simulationIntakeV2Fixtures,
  ];
  const failures = fixtures.flatMap(checkFixture);
  failures.push(...checkV2Coverage(simulationIntakeV2Fixtures));
  failures.push(...checkPricePayloadRegression());
  failures.push(...checkPriceOptionalFormDoesNotLoop());
  failures.push(...checkSampleSizePolicy());
  failures.push(...checkProjectContextIntake());
  failures.push(...checkOpenSurveyOptionsShowQuestion());
  failures.push(...checkGeneratedGenericAssumptionReview());
  failures.push(...checkCampaignChannelClarification());
  failures.push(...checkCampusPriorityItemExtraction());
  failures.push(...checkCampusPriorityPlannerPolicy());
  return {
    ok: failures.length === 0,
    failures,
    checked: fixtures.length,
  };
}

function checkOpenSurveyOptionsShowQuestion(): string[] {
  const failures: string[] = [];
  const project: ProjectResponse = {
    project_id: "open-survey-fixture",
    user_id: "user-fixture",
    name: "DGIST 정치성향 파악",
    description: "DGIST 학생들의 정치성향(지지 정당)을 파악하기 위한 설문 프로젝트입니다.",
    kind: "poll",
    product_context: {
      product_description:
        "본 프로젝트는 DGIST 학생들이 어떤 정당을 지지하는지 조사합니다.",
    },
    features: [],
    prices: [],
    target_notes: "",
    alternatives: [],
    created_at: "2026-07-22T00:00:00Z",
    updated_at: "2026-07-22T00:00:00Z",
    archived_at: null,
  };
  const session = createProjectIntakeSession(project, "open_survey");
  if (session.action?.type !== "ask_question" || !session.action.slotIds.includes("options")) {
    failures.push(
      `open_survey options: expected first ask for options after prefilled question, got ${JSON.stringify(session.action)}`,
    );
    return failures;
  }
  const message = session.action.message;
  if (!message.includes("설문 질문") && !message.includes("「")) {
    failures.push("open_survey options: assistant must restate the survey question before asking for options");
  }
  if (!message.includes("정치성향") && !message.includes(String(session.slots.question?.value ?? ""))) {
    failures.push("open_survey options: restated question must include project/survey stem");
  }
  if (!message.includes("선택지")) {
    failures.push("open_survey options: message must still request options");
  }
  return failures;
}

function checkCampusPriorityItemExtraction(): string[] {
  const failures: string[] = [];
  const welfareProse =
    "대학 내 복지 항목(학생 할인 혜택, 기숙사 환경 개선, 건강 검진 지원, 심리 상담 서비스, 취업 지원 프로그램 등)에 대한 수요 및 우선순위를 파악하기 위한 조사입니다. 예산 편성 및 정책 개선을 위해 가장 시급한 항목을 선정합니다.";
  const recovered = extractListedItems(welfareProse);
  const expected = ["학생 할인 혜택", "기숙사 환경 개선", "건강 검진 지원", "심리 상담 서비스", "취업 지원 프로그램"];
  if (JSON.stringify(recovered) !== JSON.stringify(expected)) {
    failures.push(`campus_priority extraction: parenthetical recovery failed, got ${JSON.stringify(recovered)}`);
  }
  const contaminated = [
    "대학 내 복지 항목(학생 할인 혜택",
    "기숙사 환경 개선",
    "건강 검진 지원",
    "심리 상담 서비스",
    "취업 지원 프로그램 등)에 대한 수요 및 우선순위를 파악하기 위한 조사입니다. 예산 편성 및 정책 개선을 위해 가장 시급한 항목을 선정합니다.",
  ];
  const normalized = normalizeOptionLabels(contaminated);
  if (JSON.stringify(normalized) !== JSON.stringify(expected)) {
    failures.push(`campus_priority extraction: normalize must recover clean labels from contamination, got ${JSON.stringify(normalized)}`);
  }
  const spaceList = extractListedItems("어린이집 현금 공중화장실");
  if (spaceList.length < 3) {
    failures.push(`campus_priority extraction: space-separated short labels failed, got ${JSON.stringify(spaceList)}`);
  }
  return failures;
}

function checkCampusPriorityPlannerPolicy(): string[] {
  const failures: string[] = [];
  const project: ProjectResponse = {
    project_id: "welfare-project-fixture",
    user_id: "user-fixture",
    name: "복지 항목 우선순위 조사",
    description: "학생·교직원 복지 우선순위를 정합니다.",
    kind: "poll" as const,
    product_context: {},
    features: ["학식 질 개선", "심야 셔틀", "스터디룸 증설", "헬스장 확충"],
    prices: [],
    target_notes: "",
    alternatives: [],
    created_at: "2026-07-21T00:00:00Z",
    updated_at: "2026-07-21T00:00:00Z",
    archived_at: null,
  };
  const initial = createProjectIntakeSession(project, "campus_priority");
  if (initial.slots.question?.value !== project.description) {
    failures.push(`campus_priority planner: project should prefill question, got ${String(initial.slots.question?.value)}`);
  }
  if (JSON.stringify(initial.slots.items?.value) !== JSON.stringify(project.features)) {
    failures.push(`campus_priority planner: project features should prefill items, got ${JSON.stringify(initial.slots.items?.value)}`);
  }
  // Two criticals missing → form immediately (not two chained ask_question).
  const bare = advanceIntakeSession(createInitialIntakeSession(), {
    type: "user_message",
    content: "복지예산 우선순위를 정하고 싶어요",
    selectedSimulationType: "campus_priority",
  });
  if (bare.action?.type === "ask_question" && bare.action.slotIds.length === 1) {
    // first critical ask is ok only when exactly one critical is missing
  } else if (bare.action?.type === "show_form") {
    // preferred when both criticals missing
  } else if (bare.action?.type !== "ask_question") {
    failures.push(`campus_priority planner: expected ask_question or show_form, got ${bare.action?.type}`);
  }
  // Contaminated items must not become run_ready payload.
  const dirty = prepareIntakeSession({
    ...createInitialIntakeSession(),
    taskFrame: {
      taskId: "campus-priority-dirty",
      userGoal: "복지 우선순위",
      decisionQuestion: "어디에 먼저?",
      likelySimulationTypes: ["campus_priority"],
      primarySimulationType: "campus_priority",
      preSimulationActions: [],
      confidence: 0.99,
      evidence: ["fixture"],
    },
    slots: {
      question: createSlot("question", "복지예산을 어디에 먼저 쓸까요?", "user", 0.99),
      items: createSlot(
        "items",
        [
          "대학 내 복지 항목(학생 할인 혜택",
          "기숙사 환경 개선",
          "건강 검진 지원",
          "심리 상담 서비스",
          "취업 지원 프로그램 등)에 대한 수요 및 우선순위를 파악하기 위한 조사입니다. 예산 편성 및 정책 개선을 위해 가장 시급한 항목을 선정합니다.",
        ],
        "user",
        0.99,
      ),
    },
  });
  if (dirty.action?.type === "run_ready") {
    const items = (dirty.action.payload.input as { items?: string[] }).items ?? [];
    const hasProse = items.some((item) => item.includes("파악하기") || item.includes("조사입니다") || item.includes("(") && !item.includes(")"));
    if (hasProse) {
      failures.push(`campus_priority planner: run_ready must not ship prose fragment items, got ${JSON.stringify(items)}`);
    }
  }
  // Parenthetical recovery path should reach run_ready / confirm with clean items.
  if (dirty.action?.type === "run_ready" || dirty.action?.type === "confirm_assumptions") {
    const payload = dirty.action.type === "run_ready"
      ? dirty.action.payload
      : buildGenericSimulationPayload(dirty);
    const items = (payload.input as { items?: string[] }).items ?? [];
    if (items.length < 3 || items.some((item) => item.length > 40)) {
      failures.push(`campus_priority planner: recovered items still invalid ${JSON.stringify(items)}`);
    }
  }
  return failures;
}

function checkCampaignChannelClarification(): string[] {
  const project: ProjectResponse = {
    project_id: "campaign-project-fixture",
    user_id: "user-fixture",
    name: "캠페인 테스트",
    description: "새 서비스의 캠페인 전략을 정합니다.",
    kind: 'venture' as const,
    product_context: { product_description: "새 구독형 서비스" },
    features: [],
    prices: [],
    target_notes: "",
    alternatives: [],
    created_at: "2026-07-13T00:00:00Z",
    updated_at: "2026-07-13T00:00:00Z",
    archived_at: null,
  };
  const initial = createProjectIntakeSession(project, "campaign_strategy");
  const afterOneChannel = advanceIntakeSession(initial, {
    type: "user_message",
    content: "x.com",
    selectedSimulationType: "campaign_strategy",
  });
  const failures: string[] = [];

  if (initial.action?.type !== "ask_question" || !initial.action.message.includes("2개 이상")) {
    failures.push("campaign channel clarification: initial question must explain that two or more placements are needed");
  }
  if (initial.action?.type === "ask_question" && initial.action.message.includes("채널 후보")) {
    failures.push("campaign channel clarification: user-facing question must not expose the internal '채널 후보' label");
  }
  if (JSON.stringify(afterOneChannel.slots.channels?.value) !== JSON.stringify(["x.com"])) {
    failures.push(`campaign channel clarification: expected x.com to be preserved, got ${JSON.stringify(afterOneChannel.slots.channels?.value)}`);
  }
  if (afterOneChannel.action?.type !== "show_form") {
    failures.push(`campaign channel clarification: a partial channel answer must continue in the structured form, got ${afterOneChannel.action?.type}`);
  } else {
    const channelField = afterOneChannel.action.form.fields.find((field) => field.id === "channels");
    if (channelField?.label !== "캠페인을 보여줄 곳" || channelField.minItems !== 2) {
      failures.push(`campaign channel clarification: structured field must explain the channel choice, got ${JSON.stringify(channelField)}`);
    }
  }
  return failures;
}

function checkProjectContextIntake(): string[] {
  const baseProject: ProjectResponse = {
    project_id: "project-fixture",
    user_id: "user-fixture",
    name: "사주·점성술 앱",
    description: "사주앱을 쓰는 사람은 어떤 사람들일까",
    kind: 'venture' as const,
    product_context: { product_description: "오늘의 운세와 궁합을 제공하는 구독형 사주 앱" },
    features: ["오늘의 운세", "궁합"],
    prices: [],
    target_notes: "20~50대 모바일 사용자",
    alternatives: [],
    created_at: "2026-07-13T00:00:00Z",
    updated_at: "2026-07-13T00:00:00Z",
    archived_at: null,
  };
  const market = createProjectIntakeSession(baseProject, "market_segmentation");
  const churn = createProjectIntakeSession({
    ...baseProject,
    name: "어르신 동반 강아지 로봇",
    description: "무료 체험 뒤 재구독률이 낮아지고 있습니다.",
    kind: 'venture' as const,
    product_context: { product_description: "어르신 말벗 로봇 월 구독 서비스" },
  }, "churn_prediction");
  const failures: string[] = [];
  const genericQuestion = "어떤 결정을 돕고 싶으신가요? 제품, 캠페인, 가격, 메시지 고민을 편하게 적어주세요.";

  if (market.messages.some((message) => message.content === genericQuestion)) {
    failures.push("project intake: must not repeat the generic decision question");
  }
  if (market.slots.category?.value !== baseProject.name || market.slots.category?.source !== "user") {
    failures.push("project intake: market category must reuse user-owned project context");
  }
  if (market.action?.type === "ask_question" && market.action.slotIds.includes("category")) {
    failures.push("project intake: must not ask for a saved market category again");
  }
  if (churn.action?.type !== "ask_question" || !churn.action.slotIds.includes("trigger_event") || churn.action.slotIds.includes("service_name")) {
    failures.push(`project intake: churn should reuse service name and ask the next missing question, got ${churn.action?.type}`);
  }
  if (churn.messages.some((message) => message.content.includes("트리거이"))) {
    failures.push("project intake: Korean subject particle must be grammatically correct");
  }
  return failures;
}
function checkGeneratedGenericAssumptionReview(): string[] {
  const session = prepareIntakeSession({
    ...createInitialIntakeSession(),
    taskFrame: {
      taskId: "startup-assumption-review",
      userGoal: "반려견 구독 플랫폼을 검증합니다.",
      decisionQuestion: "시장을 검증합니다.",
      likelySimulationTypes: ["startup_item_validation"],
      primarySimulationType: "startup_item_validation",
      preSimulationActions: [],
      confidence: 0.99,
      evidence: ["fixture"],
    },
    slots: {
      item_description: createSlot("item_description", "반려견 용품 정기배송 플랫폼", "user", 0.99),
      problem_statement: createSlot("problem_statement", "용품을 매번 고르는 불편", "generated", 0.6),
      key_features: createSlot("key_features", ["맞춤 추천"], "user", 0.99),
      alternatives: createSlot("alternatives", ["오프라인 매장"], "user", 0.99),
      target_customers: createSlot("target_customers", ["20~40대 애견인"], "user", 0.99),
    },
  });
  const failures: string[] = [];
  if (session.action?.type !== "confirm_assumptions") {
    failures.push(`generic assumptions: expected confirm_assumptions, got ${session.action?.type}`);
    return failures;
  }
  const reviewed = advanceIntakeSession(session, { type: "confirm_assumptions" });
  if (reviewed.action?.type !== "run_ready") {
    failures.push(`generic assumptions: expected run_ready after confirmation, got ${reviewed.action?.type}`);
  }
  if (buildGenericSimulationPayload(reviewed).intake_context?.safe_intake_summary.unreviewed_assumption_count !== 0) {
    failures.push("generic assumptions: reviewed payload must report no unreviewed assumptions");
  }
  return failures;
}

function checkSampleSizePolicy(): string[] {
  const first = advanceIntakeSession(createInitialIntakeSession(), {
    type: "user_message",
    content: "AI 리서치 SaaS의 헤드라인 두 개를 10명에게 비교하고 싶어요.\nA안: 빠른 고객 검증\nB안: 한국형 합성 패널",
    selectedSimulationType: "creative_testing",
  });
  if (first.action?.type !== "repair_input") {
    return [`sample size policy: expected repair_input for 10, got ${first.action?.type}`];
  }
  const count = first.slots.sample_size?.value;
  if (count !== 10) {
    return [`sample size policy: provenance must preserve requested 10, got ${String(count)}`];
  }
  return [];
}

function checkPricePayloadRegression(): string[] {
  const session: IntakeSession = {
    ...createInitialIntakeSession(),
    status: "ready",
    taskFrame: {
      taskId: "price_optimization",
      userGoal: "아라베스크 가격요금제 고민",
      decisionQuestion: "가격 후보를 비교합니다.",
      likelySimulationTypes: ["price_optimization"],
      primarySimulationType: "price_optimization",
      preSimulationActions: [],
      confidence: 0.99,
      evidence: ["fixture"],
    },
    slots: {
      product_description: createSlot("product_description", "아라베스크라는 가상 페르소나 분석 SaaS", "user", 0.99),
      price_points: createSlot("price_points", ["월 5만원", "10만원", "15만원"], "user", 0.99),
      sample_size: createSlot("sample_size", 50, "user", 0.99),
      target_customers: createSlot("target_customers", ["B2B 제품 구매 담당자"], "user", 0.99),
    },
  };
  const payload = buildGenericSimulationPayload(session);
  const failures: string[] = [];
  const input = payload.input as { price_points?: number[] };
  if (JSON.stringify(input.price_points) !== JSON.stringify([50000, 100000, 150000])) {
    failures.push(`price payload regression: expected Korean amount units to parse as 50000/100000/150000, got ${JSON.stringify(input.price_points)}`);
  }
  if (payload.sample_size !== 50) {
    failures.push(`price payload regression: expected numeric sample_size 50, got ${payload.sample_size}`);
  }
  if (payload.target_filter?.age_min !== undefined || payload.target_filter?.age_max !== undefined) {
    failures.push(`price payload regression: price candidates leaked into age filter ${JSON.stringify(payload.target_filter)}`);
  }
  return failures;
}

function checkPriceOptionalFormDoesNotLoop(): string[] {
  const first = advanceIntakeSession(createInitialIntakeSession(), {
    type: "user_message",
    content: "저는 제 서비스의 가격을 정하지 못했어요.",
    selectedSimulationType: "price_optimization",
  });
  const collected = advanceIntakeSession(first, {
    type: "user_message",
    content: "AI 실무 코치, 직장인이 자기 업무 자료로 30분짜리 AI 실습을 만들고 결과물까지 완성하는 구독형 학습 서비스\n가격대: 9900, 14900, 19900, 29900원",
    selectedSimulationType: "price_optimization",
  });
  const submittedOptionalBlank = advanceIntakeSession(collected, {
    type: "form_submit",
    values: {},
  });
  const repeatedMessage = "가격 최적화 시뮬레이션에 필요한 정보를 입력해주세요. 모르는 항목은 비워두고 나중에 보완할 수 있습니다.";
  const repeatCount = submittedOptionalBlank.messages.filter((message) => message.content === repeatedMessage).length;
  const failures: string[] = [];

  if (collected.action?.type !== "show_form") {
    failures.push(`price optional form loop: expected collected session to show optional form, got ${collected.action?.type}`);
  }
  if (submittedOptionalBlank.action?.type !== "run_ready") {
    failures.push(`price optional form loop: expected blank optional submit to become run_ready, got ${submittedOptionalBlank.action?.type}`);
  }
  if (repeatCount > 1) {
    failures.push(`price optional form loop: expected form prompt at most once, got ${repeatCount}`);
  }
  return failures;
}

function checkV2Coverage(fixtures: IntakeEvaluationFixture[]): string[] {
  const requiredCategories = new Set([
    "goal_only",
    "partial",
    "complete",
    "ambiguous",
    "messy",
    "invalid",
    "auto_generate",
    "assumption_review",
  ]);
  const bySimulation = fixtures.reduce<Record<string, Set<string>>>((acc, fixture) => {
    const simulationType = fixture.expectedSimulationType ?? fixture.id.replace(/-(goal-only|partial|complete|ambiguous|messy|invalid|auto-generate|assumption-review)-v2$/, "");
    if (!simulationType || !fixture.category) return acc;
    acc[simulationType] = acc[simulationType] ?? new Set<string>();
    acc[simulationType].add(fixture.category);
    return acc;
  }, {});
  return Object.entries(bySimulation).flatMap(([simulationType, categories]) =>
    [...requiredCategories]
      .filter((category) => !categories.has(category))
      .map((category) => `${simulationType}: missing intake v2 fixture category ${category}`),
  );
}

function checkFixture(fixture: IntakeEvaluationFixture): string[] {
  const finalSession = fixture.events.reduce<IntakeSession>(
    (session, event) => advanceIntakeSession(session, event),
    createInitialIntakeSession(),
  );
  const action = finalSession.action;
  const failures: string[] = [];

  if (!action) {
    return [`${fixture.id}: missing final action`];
  }
  if (action.type !== fixture.expectedAction) {
    failures.push(`${fixture.id}: expected action ${fixture.expectedAction}, got ${action.type}`);
  }
  if (
    fixture.expectedSimulationType &&
    finalSession.taskFrame?.primarySimulationType !== fixture.expectedSimulationType
  ) {
    failures.push(
      `${fixture.id}: expected simulation ${fixture.expectedSimulationType}, got ${finalSession.taskFrame?.primarySimulationType}`,
    );
  }
  if (fixture.expectedSlotIds && !containsSlotIds(action, fixture.expectedSlotIds)) {
    failures.push(`${fixture.id}: expected slot ids ${fixture.expectedSlotIds.join(", ")}`);
  }
  if (action.type === "candidate_review") {
    const count = action.candidates.length;
    if (fixture.minCandidates && count < fixture.minCandidates) {
      failures.push(`${fixture.id}: expected at least ${fixture.minCandidates} candidates, got ${count}`);
    }
    if (fixture.maxCandidates && count > fixture.maxCandidates) {
      failures.push(`${fixture.id}: expected at most ${fixture.maxCandidates} candidates, got ${count}`);
    }
  }
  if (action.type === "run_ready") {
    if (
      fixture.expectedPayloadSimulationType &&
      action.payload.simulation_type !== fixture.expectedPayloadSimulationType
    ) {
      failures.push(
        `${fixture.id}: expected payload simulation ${fixture.expectedPayloadSimulationType}, got ${action.payload.simulation_type}`,
      );
    }
    const input = action.payload.input;
    if (fixture.expectedPayloadFields) {
      for (const field of fixture.expectedPayloadFields) {
        if (typeof input !== "object" || input === null || !(field in input)) {
          failures.push(`${fixture.id}: run payload missing ${field}`);
        }
      }
    }
    const creatives = typeof input === "object" && "creatives" in input && Array.isArray(input.creatives)
      ? input.creatives
      : [];
    if (action.payload.simulation_type === "creative_testing" && creatives.length < 2) {
      failures.push(`${fixture.id}: run payload has fewer than 2 creatives`);
    }
  }
  return failures;
}

function containsSlotIds(action: IntakeAction, slotIds: string[]): boolean {
  if (action.type !== "ask_question") return false;
  return slotIds.every((slotId) => action.slotIds.includes(slotId));
}
