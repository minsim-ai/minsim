import type { JsonObject, RawPersonaResult, RunResultEnvelope, SimulationType } from '../types/api'

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
  creative_testing: '크리에이티브 비교',
  price_optimization: '가격 최적화',
  product_launch: '신제품 반응',
  value_proposition: '가치 제안',
  market_segmentation: '시장 세분화',
  competitive_positioning: '경쟁 포지셔닝',
  brand_perception: '브랜드 인식',
  churn_prediction: '이탈 예측',
  campaign_strategy: '캠페인 전략',
}

export function getSimulationLabel(key: string): string {
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
      return [
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
    default:
      return []
  }
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
