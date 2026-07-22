// App-input helper data only. Result story fixtures live in runStateFixtures.ts
// so production result rendering cannot depend on stale mock numbers.
export type Simulation = {
  key: string;
  icon: string;
  label: string;
  description: string;
};

export const simulations: Simulation[] = [
  { key: "creative_testing", icon: "🎯", label: "크리에이티브 비교", description: "광고 카피 N개 비교" },
  { key: "price_optimization", icon: "💰", label: "가격 최적화", description: "최적 가격 + 탄력성" },
  { key: "product_launch", icon: "🚀", label: "신제품 반응", description: "출시 전 점수·이유" },
  { key: "value_proposition", icon: "💬", label: "가치 제안", description: "VP 설득력 비교" },
  { key: "market_segmentation", icon: "🧩", label: "시장 세분화", description: "자동 세그먼트 발견" },
  { key: "competitive_positioning", icon: "🎲", label: "경쟁 포지셔닝", description: "점유율·인식 맵" },
  { key: "brand_perception", icon: "🏷️", label: "브랜드 인지도", description: "이미지·감성 측정" },
  { key: "churn_prediction", icon: "📉", label: "이탈 예측", description: "고위험 세그먼트" },
  { key: "campaign_strategy", icon: "📡", label: "캠페인 전략", description: "최적 채널×메시지" },
];

export function getSimulationLabel(key: string): string {
  return simulations.find((s) => s.key === key)?.label ?? key;
}

// ── 채팅 스텝 정의 ──
export type ChatStep = {
  id: string;
  type: "text" | "textarea" | "radio";
  question: string;
  placeholder?: string;
  options?: string[];
};

export const introPlaceholders: Record<string, string> = {
  creative_testing: "예: 갤럭시 S26 광고 카피 3개를 비교하고 싶어요",
  price_optimization: "예: 스타벅스 신메뉴 자몽 에이드의 최적 가격을 찾고 싶어요",
  product_launch: "예: LG 새 무선청소기 출시 전 시장 반응을 보고 싶어요",
  value_proposition: "예: 우리 SaaS 랜딩 헤더 카피 3개를 비교하고 싶어요",
  market_segmentation: "예: 건강식품 시장의 주요 세그먼트를 찾고 싶어요",
  competitive_positioning: "예: 우리 OTT가 넷플릭스/티빙/쿠팡플레이 사이 어디에 있는지",
  brand_perception: "예: 스타벅스 브랜드 인지를 측정하고 싶어요",
  churn_prediction: "예: 통신사 5G 가입자 이탈 위험을 분석하고 싶어요",
  campaign_strategy: "예: 신제품 캠페인 채널·메시지 조합을 최적화하고 싶어요",
};

