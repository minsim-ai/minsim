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
    slot("product_concept", "제품 컨셉", "object", "critical", "textarea", { placeholder: "예: 혼자 사는 어르신의 말벗과 복약 알림을 돕는 반려 로봇" }),
    slot("target_use_case", "사용 상황", "context", "critical", "textarea", { canInfer: true, placeholder: "예: 자녀가 출근한 낮 시간에 어르신이 집에서 사용" }),
    slot("key_features", "핵심 기능", "criteria", "critical", "multi_text", { minItems: 1, maxItems: 8, canGenerate: true, placeholder: "예: 대화\n복약 알림\n보호자 앱 연동" }),
    slot("target_customers", "핵심 고객", "audience", "recommended", "multi_text", { recommendedItems: 3, maxItems: 5, canGenerate: true, placeholder: "예: 70대 1인 가구\n부모 돌봄을 고민하는 40~50대 자녀" }),
    slot("expected_price_range", "예상 가격대", "constraints", "optional", "text", { placeholder: "예: 월 39,000~59,000원" }),
  ]),
  value_proposition: pack("value_proposition", "가치 제안 테스트", ["가치 제안", "장점", "소구점", "USP", "어필"], [
    slot("product_context", "제품 컨텍스트", "object", "critical", "textarea", { placeholder: "예: 한국 소비자 반응을 합성 페르소나로 미리 검증하는 B2B SaaS" }),
    slot("statements", "가치 제안 후보", "options", "critical", "multi_text", { minItems: 2, maxItems: 5, canGenerate: true, placeholder: "예: 출시 전에 한국 고객 반응을 확인하세요.\n200명의 관점으로 의사결정 위험을 줄이세요." }),
    slot("target_customers", "핵심 고객", "audience", "recommended", "multi_text", { recommendedItems: 3, maxItems: 5, canGenerate: true, placeholder: "예: 신제품 출시를 준비하는 PM\n캠페인을 검증하는 마케터" }),
    slot("pain_points", "고객 문제", "criteria", "recommended", "multi_text", { recommendedItems: 2, maxItems: 8, canGenerate: true, placeholder: "예: 실제 조사 전 방향을 잡기 어렵다\n인터뷰 모집에 시간이 오래 걸린다" }),
    slot("competitors", "대안/경쟁 제품", "context", "optional", "multi_text", { placeholder: "예: 설문조사 업체\n사용자 인터뷰 플랫폼" }),
  ]),
  market_segmentation: pack("market_segmentation", "시장 세분화", ["고객군", "세그먼트", "타겟", "시장 나누", "분류"], [
    slot("category", "카테고리", "object", "critical", "text", { placeholder: "예: 사주·점성술 모바일 앱" }),
    slot("core_questions", "세분화 질문", "criteria", "critical", "multi_text", { minItems: 1, maxItems: 6, canGenerate: true, placeholder: "예: 사주 앱을 쓰는 사람은 어떤 유형으로 나뉠까?\n유료 결제 의향이 높은 집단은 누구일까?" }),
    slot("product_family", "제품군", "context", "recommended", "textarea", { canInfer: true, placeholder: "예: 오늘의 운세, 궁합, 타로 상담을 제공하는 구독형 앱" }),
    slot("known_behaviors", "알고 싶은 행동/니즈", "criteria", "recommended", "multi_text", { canGenerate: true, placeholder: "예: 앱을 여는 빈도\n결제 계기\n상담에서 기대하는 위로와 확신" }),
    slot("n_segments", "세그먼트 수", "constraints", "optional", "number", { placeholder: "예: 4" }),
  ]),
  competitive_positioning: pack("competitive_positioning", "경쟁 포지셔닝", ["경쟁사", "포지션", "비교", "대비", "포지셔닝"], [
    slot("category_context", "시장/카테고리 설명", "object", "critical", "textarea"),
    slot("products", "비교할 제품/브랜드", "options", "critical", "multi_text", { minItems: 2, maxItems: 5 }),
    slot("attributes", "비교 기준", "criteria", "critical", "multi_text", { minItems: 2, maxItems: 8, canGenerate: true }),
    slot("target_customers", "핵심 고객", "audience", "recommended", "multi_text", { canGenerate: true }),
    slot("price_tier", "가격/시장 티어", "context", "optional", "text"),
  ]),
  brand_perception: pack("brand_perception", "브랜드 인식", ["브랜드 이미지", "인지도", "인식", "브랜드", "평판"], [
    slot("brand_name", "브랜드명", "object", "critical", "text", { placeholder: "예: 아라베스크" }),
    slot("category", "카테고리", "context", "critical", "text", { placeholder: "예: AI 소비자 리서치 SaaS" }),
    slot("attributes", "확인할 이미지 속성", "criteria", "critical", "multi_text", { minItems: 3, maxItems: 15, canGenerate: true, placeholder: "예: 신뢰할 수 있음\n혁신적임\n사용하기 쉬움" }),
    slot("comparison_brands", "비교 브랜드", "context", "recommended", "multi_text", { canGenerate: true, placeholder: "예: 경쟁 브랜드 A\n경쟁 브랜드 B" }),
    slot("recent_context", "최근 캠페인/이슈", "context", "optional", "textarea", { placeholder: "예: 지난달 브랜드 메시지를 '빠른 검증' 중심으로 변경" }),
  ]),
  churn_prediction: pack("churn_prediction", "이탈 예측", ["이탈", "해지", "떠날", "구독 취소", "전환"], [
    slot("service_name", "서비스명", "object", "critical", "text", { placeholder: "예: 어르신 동반 강아지 로봇 구독 서비스" }),
    slot("current_situation", "현재 상황", "context", "critical", "textarea", { placeholder: "예: 무료 체험 종료 뒤 2개월 차 재구독률이 빠르게 낮아지고 있습니다." }),
    slot("trigger_event", "이탈 트리거", "criteria", "critical", "textarea", { placeholder: "예: 월 구독료 인상, 반복되는 대화, 보호자 앱 연결 오류" }),
    slot("competitor_offer", "경쟁 제안", "context", "recommended", "textarea", { canGenerate: true, placeholder: "예: 경쟁사는 더 저렴한 요금과 영상통화 기능을 제공합니다." }),
    slot("affected_customers", "영향 고객군", "audience", "recommended", "multi_text", { canGenerate: true, placeholder: "예: 사용 1~3개월 차 고객\n보호자 앱을 자주 쓰는 가족 고객" }),
  ]),
  campaign_strategy: pack("campaign_strategy", "캠페인 전략", ["캠페인", "채널", "메시지 조합", "예산", "매체"], [
    slot("product_context", "캠페인 대상", "object", "critical", "textarea", { placeholder: "예: 1인 가구 어르신을 위한 말벗 로봇 월 구독 서비스" }),
    slot("channels", "채널 후보", "options", "critical", "multi_text", { minItems: 2, maxItems: 5, canGenerate: true, placeholder: "예: 네이버 검색광고\n유튜브\n카카오톡 채널" }),
    slot("messages", "메시지 후보", "options", "critical", "multi_text", { minItems: 2, maxItems: 4, canGenerate: true, placeholder: "예: 부모님 곁을 지키는 다정한 로봇\n멀리 있어도 안심할 수 있는 돌봄" }),
    slot("budget", "예산", "constraints", "recommended", "number", { placeholder: "예: 5000000" }),
    slot("campaign_objective", "캠페인 목표", "criteria", "recommended", "text", { canGenerate: true, placeholder: "예: 무료 체험 신청 500건 확보" }),
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
