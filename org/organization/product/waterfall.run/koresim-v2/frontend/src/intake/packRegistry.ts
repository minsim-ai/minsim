import type { SimulationType } from "../types/api";
import { creativeTestingPack } from "./creativeTestingPack";
import type { IntakeFieldType, IntakeSlotFamily, IntakeSlotImportance, SimulationIntakePack, SlotRequirement } from "./types";

const packPlaceholders: Record<Exclude<SimulationType, "creative_testing">, SimulationIntakePack> = {
  price_optimization: pack("price_optimization", "가격 최적화", ["가격", "가격대", "얼마", "요금", "구독료"], [
    slot("product_description", "제품 설명", "object", "critical", "textarea", {
      placeholder: "예: AI 리서치 SaaS 월 구독 상품입니다.",
      helperText: "제품명, 판매 방식, 현재 가격대가 있으면 함께 적어주세요.",
    }),
    slot("price_points", "비교할 가격 후보", "options", "critical", "multi_text", {
      minItems: 3,
      maxItems: 6,
      canGenerate: true,
      placeholder: "예: 29,000원",
      helperText: "3개 이상 권장합니다. 모르면 비워두고 후보 생성을 요청할 수 있습니다.",
    }),
    slot("purchase_context", "구매 상황", "context", "recommended", "textarea", {
      canGenerate: true,
      placeholder: "예: 팀 단위로 월 구독 도입을 검토하는 상황",
      helperText: "모르면 비워도 됩니다. 결과 해석의 배경으로만 사용합니다.",
    }),
    slot("target_customers", "핵심 고객", "audience", "recommended", "multi_text", {
      recommendedItems: 3,
      maxItems: 5,
      canGenerate: true,
      placeholder: "예: B2B 마케터",
      helperText: "모르면 비워도 됩니다. 입력값이 없으면 전체 페르소나 기준으로 시작합니다.",
    }),
    slot("competitor_prices", "경쟁 가격", "context", "recommended", "multi_text", {
      canGenerate: true,
      placeholder: "예: 월 49,000원 경쟁 SaaS",
      helperText: "아는 경쟁 가격만 적어주세요. 모르면 비워도 됩니다.",
    }),
  ]),
  product_launch: pack("product_launch", "제품 출시 예측", ["신제품", "출시", "시장 반응", "런칭"], [
    slot("product_concept", "제품 컨셉", "object", "critical", "textarea"),
    slot("target_use_case", "사용 상황", "context", "critical", "textarea", { canInfer: true }),
    slot("key_features", "핵심 기능", "criteria", "critical", "multi_text", { minItems: 1, maxItems: 8, canGenerate: true }),
    slot("target_customers", "핵심 고객", "audience", "recommended", "multi_text", { recommendedItems: 3, maxItems: 5, canGenerate: true }),
    slot("expected_price_range", "예상 가격대", "constraints", "optional", "text"),
  ]),
  value_proposition: pack("value_proposition", "가치 제안 테스트", ["가치 제안", "장점", "소구점", "USP", "어필"], [
    slot("product_context", "제품 컨텍스트", "object", "critical", "textarea"),
    slot("statements", "가치 제안 후보", "options", "critical", "multi_text", { minItems: 2, maxItems: 5, canGenerate: true }),
    slot("target_customers", "핵심 고객", "audience", "recommended", "multi_text", { recommendedItems: 3, maxItems: 5, canGenerate: true }),
    slot("pain_points", "고객 문제", "criteria", "recommended", "multi_text", { recommendedItems: 2, maxItems: 8, canGenerate: true }),
    slot("competitors", "대안/경쟁 제품", "context", "optional", "multi_text"),
  ]),
  market_segmentation: pack("market_segmentation", "시장 세분화", ["고객군", "세그먼트", "타겟", "시장 나누", "분류"], [
    slot("category", "카테고리", "object", "critical", "text"),
    slot("core_questions", "세분화 질문", "criteria", "critical", "multi_text", { minItems: 1, maxItems: 6, canGenerate: true }),
    slot("product_family", "제품군", "context", "recommended", "textarea", { canInfer: true }),
    slot("known_behaviors", "알고 싶은 행동/니즈", "criteria", "recommended", "multi_text", { canGenerate: true }),
    slot("n_segments", "세그먼트 수", "constraints", "optional", "number"),
  ]),
  competitive_positioning: pack("competitive_positioning", "경쟁 포지셔닝", ["경쟁사", "포지션", "비교", "대비", "포지셔닝"], [
    slot("category_context", "시장/카테고리 설명", "object", "critical", "textarea"),
    slot("products", "비교할 제품/브랜드", "options", "critical", "multi_text", { minItems: 2, maxItems: 5 }),
    slot("attributes", "비교 기준", "criteria", "critical", "multi_text", { minItems: 2, maxItems: 8, canGenerate: true }),
    slot("target_customers", "핵심 고객", "audience", "recommended", "multi_text", { canGenerate: true }),
    slot("price_tier", "가격/시장 티어", "context", "optional", "text"),
  ]),
  brand_perception: pack("brand_perception", "브랜드 인식", ["브랜드 이미지", "인지도", "인식", "브랜드", "평판"], [
    slot("brand_name", "브랜드명", "object", "critical", "text"),
    slot("category", "카테고리", "context", "critical", "text"),
    slot("attributes", "확인할 이미지 속성", "criteria", "critical", "multi_text", { minItems: 3, maxItems: 15, canGenerate: true }),
    slot("comparison_brands", "비교 브랜드", "context", "recommended", "multi_text", { canGenerate: true }),
    slot("recent_context", "최근 캠페인/이슈", "context", "optional", "textarea"),
  ]),
  churn_prediction: pack("churn_prediction", "이탈 예측", ["이탈", "해지", "떠날", "구독 취소", "전환"], [
    slot("service_name", "서비스명", "object", "critical", "text"),
    slot("current_situation", "현재 상황", "context", "critical", "textarea"),
    slot("trigger_event", "이탈 트리거", "criteria", "critical", "textarea"),
    slot("competitor_offer", "경쟁 제안", "context", "recommended", "textarea", { canGenerate: true }),
    slot("affected_customers", "영향 고객군", "audience", "recommended", "multi_text", { canGenerate: true }),
  ]),
  campaign_strategy: pack("campaign_strategy", "캠페인 전략", ["캠페인", "채널", "메시지 조합", "예산", "매체"], [
    slot("product_context", "캠페인 대상", "object", "critical", "textarea"),
    slot("channels", "채널 후보", "options", "critical", "multi_text", { minItems: 2, maxItems: 5, canGenerate: true }),
    slot("messages", "메시지 후보", "options", "critical", "multi_text", { minItems: 2, maxItems: 4, canGenerate: true }),
    slot("budget", "예산", "constraints", "recommended", "number"),
    slot("campaign_objective", "캠페인 목표", "criteria", "recommended", "text", { canGenerate: true }),
  ]),
};