export const chatSteps: Record<string, ChatStep[]> = {
  creative_testing: [
    { id: "creatives", type: "textarea", question: "비교할 광고 카피를 한 줄에 하나씩 입력해주세요 (2~5개).", placeholder: "당신의 일상을 더 스마트하게, 갤럭시 S26\n한 번의 터치로 펼쳐지는 무한한 가능성\n이미 미래를 살고 있다, 갤럭시 S26" },
    { id: "target_age", type: "text", question: "타겟 연령대는?", placeholder: "30~49세" },
    { id: "sample_size", type: "radio", question: "샘플 크기는?", options: ["50명 (빠른 데모)", "100명", "200명 (표준)"] },
  ],
  price_optimization: [
    { id: "protocol_mode", type: "radio", question: "가격 리서치 방식은?", options: ["멀티턴 가격 리서치", "기본 가격 최적화"] },
    { id: "product", type: "text", question: "제품명·간단 설명?", placeholder: "스타벅스 자몽 에이드, 신선한 자몽 사용" },
    { id: "prices", type: "text", question: "비교할 가격대를 콤마로 구분해주세요 (3~6개).", placeholder: "4500, 5500, 6500, 7500" },
    { id: "calibration", type: "text", question: "보정할 실제 고객 분포가 있나요? (선택)", placeholder: "마케터 0.35, 기획자 0.35, HRD 담당자 0.2, 사무직 0.1" },
    { id: "target", type: "text", question: "타겟? (연령·성별·지역)", placeholder: "20~40대 직장인, 수도권" },
    { id: "sample_size", type: "radio", question: "샘플 크기는?", options: ["50명 (빠른 데모)", "100명", "200명 (표준)"] },
  ],
  product_launch: [
    { id: "product", type: "text", question: "제품명?", placeholder: "LG 코드제로 X9 (2026)" },
    { id: "spec", type: "textarea", question: "주요 스펙·특징을 적어주세요.", placeholder: "무선·물걸레 일체형\n흡입력 250W, 배터리 2시간\nHEPA 13급 필터" },
    { id: "price", type: "text", question: "가격은?", placeholder: "1,490,000원" },
    { id: "target", type: "text", question: "타겟?", placeholder: "30~50대 주부, 위생 민감" },
    { id: "sample_size", type: "radio", question: "샘플 크기는?", options: ["50명 (빠른 데모)", "100명", "200명 (표준)"] },
  ],
  value_proposition: [
    { id: "protocol_mode", type: "radio", question: "평가 방식은?", options: ["Product QA", "기본 가치 제안 비교"] },
    { id: "artifact_type", type: "text", question: "평가할 산출물 유형은?", placeholder: "landing_copy / onboarding_copy / price_table / report_snippet" },
    { id: "context", type: "text", question: "제품 컨텍스트를 한 줄로 적어주세요.", placeholder: "한국어 데이터 AI 분석 SaaS, 월 99,000원~" },
    { id: "vps", type: "textarea", question: "비교할 가치 제안 문장을 줄바꿈으로 적어주세요.", placeholder: "10분 만에 데이터 인사이트, 가장 빠른 분석 도구\n한국어 데이터에 최적화된 유일한 AI 분석\n월 99,000원으로 시작, 첫 달 무료" },
    { id: "target", type: "text", question: "타겟?", placeholder: "30~40대 IT 관리자" },
    { id: "sample_size", type: "radio", question: "샘플 크기는?", options: ["50명 (빠른 데모)", "100명", "200명 (표준)"] },
  ],
  market_segmentation: [
    { id: "category", type: "text", question: "분석할 카테고리는?", placeholder: "건강식품 / 전기차 / 온라인 교육 등" },
    { id: "questions", type: "textarea", question: "조사 질문 2~4개를 줄바꿈으로 적어주세요.", placeholder: "건강식품에 얼마나 관심이 있나요?\n살 때 가장 중요한 것은?\n어떤 건강식품을 주로 사거나 사고 싶나요?" },
    { id: "n_segments", type: "radio", question: "추출할 세그먼트 수는?", options: ["4개", "6개 (표준)", "8개"] },
    { id: "sample_size", type: "radio", question: "샘플 크기는?", options: ["50명 (빠른 데모)", "100명", "200명 (표준)"] },
  ],
  competitive_positioning: [
    { id: "category", type: "text", question: "카테고리는?", placeholder: "OTT 서비스" },
    { id: "competitors", type: "textarea", question: "경쟁사·우리 제품을 줄당 1개로 적어주세요. (이름 — 설명)", placeholder: "넷플릭스 — 월 17,000원, 글로벌 오리지널\n티빙 — 월 14,000원, K-콘텐츠\n쿠팡플레이 — 와우 시 무료\n(우리) 신규 OTT — 월 9,900원, K-드라마 100%" },
    { id: "target", type: "text", question: "타겟?", placeholder: "20~50대" },
    { id: "sample_size", type: "radio", question: "샘플 크기는?", options: ["50명 (빠른 데모)", "100명", "200명 (표준)"] },
  ],
  brand_perception: [
    { id: "brand", type: "text", question: "브랜드명은?", placeholder: "스타벅스" },
    { id: "compare", type: "text", question: "비교 브랜드 (콤마, 선택)", placeholder: "이디야, 투썸플레이스, 메가커피" },
    { id: "attributes", type: "textarea", question: "측정할 이미지 속성을 줄바꿈으로 (8~15개 권장).", placeholder: "신뢰\n고급\n친근\n혁신\n전문\n안전\n재미\n한국적" },
    { id: "sample_size", type: "radio", question: "샘플 크기는?", options: ["50명 (빠른 데모)", "100명", "200명 (표준)"] },
  ],
  churn_prediction: [
    { id: "service", type: "text", question: "서비스명?", placeholder: "통신사 A 5G 요금제" },
    { id: "current", type: "textarea", question: "현재 상황을 적어주세요.", placeholder: "월 89,000원, 데이터 무제한, 가입 2년차" },
    { id: "trigger", type: "textarea", question: "이탈 유발 이벤트는?", placeholder: "다음 달 99,000원으로 11% 인상 예정" },
    { id: "competitor", type: "textarea", question: "경쟁사 제안 (선택)", placeholder: "통신사 B 동일 조건 75,000원" },
    { id: "sample_size", type: "radio", question: "샘플 크기는?", options: ["50명 (빠른 데모)", "100명", "200명 (표준)"] },
  ],
  campaign_strategy: [
    { id: "context", type: "text", question: "제품 컨텍스트는?", placeholder: "자연주의 화장품 라인, 30~45세 여성" },
    { id: "channels", type: "textarea", question: "채널을 줄당 1개로 적어주세요.", placeholder: "인스타그램\n유튜브\n네이버 쇼핑\n카카오톡" },
    { id: "messages", type: "textarea", question: "메시지를 줄당 1개로 적어주세요.", placeholder: "자연 그대로의 빛, 매일 쓰는 천연 화장품\n7일만에 피부 톤 2단계 업\n월 49,000원 합리적 가격" },
    { id: "budget", type: "text", question: "예산은?", placeholder: "500,000,000원" },
    { id: "sample_size", type: "radio", question: "샘플 크기는?", options: ["50명 (빠른 데모)", "100명", "200명 (표준)"] },
  ],
};
