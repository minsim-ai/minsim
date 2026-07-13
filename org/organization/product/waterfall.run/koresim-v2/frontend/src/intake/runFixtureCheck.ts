import { creativeTestingFixtures } from "./fixtures/creativeTestingFixtures";
import { simulationIntakeV2Fixtures } from "./fixtures/simulationIntakeV2Fixtures";
import { campaignStrategyFlowFixtures, simulationRoutingFixtures } from "./fixtures/simulationRoutingFixtures";
import { buildGenericSimulationPayload } from "./payloadBuilder";
import { advanceIntakeSession, createInitialIntakeSession } from "./planner";
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
  failures.push(...checkCampaignChannelClarification());
  return {
    ok: failures.length === 0,
    failures,
    checked: fixtures.length,
  };
}

function checkCampaignChannelClarification(): string[] {
  const project: ProjectResponse = {
    project_id: "campaign-project-fixture",
    user_id: "user-fixture",
    name: "캠페인 테스트",
    description: "새 서비스의 캠페인 전략을 정합니다.",
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
