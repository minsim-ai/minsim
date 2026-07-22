import type { SimulationType } from "../../types/api";
import type { IntakeEvaluationFixture } from "./types";

type CaseSpec = {
  goal: string;
  ambiguousGoal: string;
  messyGoal: string;
  fullValues: Record<string, string | string[] | number>;
  partialValues: Record<string, string | string[] | number>;
  invalidValues: Record<string, string | string[] | number>;
  payloadFields: string[];
};

const caseSpecs: Record<SimulationType, CaseSpec> = {
  startup_item_validation: {
    goal: "창업 아이템을 검증하고 싶어요.",
    ambiguousGoal: "아이템 시장성도 보고 니즈와 경쟁도 같이 확인하고 싶어요.",
    messyGoal:
      "창업 아이템인 뇌파 수면 머리띠를 검증하고 싶어요. 기능은 뇌파 유도, 수면 리포트. 대안은 멜라토닌, 수면 앱입니다.",
    fullValues: {
      item_description: "잠이 잘 오게 하는 뇌파 생성 수면 머리띠",
      problem_statement: "입면에 30분 이상 걸리는 사람들의 수면 진입 문제",
      key_features: ["뇌파 유도 사운드", "수면 리포트"],
      alternatives: ["멜라토닌 보조제", "수면 유도 앱"],
      price_hint: "129,000원",
      target_customers: ["수면 고민이 있는 직장인"],
    },
    partialValues: { item_description: "뇌파 생성 수면 머리띠" },
    invalidValues: { item_description: "머리띠" },
    payloadFields: ["item_name", "item_description", "problem_statement"],
  },
  creative_testing: {
    goal: "상세페이지 헤드라인을 테스트하고 싶어요.",
    ambiguousGoal: "우리 제품 장점을 어떻게 말할지 모르겠고 문구도 테스트하고 싶어요.",
    messyGoal: "헤드라인 후보입니다. 제품은 AI 리서치 SaaS고요\nA. 출시 전 한국 고객 반응 검증\nB. 시장조사를 몇 분 만에\nC. 100만 페르소나로 빠르게",
    fullValues: {
      product_description: "한국 고객 반응을 출시 전에 검증하는 AI 리서치 SaaS",
      target_customers: ["B2B 마케터", "신제품 PM"],
      creative_candidates: ["출시 전 시장 반응을 먼저 확인하세요", "한국 고객의 목소리로 캠페인을 검증하세요"],
    },
    partialValues: { product_description: "한국 고객 반응 검증 SaaS" },
    invalidValues: { product_description: "AI 리서치 SaaS", creative_candidates: ["하나뿐인 헤드라인"] },
    payloadFields: ["creatives"],
  },
  price_optimization: {
    goal: "가격을 얼마로 해야 할까요?",
    ambiguousGoal: "가격도 정하고 출시 반응도 같이 보고 싶어요.",
    messyGoal: "요금제 후보가 29,000원 / 39,000원 / 49,000원인데 B2B 마케터 대상입니다.",
    fullValues: {
      product_description: "AI 리서치 SaaS 월 구독 상품",
      price_points: ["29000", "39000", "49000"],
      purchase_context: "팀 단위로 월 구독을 검토하는 상황",
      target_customers: ["B2B 마케터", "신제품 PM"],
      competitor_prices: ["월 49000원 경쟁 SaaS", "월 99000원 리서치 툴"],
    },
    partialValues: { product_description: "AI 리서치 SaaS 월 구독 상품" },
    invalidValues: { product_description: "AI 리서치 SaaS", price_points: ["무료"] },
    payloadFields: ["product_name", "product_description", "price_points"],
  },
  product_launch: {
    goal: "신제품 출시 반응을 보고 싶어요.",
    ambiguousGoal: "신제품 컨셉이 먹힐지와 메시지를 같이 보고 싶어요.",
    messyGoal: "출시 전, AI 조사 도구. 기능은 페르소나 시뮬레이션, 리포트 자동화, 팀 공유입니다.",
    fullValues: {
      product_concept: "한국 소비자 페르소나로 출시 전 반응을 예측하는 SaaS",
      target_use_case: "신제품 출시 전 컨셉 검증",
      key_features: ["페르소나 응답", "자동 리포트", "세그먼트 비교"],
      target_customers: ["PM", "마케터"],
    },
    partialValues: { product_concept: "한국 소비자 페르소나 반응 예측 SaaS" },
    invalidValues: { product_concept: "SaaS" },
    payloadFields: ["product_concept", "target_use_case", "key_features"],
  },
  value_proposition: {
    goal: "우리 제품 장점을 어떻게 말해야 할까요?",
    ambiguousGoal: "장점 정리도 하고 광고 문구도 비교하고 싶어요.",
    messyGoal: "장점 후보: 빠름, 저렴함, 한국 데이터 기반. 고객은 스타트업 PM입니다.",
    fullValues: {
      product_context: "출시 전 한국 고객 반응을 검증하는 AI 리서치 SaaS",
      statements: ["시장조사를 며칠이 아니라 몇 분 만에", "한국 고객 반응을 출시 전에 검증"],
      target_customers: ["스타트업 PM", "B2B 마케터"],
      pain_points: ["출시 전 검증 비용이 높음", "조사 리포트 작성 시간이 김"],
    },
    partialValues: { product_context: "AI 리서치 SaaS" },
    invalidValues: { product_context: "AI 리서치 SaaS", statements: ["빠르다"] },
    payloadFields: ["product_context", "statements"],
  },
  market_segmentation: {
    goal: "고객군을 나누고 싶어요.",
    ambiguousGoal: "타겟 세그먼트도 찾고 브랜드 이미지도 보고 싶어요.",
    messyGoal: "카테고리: AI 리서치 툴. 구매 기준, 예산 민감도, 자동화 니즈로 나누고 싶습니다.",
    fullValues: {
      category: "AI 리서치 SaaS",
      core_questions: ["구매 기준은 무엇인가요?", "자동화 니즈가 강한 고객은 누구인가요?"],
      product_family: "B2B 리서치 자동화 도구",
      known_behaviors: ["시장조사 외주 경험", "신제품 출시 전 검증"],
    },
    partialValues: { category: "AI 리서치 SaaS" },
    invalidValues: { category: "", core_questions: [] },
    payloadFields: ["category", "core_questions"],
  },
  competitive_positioning: {
    goal: "경쟁사 대비 포지션을 알고 싶어요.",
    ambiguousGoal: "경쟁사와 비교하면서 브랜드 이미지도 보고 싶어요.",
    messyGoal: "경쟁 제품은 서베이몽키, 타입폼, 자체 FGI입니다. 기준은 속도, 비용, 한국 적합도.",
    fullValues: {
      category_context: "시장조사와 고객 반응 검증 도구",
      products: ["KoreaSim", "SurveyMonkey", "Typeform"],
      attributes: ["속도", "비용", "한국 데이터 적합도", "리포트 품질"],
      target_customers: ["B2B 마케터", "PM"],
    },
    partialValues: { category_context: "시장조사 도구" },
    invalidValues: { category_context: "시장조사 도구", products: ["KoreaSim"] },
    payloadFields: ["category_context", "products", "attributes"],
  },
  brand_perception: {
    goal: "브랜드 이미지가 어떤지 보고 싶어요.",
    ambiguousGoal: "브랜드 이미지와 경쟁 포지션을 같이 보고 싶어요.",
    messyGoal: "브랜드명 KoreaSim, 카테고리 AI 리서치. 혁신적/신뢰/비싸 보임을 보고 싶습니다.",
    fullValues: {
      brand_name: "KoreaSim",
      category: "AI 리서치 SaaS",
      attributes: ["혁신적", "신뢰감", "비용 효율", "전문성"],
      comparison_brands: ["SurveyMonkey", "Typeform"],
    },
    partialValues: { brand_name: "KoreaSim" },
    invalidValues: { brand_name: "KoreaSim", category: "AI 리서치", attributes: ["혁신적"] },
    payloadFields: ["brand_name", "category", "attributes"],
  },
  churn_prediction: {
    goal: "고객이 떠날지 보고 싶어요.",
    ambiguousGoal: "가격 인상 후 이탈과 가격 반응을 같이 보고 싶어요.",
    messyGoal: "서비스는 팀 구독 SaaS, 가격 인상 예정, 경쟁사는 무료 체험을 줍니다.",
    fullValues: {
      service_name: "KoreaSim Pro",
      current_situation: "월 구독 가격을 20% 인상하려는 상황",
      trigger_event: "가격 인상 공지",
      competitor_offer: "경쟁사가 3개월 무료 체험 제공",
      affected_customers: ["소규모 마케팅팀", "초기 스타트업"],
    },
    partialValues: { service_name: "KoreaSim Pro" },
    invalidValues: { service_name: "KoreaSim Pro", current_situation: "" },
    payloadFields: ["service_name", "current_situation", "trigger_event"],
  },
  campaign_strategy: {
    goal: "캠페인 전략을 짜고 싶어요.",
    ambiguousGoal: "캠페인 메시지와 채널 조합을 둘 다 보고 싶어요.",
    messyGoal: "제품은 AI 리서치 SaaS. 채널: 네이버, 링크드인. 메시지: 출시 전 검증, 빠른 리포트.",
    fullValues: {
      product_context: "AI 리서치 SaaS를 B2B 마케터에게 알리는 캠페인",
      channels: ["네이버 검색", "링크드인", "뉴스레터"],
      messages: ["출시 전 시장 반응을 검증하세요", "한국 고객 리포트를 몇 분 만에"],
      budget: 5000000,
      campaign_objective: "무료 데모 신청",
    },
    partialValues: { product_context: "AI 리서치 SaaS 캠페인" },
    invalidValues: { product_context: "AI 리서치 SaaS", channels: ["네이버"], messages: ["빠른 리포트"] },
    payloadFields: ["product_context", "channels", "messages"],
  },
  campus_policy: {
    goal: "도서관 24시간 개방에 학생들이 찬성할까요?",
    ambiguousGoal: "도서관 운영 시간을 바꾸려는데 반응도 보고 비용 부담도 같이 확인하고 싶어요.",
    messyGoal:
      "중앙도서관 24시간 개방 찬반을 보고 싶어요. 지금은 평일 09-23시 운영이고, 1층만 24시간 열 계획입니다. 연 1.2억이 더 듭니다.",
    fullValues: {
      agenda: "중앙도서관 24시간 개방",
      current_state: "평일 09-23시, 주말 10-18시 운영. 시험기간만 익일 02시까지 연장.",
      proposed_change: "1층 열람실과 그룹스터디존만 연중 24시간 개방. 2-4층 서고는 기존 시간 유지.",
      tradeoffs: "연간 운영비 약 1.2억 증가. 재원은 학생회비 인상 또는 타 복지예산 삭감 중 택일.",
      condition_taxonomy: ["학생 부담 없는 재원", "야간 안전 대책", "타 예산 삭감 허용", "시범 운영 후 재평가"],
    },
    partialValues: { agenda: "중앙도서관 24시간 개방" },
    invalidValues: { agenda: "도서관" },
    payloadFields: ["agenda", "current_state", "proposed_change"],
  },
  campus_priority: {
    goal: "복지 항목들의 우선순위를 매겨주세요.",
    ambiguousGoal: "무엇부터 해야 할지도 정하고 학생들 만족도도 같이 보고 싶어요.",
    messyGoal:
      "우선순위를 순위로 매겨주세요. 학식 질 개선, 심야 셔틀 신설, 스터디룸 증설, 헬스장 확충 중에서요.",
    fullValues: {
      question: "복지예산을 어디에 먼저 쓸까요?",
      items: ["학식 질 개선", "심야 셔틀 신설", "스터디룸 증설", "헬스장 확충"],
      context: "총 1억 원. 올해 안에 하나만 집행 가능.",
    },
    partialValues: { question: "복지예산을 어디에 먼저 쓸까요?" },
    invalidValues: { question: "예산", items: ["하나만"] },
    payloadFields: ["question", "items"],
  },
  open_survey: {
    goal: "객관식으로 직접 물어보고 싶어요.",
    ambiguousGoal: "직접 문항도 만들고 반응도 보고 싶어요.",
    messyGoal:
      "제가 만든 문항으로 물어보고 싶어요. 가을 축제를 금요일 저녁, 토요일 오후, 토요일 저녁 중 언제 열지요.",
    fullValues: {
      question: "가을 축제를 언제 여는 게 좋을까요?",
      options: ["금요일 저녁", "토요일 오후", "토요일 저녁"],
      context: "본가가 먼 학생은 주말에 캠퍼스에 남는다.",
    },
    partialValues: { question: "가을 축제를 언제 여는 게 좋을까요?" },
    invalidValues: { question: "축제", options: ["하나만"] },
    payloadFields: ["question", "options"],
  },
};

