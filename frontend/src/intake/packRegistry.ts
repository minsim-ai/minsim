import type { SimulationType } from "../types/api";
import { creativeTestingPack } from "./creativeTestingPack";
import type { IntakeFieldType, IntakeSlotFamily, IntakeSlotImportance, SimulationIntakePack, SlotRequirement } from "./types";

const packPlaceholders: Record<Exclude<SimulationType, "creative_testing">, SimulationIntakePack> = {
  startup_item_validation: pack("startup_item_validation", "창업 아이템 검증", ["창업", "아이템", "시장성", "사업성", "사업 아이디어", "될까"], [
    slot("item_description", "아이템 설명", "object", "critical", "textarea", {
      placeholder: "예: 잠이 잘 오게 하는 뇌파 생성 수면 머리띠",
      helperText: "무엇을 파는지, 어떤 형태인지 적어주세요.",
    }),
    slot("problem_statement", "해결하려는 문제", "criteria", "critical", "textarea", {
      canInfer: true,
      placeholder: "예: 입면에 30분 이상 걸리는 사람들의 수면 진입 문제",
      helperText: "고객이 지금 겪는 문제를 한두 문장으로 적어주세요.",
    }),
    slot("key_features", "핵심 기능", "criteria", "recommended", "multi_text", {
      maxItems: 8,
      canGenerate: true,
      placeholder: "예: 뇌파 유도 사운드\n수면 리포트",
      helperText: "모르면 비워도 됩니다. 후보 생성을 요청할 수 있습니다.",
    }),
    slot("alternatives", "대안/경쟁", "context", "recommended", "multi_text", {
      maxItems: 6,
      canGenerate: true,
      placeholder: "예: 멜라토닌 보조제\n수면 유도 앱",
      helperText: "지금 고객이 대신 쓰는 것들을 적어주세요.",
    }),
    slot("price_hint", "예상 가격", "constraints", "optional", "text", {
      placeholder: "예: 129,000원",
      helperText: "지불의향 질문의 앵커로만 사용합니다. 모르면 비워두세요.",
    }),
    slot("target_customers", "핵심 고객", "audience", "recommended", "multi_text", {
      recommendedItems: 3,
      maxItems: 5,
      canGenerate: true,
      placeholder: "예: 수면 고민이 있는 직장인",
      helperText: "모르면 비워도 됩니다. 전체 페르소나 기준으로 시작합니다.",
    }),
  ]),
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
    slot("category", "카테고리", "object", "critical", "text", { placeholder: "예: 반려동물 건강관리 모바일 앱" }),
    slot("core_questions", "세분화 질문", "criteria", "critical", "multi_text", { minItems: 1, maxItems: 6, canGenerate: true, placeholder: "예: 이 앱을 쓰는 사람은 어떤 유형으로 나뉠까?\n유료 결제 의향이 높은 집단은 누구일까?" }),
    slot("product_family", "제품군", "context", "recommended", "textarea", { canInfer: true, placeholder: "예: 산책 기록, 사료 추천, 병원 예약을 제공하는 구독형 앱" }),
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
    slot("channels", "캠페인을 보여줄 곳", "options", "critical", "multi_text", { minItems: 2, maxItems: 5, canGenerate: true, helperText: "서로 비교할 곳을 한 줄에 하나씩, 최소 2개 적어주세요.", placeholder: "예: X(트위터)\n인스타그램\n유튜브" }),
    slot("messages", "캠페인 문구", "options", "critical", "multi_text", { minItems: 2, maxItems: 4, canGenerate: true, helperText: "서로 비교할 문구를 한 줄에 하나씩, 최소 2개 적어주세요.", placeholder: "예: 부모님 곁을 지키는 다정한 로봇\n멀리 있어도 안심할 수 있는 돌봄" }),
    slot("budget", "예산", "constraints", "recommended", "number", { placeholder: "예: 5000000" }),
    slot("campaign_objective", "캠페인 목표", "criteria", "recommended", "text", { canGenerate: true, placeholder: "예: 무료 체험 신청 500건 확보" }),
  ]),
  campus_policy: pack("campus_policy", "정책 찬반", ["찬반", "찬성", "반대", "여론조사", "정책", "안건", "개방", "폐지", "도입"], [
    slot("agenda", "안건", "object", "critical", "text", {
      placeholder: "예: 중앙도서관 24시간 개방",
      helperText: "학생들이 찬반을 판단할 대상을 한 줄로 적어주세요.",
    }),
    slot("current_state", "현행 상태", "context", "critical", "textarea", {
      canInfer: true,
      canGenerate: true,
      placeholder: "예: 평일 09-23시, 주말 10-18시 운영. 시험기간만 익일 02시까지 연장.",
      helperText: "지금 어떻게 운영되는지 적어주세요. 비교 기준이 없으면 응답이 흔들립니다. AI 초안은 반드시 사실 확인이 필요합니다.",
    }),
    slot("proposed_change", "변경 내용", "criteria", "critical", "textarea", {
      canInfer: true,
      canGenerate: true,
      placeholder: "예: 1층 열람실만 연중 24시간 개방. 2-4층 서고는 기존 시간 유지.",
      helperText: "안건이 실행되면 무엇이 달라지는지 구체적으로 적어주세요.",
    }),
    slot("tradeoffs", "예상 비용·부작용", "constraints", "recommended", "textarea", {
      canGenerate: true,
      placeholder: "예: 연간 운영비 1.2억 증가. 재원은 학생회비 인상 또는 타 복지예산 삭감 중 택일.",
      helperText: "비우면 찬성률이 실제보다 20-30%p 높게 나옵니다. 결과에 편향 경고가 붙습니다.",
    }),
    slot("condition_taxonomy", "조건 범주", "options", "recommended", "multi_text", {
      maxItems: 6,
      canGenerate: true,
      placeholder: "예: 학생 부담 없는 재원\n야간 안전 대책\n타 예산 삭감 허용",
      helperText: "응답자가 고를 조건 범주 4~6개. 비우면 조건이 자유서술로만 모여 집계되지 않습니다.",
    }),
  ]),
  campus_priority: pack("campus_priority", "우선순위", ["우선순위", "순위를", "순위로", "무엇부터", "어디에 먼저", "먼저 쓸", "먼저 할", "예산 배분"], [
    slot("question", "무엇의 우선순위인가", "object", "critical", "text", {
      placeholder: "예: 복지예산을 어디에 먼저 쓸까요?",
      helperText: "의사결정 질문 한 줄. 긴 조사 설명 문장 대신 짧게 적어주세요.",
    }),
    slot("items", "순위를 매길 항목", "options", "critical", "multi_text", {
      minItems: 3,
      maxItems: 6,
      canGenerate: true,
      placeholder: "예: 학식 질 개선\n심야 셔틀 신설\n스터디룸 증설\n헬스장 확충",
      helperText: "후보 3~6개를 줄바꿈·쉼표·/ 로 나열하세요. 설명 문장 전체를 넣지 마세요.",
    }),
    slot("context", "배경·제약", "constraints", "recommended", "textarea", {
      canGenerate: true,
      placeholder: "예: 총 1억 원. 올해 안에 하나만 집행 가능.",
      helperText: "예산 규모나 집행 제약을 적으면 응답이 현실적으로 바뀝니다. 모르면 넘어가도 됩니다.",
    }),
  ]),
  open_survey: pack("open_survey", "자유 설문", ["설문", "물어보고 싶", "객관식", "선택지", "골라", "어느 쪽", "직접 묻"], [
    slot("question", "질문", "object", "critical", "text", {
      placeholder: "예: 가을 축제를 언제 여는 게 좋을까요?",
      helperText: "응답자에게 그대로 보여줄 질문 한 문장.",
    }),
    slot("options", "선택지", "options", "critical", "multi_text", {
      minItems: 2,
      maxItems: 6,
      canGenerate: true,
      placeholder: "예: 금요일 저녁\n토요일 오후\n토요일 저녁",
      helperText: "2~6개. 응답자마다 다른 순서로 제시되므로 입력 순서는 결과에 영향을 주지 않습니다.",
    }),
    slot("context", "배경", "context", "recommended", "textarea", {
      canGenerate: true,
      placeholder: "예: 본가가 먼 학생은 주말에 캠퍼스에 남는다.",
      helperText: "판단에 필요한 배경이 있으면 적어주세요.",
    }),
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
