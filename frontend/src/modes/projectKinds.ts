import type { SimulationType } from '../types/api'

export type ProjectKind = 'poll' | 'venture'

export interface KindSimulation {
  key: SimulationType
  label: string
  example: string
  primary: boolean
}

export interface ProjectKindSpec {
  kind: ProjectKind
  label: string
  blurb: string
  defaultPersonaPool: string
  simulations: KindSimulation[]
}

/**
 * 여론조사 갈래의 시뮬레이션 목록.
 * 백엔드 simulation_type 키는 절대 바꾸지 않는다. 여기서 라벨만 캠퍼스 맥락으로 바꾼다.
 */
const POLL_SIMULATIONS: KindSimulation[] = [
  {
    key: 'open_survey',
    label: '자유 설문',
    example: '질문과 선택지를 직접 써서 그대로 물어보기',
    primary: true,
  },
  {
    key: 'campus_policy',
    label: '정책 찬반',
    example: '중앙도서관 24시간 개방, 기숙사 통금 폐지',
    primary: true,
  },
  {
    key: 'creative_testing',
    label: '행사·라인업 반응',
    example: '축제 헤드라이너 A/B/C안, 초청 연사 후보',
    primary: true,
  },
  {
    key: 'price_optimization',
    label: '요금 변경',
    example: '학식 500원 인상 + 반찬 추가, 기숙사비, 셔틀 유료화',
    primary: true,
  },
  {
    key: 'product_launch',
    label: '신규 서비스 수요',
    example: '심야 셔틀, 무인 편의점, 24시 스터디카페',
    primary: true,
  },
  {
    key: 'campus_priority',
    label: '예산·시설 우선순위',
    example: '학식 개선 vs 심야 셔틀 vs 스터디룸 vs 헬스장 — 무엇부터?',
    primary: true,
  },
  {
    key: 'competitive_positioning',
    label: '상대 선호 비교',
    example: '헬스장 vs 스터디룸 vs 카페 — 어느 쪽이 더 끌리나',
    primary: false,
  },
  {
    key: 'brand_perception',
    label: '만족도 진단',
    example: '현 학식·상담센터·셔틀 만족도, 학교 이미지',
    primary: true,
  },
  {
    key: 'campaign_strategy',
    label: '공지 채널 전략',
    example: '에브리타임 vs 카톡 vs 메일 vs 포스터',
    primary: false,
  },
  {
    key: 'market_segmentation',
    label: '의견 갈림 지점',
    example: '이 안건에서 어떤 집단이 어떻게 갈리나',
    primary: false,
  },
  {
    key: 'churn_prediction',
    label: '이탈·불만 위험',
    example: '자퇴·휴학 고민, 동아리·프로그램 중도포기',
    primary: false,
  },
  {
    key: 'value_proposition',
    label: '문구 설득력 비교',
    example: '총학 공약 문구 A/B, 캠페인 카피',
    primary: false,
  },
]

/** 사업 아이템 검증 갈래 — 기존 동작 그대로. */
const VENTURE_SIMULATIONS: KindSimulation[] = [
  { key: 'open_survey', label: '자유 설문', example: '질문과 선택지를 직접 써서 그대로 물어보기', primary: false },
  { key: 'startup_item_validation', label: '창업 아이템 검증', example: '이 아이템으로 사업이 될까', primary: true },
  { key: 'creative_testing', label: '크리에이티브 비교', example: '광고 카피 N개 비교', primary: true },
  { key: 'price_optimization', label: '가격 최적화', example: '최적 가격 + 탄력성', primary: true },
  { key: 'product_launch', label: '신제품 반응', example: '출시 전 점수·이유', primary: true },
  { key: 'value_proposition', label: '가치 제안', example: 'VP 설득력 비교', primary: true },
  { key: 'market_segmentation', label: '시장 세분화', example: '자동 세그먼트 발견', primary: true },
  { key: 'competitive_positioning', label: '경쟁 포지셔닝', example: '점유율·인식 맵', primary: false },
  { key: 'brand_perception', label: '브랜드 인지도', example: '이미지·감성 측정', primary: false },
  { key: 'churn_prediction', label: '이탈 예측', example: '고위험 세그먼트', primary: false },
  { key: 'campaign_strategy', label: '캠페인 전략', example: '최적 채널×메시지', primary: false },
]

export const PROJECT_KINDS: Record<ProjectKind, ProjectKindSpec> = {
  poll: {
    kind: 'poll',
    label: '여론조사',
    blurb: '구성원에게 찬반·우선순위·만족도를 물어봅니다.',
    defaultPersonaPool: 'dgist',
    simulations: POLL_SIMULATIONS,
  },
  venture: {
    kind: 'venture',
    label: '사업 아이템 검증',
    blurb: '출시 전 시장 반응과 가격·포지셔닝을 검증합니다.',
    defaultPersonaPool: 'nationwide',
    simulations: VENTURE_SIMULATIONS,
  },
}

export function getProjectKindSpec(kind: string | null | undefined): ProjectKindSpec {
  return kind === 'poll' ? PROJECT_KINDS.poll : PROJECT_KINDS.venture
}
