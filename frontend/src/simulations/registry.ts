import type { JsonObject, RawPersonaResult, RunResultEnvelope, SimulationType } from '../types/api'
import { getProjectKindSpec } from '../modes/projectKinds'

export type MetricRow = {
  label: string
  count?: number
  pct?: number | null
  value?: string | number | null
  detail?: string | null
}

export type MetricSection = {
  title: string
  rows: MetricRow[]
}

export const simulationLabels: Record<SimulationType, string> = {
  startup_item_validation: '창업 아이템 검증',
  creative_testing: '크리에이티브 비교',
  price_optimization: '가격 최적화',
  product_launch: '신제품 반응',
  value_proposition: '가치 제안',
  market_segmentation: '시장 세분화',
  competitive_positioning: '경쟁 포지셔닝',
  brand_perception: '브랜드 인식',
  churn_prediction: '이탈 예측',
  campaign_strategy: '캠페인 전략',
  campus_policy: '정책 찬반',
  campus_priority: '우선순위',
  open_survey: '자유 설문',
}

/**
 * 갈래를 넘기면 그 갈래의 라벨을 쓴다.
 *
 * 유형 선택 화면만 갈래별 라벨을 쓰고 나머지는 이 단일 Record를 써서, 여론조사에서
 * "요금 변경"을 고르면 다음 화면 배지가 "가격 최적화"로 뒤집혔다.
 */
export function getSimulationLabel(key: string, kind?: string | null): string {
  if (kind) {
    const match = getProjectKindSpec(kind).simulations.find((item) => item.key === key)
    if (match) return match.label
  }
  return simulationLabels[key as SimulationType] ?? key
}

export function getResultSummary(result: RunResultEnvelope): string {
  const sections = getMetricSections(result)
  const firstRow = sections.flatMap((section) => section.rows)[0]
  if (!firstRow) return '집계 가능한 정량 요약이 아직 없습니다.'
  const value = firstRow.value ?? firstRow.count
  const pct = firstRow.pct !== null && firstRow.pct !== undefined ? ` · ${firstRow.pct}%` : ''
  return `${firstRow.label}: ${value ?? 'N/A'}${pct}`
}

export function getPersonaPrimaryLabel(raw: RawPersonaResult): string {
  const parsed = raw.parsed
  if (!parsed) return raw.error ?? '응답'
  const value =
    parsed.choice ??
    parsed.intent ??
    parsed.segment ??
    parsed.primary ??
    parsed.preferred_price ??
    parsed.score ??
    parsed.reaction
  return value ? String(value) : raw.error ?? '응답'
}

export function getMetricSections(result: RunResultEnvelope): MetricSection[] {
  const metrics = result.metrics
  switch (result.simulation_type) {
    case 'creative_testing':
      return [
        {
          title: '선호도 분포',
          rows: choiceRows(metrics, 'choice_counts', 'choice_pct', letteredDetails(metrics.creatives)),
        },
      ]
    case 'price_optimization':
      if (metrics.protocol_id === 'price_research_v2') {
        return [
          {
            title: '헤드라인 구매 의향',
            rows: countPctRows(metrics, 'headline_intent_counts', 'headline_intent_pct'),
          },
          {
            title: '조건부 구매 전환',
            rows: [
              {
                label: '조건 충족 시 구매 가능',
                count: asNumber(metrics.conditional_yes_count) ?? undefined,
                pct: asNumber(metrics.conditional_yes_rate),
              },
            ],
          },
          { title: '거절 후 조건', rows: countRows(metrics.condition_category_counts) },
          { title: '비교 앵커', rows: countRows(metrics.anchor_category_counts) },
          { title: '가격 외 망설임', rows: countRows(metrics.hesitation_reason_counts) },
        ]
      }
      return [
        {
          title: '선호 가격',
          rows: countPctRows(metrics, 'preferred_price_counts', 'preferred_price_pct').map((row) => ({
            ...row,
            label: Number.isFinite(Number(row.label))
              ? `${Number(row.label).toLocaleString('ko-KR')}원`
              : row.label,
          })),
        },
        {
          title: '가격 후보별 수요',
          rows: objectRows(metrics.demand_by_price, (label, value) => ({
            label: `${Number(label).toLocaleString('ko-KR')}원`,
            count: numberFromRecord(value, 'count') ?? undefined,
            pct: numberFromRecord(value, 'pct'),
          })),
        },
        {
          title: '구매 의향',
          rows: countPctRows(metrics, 'intent_counts', 'intent_pct'),
        },
      ]
    case 'product_launch':
      return [
        { title: '출시 의향', rows: countPctRows(metrics, 'intent_counts', 'intent_pct') },
        { title: '점수 분포', rows: countPctRows(metrics, 'score_counts', 'score_pct') },
      ]
    case 'value_proposition':
      if (metrics.protocol_id === 'product_qa_v1') {
        return [
          {
            title: 'Product QA 최상위 후보',
            rows: choiceRows(metrics, 'top_choice_counts', 'top_choice_pct', metrics.artifacts),
          },
          {
            title: '가장 약한 후보',
            rows: choiceRows(metrics, 'bottom_choice_counts', 'bottom_choice_pct', metrics.artifacts),
          },
          {
            title: '평균 평가 점수',
            rows: scoreRows(metrics.average_scores),
          },
        ]
      }
      return [
        {
          title: '가치 제안 선택',
          rows: choiceRows(metrics, 'choice_counts', 'choice_pct', metrics.statements),
        },
      ]
    case 'market_segmentation':
      return [
        { title: '세그먼트 후보', rows: countPctRows(metrics, 'segment_counts', 'segment_pct') },
      ]
    case 'competitive_positioning':
      return [
        {
          title: '제품 선호',
          rows: choiceRows(metrics, 'preference_counts', 'preference_pct', metrics.products),
        },
      ]
    case 'brand_perception':
      return [
        { title: '브랜드 점수', rows: countPctRows(metrics, 'score_counts', 'score_pct') },
        { title: '연상어', rows: listRows(metrics.associations) },
      ]
    case 'churn_prediction':
      return [
        { title: '유지/이탈 의향', rows: countPctRows(metrics, 'intent_counts', 'intent_pct') },
        { title: '유지 훅', rows: listRows(metrics.retention_hooks) },
      ]
    case 'campaign_strategy':
      return [
        { title: '채널 선호', rows: countPctRows(metrics, 'channel_counts', 'channel_pct') },
        { title: '메시지 선호', rows: countPctRows(metrics, 'message_counts', 'message_pct') },
        { title: '상위 조합', rows: comboRows(metrics.best_combinations) },
      ]
    case 'open_survey':
      return [
        { title: '선택지별 응답', rows: countPctRows(metrics, 'choice_counts', 'choice_pct') },
      ]
    default:
      return []
  }
}