export const simulationIntakeV2Fixtures: IntakeEvaluationFixture[] = Object.entries(caseSpecs).flatMap(
  ([simulationType, spec]) => {
    const typedSimulation = simulationType as SimulationType;
    return [
      {
        id: `${simulationType}-goal-only-v2`,
        title: `${simulationType} goal-only asks for the first critical slot`,
        category: "goal_only",
        events: [{ type: "user_message", content: spec.goal, selectedSimulationType: typedSimulation }],
        expectedAction:
          typedSimulation === "creative_testing" || typedSimulation === "campus_priority"
            ? "show_form"
            : "ask_question",
        expectedSimulationType: typedSimulation,
      },
      {
        id: `${simulationType}-partial-v2`,
        title: `${simulationType} partial input keeps collecting`,
        category: "partial",
        events: [
          { type: "user_message", content: spec.goal, selectedSimulationType: typedSimulation },
          { type: "form_submit", values: spec.partialValues },
        ],
        expectedAction: typedSimulation === "creative_testing" ? "show_form" : "show_form",
        expectedSimulationType: typedSimulation,
      },
      {
        id: `${simulationType}-complete-v2`,
        title: `${simulationType} complete input creates a run payload`,
        category: "complete",
        events: [
          { type: "user_message", content: spec.goal, selectedSimulationType: typedSimulation },
          { type: "form_submit", values: spec.fullValues },
        ],
        expectedAction: "run_ready",
        expectedSimulationType: typedSimulation,
        expectedPayloadSimulationType: typedSimulation,
        expectedPayloadFields: spec.payloadFields,
      },
      {
        id: `${simulationType}-ambiguous-v2`,
        title: `${simulationType} ambiguous route remains inspectable`,
        category: "ambiguous",
        events: [{ type: "user_message", content: spec.ambiguousGoal, selectedSimulationType: typedSimulation }],
        expectedAction:
          typedSimulation === "creative_testing" || typedSimulation === "campus_priority"
            ? "show_form"
            : "ask_question",
        expectedSimulationType: typedSimulation,
      },
      {
        id: `${simulationType}-messy-v2`,
        title: `${simulationType} messy natural language does not run blindly`,
        category: "messy",
        events: [{ type: "user_message", content: spec.messyGoal, selectedSimulationType: typedSimulation }],
        // campus_priority messy text often recovers items → still asks for question (1 critical).
        expectedAction: "ask_question",
        expectedSimulationType: ["market_segmentation", "churn_prediction"].includes(typedSimulation)
          ? undefined
          : typedSimulation,
      },
      {
        id: `${simulationType}-invalid-v2`,
        title: `${simulationType} invalid payload stays in intake`,
        category: "invalid",
        events: [
          { type: "user_message", content: spec.goal, selectedSimulationType: typedSimulation },
          { type: "form_submit", values: spec.invalidValues },
        ],
        expectedAction: typedSimulation === "creative_testing" ? "repair_input" : "show_form",
        expectedSimulationType: typedSimulation,
      },
      {
        id: `${simulationType}-auto-generate-v2`,
        title: `${simulationType} auto-generate request collects safe context first`,
        category: "auto_generate",
        events: [{
          type: "user_message",
          content: `${spec.goal} 나머지는 알아서 해주세요.`,
          selectedSimulationType: typedSimulation,
        }],
        expectedAction:
          typedSimulation === "creative_testing" || typedSimulation === "campus_priority"
            ? "show_form"
            : "ask_question",
        expectedSimulationType: typedSimulation,
      },
      {
        id: `${simulationType}-assumption-review-v2`,
        title: `${simulationType} assumption review path is visible before execution`,
        category: "assumption_review",
        events: [
          { type: "user_message", content: spec.goal, selectedSimulationType: typedSimulation },
          { type: "form_submit", values: spec.partialValues },
        ],
        expectedAction: "show_form",
        expectedSimulationType: typedSimulation,
      },
    ];
  },
);
