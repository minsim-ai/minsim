import type { SimulationType } from "../../types/api";
import type { IntakeEvaluationFixture } from "./types";

const routeCases: Record<Exclude<SimulationType, "creative_testing">, string[]> = {
  price_optimization: [
    "가격을 얼마로 해야 할까요?",
    "구독료 가격대를 테스트하고 싶어요.",
    "신제품 가격 후보를 비교해주세요.",
    "요금제를 3개로 나누려는데 반응을 보고 싶어요.",
    "이 제품이 29000원인지 39000원인지 모르겠어요.",
  ],
  product_launch: [
    "신제품 출시 반응을 보고 싶어요.",
    "이 제품을 런칭해도 괜찮을까요?",
    "시장 반응을 출시 전에 예측하고 싶어요.",
    "새 서비스 컨셉이 먹힐지 알고 싶어요.",
    "제품 출시 전에 핵심 기능 반응을 보고 싶습니다.",
  ],
  value_proposition: [
    "우리 제품 장점을 어떻게 말해야 할지 모르겠어요.",
    "가치 제안을 테스트하고 싶어요.",
    "어떤 소구점이 가장 설득력 있을까요?",
    "USP 후보를 비교해주세요.",
    "고객에게 어떤 장점을 먼저 말해야 할까요?",
  ],
  market_segmentation: [
    "고객군을 나누고 싶어요.",
    "우리 시장 세그먼트를 알고 싶습니다.",
    "타겟을 어떻게 분류해야 할까요?",
    "구매 기준별로 고객군을 찾고 싶어요.",
    "시장 나누는 기준을 시뮬레이션하고 싶어요.",
  ],
  competitive_positioning: [
    "경쟁사 대비 포지션을 알고 싶어요.",
    "우리 제품과 경쟁 제품을 비교하고 싶습니다.",
    "브랜드 포지셔닝을 확인해주세요.",
    "경쟁사 대비 어떤 이미지인지 보고 싶어요.",
    "비교 제품들 사이에서 우리가 어디쯤인지 알고 싶습니다.",
  ],
  brand_perception: [
    "브랜드 이미지가 어떤지 보고 싶어요.",
    "우리 브랜드 인식을 확인하고 싶습니다.",
    "인지도가 어떤 느낌인지 시뮬레이션해주세요.",
    "브랜드 평판을 보고 싶어요.",
    "카테고리 안에서 브랜드가 어떻게 보일까요?",
  ],
  churn_prediction: [
    "고객이 이탈할지 보고 싶어요.",
    "구독 해지 가능성을 확인하고 싶습니다.",
    "가격 인상 후 고객이 떠날까요?",
    "경쟁사 혜택 때문에 전환할지 보고 싶어요.",
    "서비스 변경 후 이탈 예측을 하고 싶습니다.",
  ],
  campaign_strategy: [
    "캠페인 전략을 짜고 싶어요.",
    "채널과 메시지 조합을 비교해주세요.",
    "예산을 어디 채널에 써야 할까요?",
    "캠페인 매체별 반응을 보고 싶습니다.",
    "마케팅 채널 후보와 메시지를 같이 시뮬레이션하고 싶어요.",
  ],
};

export const simulationRoutingFixtures: IntakeEvaluationFixture[] = Object.entries(routeCases).flatMap(
  ([simulationType, messages]) =>
    messages.map((content, index) => ({
      id: `${simulationType}-routing-${index + 1}`,
      title: `${simulationType} routing ${index + 1}`,
      events: [{ type: "user_message", content }],
      expectedAction: "ask_question",
      expectedSimulationType: simulationType,
    })),
);

export const campaignStrategyFlowFixtures: IntakeEvaluationFixture[] = [
  {
    id: "campaign-strategy-product-goal-shows-form",
    title: "캠페인 목표가 캠페인 전략 입력 폼으로 이어짐",
    events: [
      { type: "user_message", content: "제품에 캠페인을 만들고싶어요." },
    ],
    expectedAction: "ask_question",
    expectedSimulationType: "campaign_strategy",
  },
  {
    id: "campaign-strategy-form-run-ready",
    title: "캠페인 전략 폼 제출 후 실행 준비",
    events: [
      { type: "user_message", content: "제품에 캠페인을 만들고싶어요." },
      {
        type: "form_submit",
        values: {
          product_context: "신규 AI 리서치 SaaS를 B2B 마케터에게 알리고 싶습니다.",
          channels: ["네이버 검색", "링크드인", "뉴스레터"],
          messages: ["시장조사를 몇 분 만에 끝내세요", "한국 고객 반응을 출시 전에 검증하세요"],
          budget: 5000000,
          campaign_objective: "무료 데모 신청",
        },
      },
    ],
    expectedAction: "run_ready",
    expectedSimulationType: "campaign_strategy",
    expectedPayloadSimulationType: "campaign_strategy",
    expectedPayloadFields: ["product_context", "channels", "messages", "budget"],
  },
];