export const intakePackRegistry: Record<SimulationType, SimulationIntakePack> = {
  creative_testing: creativeTestingPack,
  ...packPlaceholders,
};

export function getIntakePack(simulationType: SimulationType): SimulationIntakePack {
  return intakePackRegistry[simulationType];
}

function pack(
  simulationType: Exclude<SimulationType, "creative_testing">,
  label: string,
  routeHints: string[],
  slots: SlotRequirement[],
): SimulationIntakePack {
  return {
    simulationType,
    version: `${simulationType}.intake.skeleton.v1`,
    label,
    routeHints,
    minConfidenceToAutoSelect: 0.76,
    formFieldOrder: slots.filter((item) => item.importance !== "optional").slice(0, 5).map((item) => item.id),
    slots,
  };
}

function slot(
  id: string,
  label: string,
  family: IntakeSlotFamily,
  importance: IntakeSlotImportance,
  dataType: IntakeFieldType,
  options: Partial<SlotRequirement> = {},
): SlotRequirement {
  return {
    id,
    label,
    family,
    importance,
    dataType,
    canInfer: options.canInfer ?? false,
    canGenerate: options.canGenerate ?? false,
    needsReviewWhenGenerated: options.needsReviewWhenGenerated ?? Boolean(options.canGenerate),
    ...options,
  };
}