/**
 * 전용 결과 렌더러를 가진 시뮬레이션. 일반 섹션은 이 타입들의 metrics 키를
 * 모르므로 "1위 항목 N/A" 같은 빈 값을 전용 표 위에 겹쳐 그린다.
 */
export const DEDICATED_RESULT_RENDERERS = new Set(['campus_policy', 'campus_priority', 'open_survey'])

export function hasDedicatedRenderer(simulationType: string): boolean {
  return DEDICATED_RESULT_RENDERERS.has(simulationType)
}

function choiceRows(
  metrics: JsonObject,
  countKey: string,
  pctKey: string,
  details: unknown,
): MetricRow[] {
  const counts = isRecord(metrics[countKey]) ? metrics[countKey] : {}
  const pcts = isRecord(metrics[pctKey]) ? metrics[pctKey] : {}
  const detailMap = isRecord(details) ? details : {}
  return Object.entries(counts)
    .map(([label, count]) => ({
      label,
      count: asNumber(count) ?? 0,
      pct: asNumber(pcts[label]),
      detail: typeof detailMap[label] === 'string' ? String(detailMap[label]) : null,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
}

function countPctRows(metrics: JsonObject, countKey: string, pctKey: string): MetricRow[] {
  const counts = isRecord(metrics[countKey]) ? metrics[countKey] : {}
  const pcts = isRecord(metrics[pctKey]) ? metrics[pctKey] : {}
  return Object.entries(counts)
    .map(([label, count]) => ({
      label,
      count: asNumber(count) ?? 0,
      pct: asNumber(pcts[label]),
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
}

function countRows(value: unknown): MetricRow[] {
  if (!isRecord(value)) return []
  return Object.entries(value)
    .map(([label, count]) => ({
      label,
      count: asNumber(count) ?? 0,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
}

function scoreRows(value: unknown): MetricRow[] {
  if (!isRecord(value)) return []
  return Object.entries(value).map(([label, score]) => ({
    label,
    value: asNumber(score),
  }))
}

function objectRows(
  value: unknown,
  mapper: (label: string, value: unknown) => MetricRow,
): MetricRow[] {
  if (!isRecord(value)) return []
  return Object.entries(value).map(([label, item]) => mapper(label, item))
}

function listRows(value: unknown): MetricRow[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!isRecord(item)) return { label: String(item), value: null }
      return {
        label: String(item.label ?? item.name ?? '항목'),
        count: asNumber(item.count) ?? undefined,
        pct: asNumber(item.pct),
        value: asNumber(item.average_score) ?? undefined,
      }
    })
    .slice(0, 10)
}

function comboRows(value: unknown): MetricRow[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    if (!isRecord(item)) return { label: String(item) }
    return {
      label: String(item.label ?? '조합'),
      count: asNumber(item.count) ?? undefined,
      value: asNumber(item.average_score),
    }
  })
}

function letteredDetails(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) return {}
  return Object.fromEntries(value.map((item, index) => [String.fromCharCode(65 + index), String(item)]))
}

function numberFromRecord(value: unknown, key: string): number | null {
  return isRecord(value) ? asNumber(value[key]) : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
