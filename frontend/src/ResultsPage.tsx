import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ArrowLeft, Venus, Mars, CircleAlert, X, Download, Info } from 'lucide-react'
import { recordAnalyticsEvent } from './api/analytics'
import { APIError } from './api/client'
import { getRun, getRunExport, getRunPartials, getRunResult, submitRunFeedback } from './api/runs'
import { AuthStatus } from './components/AuthStatus'
import { runStateFixtures } from './data/runStateFixtures'
import {
  getMetricSections,
  getSimulationLabel,
  type MetricSection,
  type MetricRow,
} from './simulations/registry'
import type { JsonObject, RawPersonaResult, RunResultEnvelope, RunSnapshot } from './types/api'
import { personaDisplayName } from './v2/personaDisplay'
import { isMethodologyDisclaimer } from './v2/minsimReport'

const CHOICE_COLORS = ['#0066FF', '#00A878', '#7C3AED', '#D97706', '#64748B']
const KOREA_PROVINCE_MAP_PATH = '/maps/korea-provinces.svg'

const PROVINCE_ID_ALIASES: Record<string, string> = {
  서울: '서울특별시',
  부산: '부산광역시',
  대구: '대구광역시',
  인천: '인천광역시',
  광주: '광주광역시',
  대전: '대전광역시',
  울산: '울산광역시',
  세종: '세종특별자치시',
  경기: '경기도',
  경기도: '경기도',
  강원: '강원도',
  강원도: '강원도',
  충북: '충청북도',
  충청북: '충청북도',
  충청북도: '충청북도',
  충남: '충청남도',
  충청남: '충청남도',
  충청남도: '충청남도',
  전북: '전라북도',
  전라북: '전라북도',
  전라북도: '전라북도',
  전남: '전라남도',
  전라남: '전라남도',
  전라남도: '전라남도',
  경북: '경상북도',
  경상북: '경상북도',
  경상북도: '경상북도',
  경남: '경상남도',
  경상남: '경상남도',
  경상남도: '경상남도',
  제주: '제주특별자치도',
  제주특별자치도: '제주특별자치도',
}

type RankedMetricRow = MetricRow & {
  sectionTitle: string
  color: string
}

type SegmentCell = {
  label: string
  count: number
  pct: number
}

type SegmentMatrixRow = {
  segment: string
  total: number
  cells: SegmentCell[]
}

type SegmentMatrix = {
  id: string
  label: string
  columns: string[]
  rows: SegmentMatrixRow[]
}

type SegmentViewMode = 'table' | 'visual'

type SegmentSignal = {
  dimension: string
  segment: string
  winner: string
  pct: number
  total: number
  lift: number | null
}

type EvidenceQuote = {
  label: string
  meta: string
  body: string
  tone: 'positive' | 'neutral' | 'negative'
}

type AgentFinding = {
  metricKey: string
  finding: string
  evidence: string
  confidence: number | null
}

type AgentRecommendation = {
  priority: string
  action: string
  reason: string
}

type AgentRisk = {
  severity: string
  risk: string
  mitigation: string
}

type AgentReportView = {
  summary: string | null
  findings: AgentFinding[]
  headline: string | null
  recommendations: AgentRecommendation[]
  risks: AgentRisk[]
  qa: {
    passed: boolean | null
    severity: string | null
    warnings: string[]
    reviewNotes: string[]
    confidence: number | null
  }
}

type ReportAnalysis = {
  metricRows: RankedMetricRow[]
  winner: RankedMetricRow | null
  runnerUp: RankedMetricRow | null
  marginPct: number | null
  validResponses: number
  parseSuccessRate: number | null
  decisionLabel: string
  decisionBody: string
  confidenceLabel: string
  confidenceBody: string
  nextActions: string[]
  segmentMatrices: SegmentMatrix[]
  segmentSignals: SegmentSignal[]
  evidenceQuotes: EvidenceQuote[]
}

function readRunIdFromLocation(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('run_id') ?? localStorage.getItem('koresim:lastRunId')
}

function navigateToApp() {
  window.history.pushState(null, '', '/app?new=1')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

async function downloadExport(runId: string) {
  const report = await getRunExport(runId)
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `arabesque-${runId.slice(0, 8)}-report.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function compactJson(value: unknown): string {
  if (value === null || value === undefined) return '없음'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) return value.map(compactJson).join(', ')
  if (isRecord(value)) {
    const text = Object.entries(value)
      .filter(([, item]) => item !== null && item !== undefined && item !== '' && !(Array.isArray(item) && item.length === 0))
      .map(([key, item]) => `${key}: ${compactJson(item)}`)
      .join(' · ')
    return text || '없음'
  }
  return String(value)
}

function humanizeKey(key: string): string {
  const labels: Record<string, string> = {
    actual_sample_size: '실제 표본 수',
    age_buckets: '연령 구성',
    province: '지역 구성',
    sex: '성별 구성',
    choice_counts: '선택 수',
    choice_pct: '선택 비율',
    preference_counts: '제품 선호 수',
    preference_pct: '제품 선호 비율',
    intent_counts: '의향 수',
    intent_pct: '의향 비율',
    score_counts: '점수 분포',
    score_pct: '점수 비율',
    segment_counts: '세그먼트 수',
    segment_pct: '세그먼트 비율',
    channel_counts: '채널 선호 수',
    channel_pct: '채널 선호 비율',
    message_counts: '메시지 선호 수',
    message_pct: '메시지 선호 비율',
    creatives: '후보 문구',
    statements: '가치 제안',
    products: '제품 후보',
    reasons_by_choice: '선택 이유',
    breakdown_by_age: '연령대별 반응',
    breakdown_by_province: '지역별 반응',
    breakdown_by_sex: '성별 반응',
    parse_success_rate: '응답 해석 성공률',
    sample_quality_grade: '표본 품질',
    overall_grade: '전체 품질',
    exclude_unemployed: '무직 제외',
    metric: '분석 지표',
    choice: '선택',
    reason: '선택 이유',
    intent: '의향',
    segment: '세그먼트',
    preferred_price: '선호 가격',
    reaction: '반응',
    score: '점수',
    sentiment: '감성',
  }
  return labels[key] ?? key.replace(/^breakdown_by_/, '').replace(/_/g, ' ')
}

function yesNoLabel(value: unknown): string {
  if (value === true) return '예'
  if (value === false) return '아니오'
  return compactJson(value)
}

function shortenText(value: string, max = 72): string {
  return value.length > max ? `${value.slice(0, max).trim()}...` : value
}

function optionCodeLabel(label: string | null | undefined): string {
  if (!label) return 'N/A'
  return /^[A-Z]$/.test(label) ? `${label}안` : label
}

function choiceLabel(row: RankedMetricRow | MetricRow | null): string {
  if (!row) return 'N/A'
  return optionCodeLabel(row.label)
}

function choiceTitle(row: RankedMetricRow | MetricRow | null): string {
  if (!row) return '"N/A"'
  return `"${row.detail || choiceLabel(row)}"`
}

function choiceDisplayTitle(row: RankedMetricRow | MetricRow | null): string {
  if (!row) return 'N/A'
  return row.detail || choiceLabel(row)
}

function choiceCodeChip(row: RankedMetricRow | MetricRow | null): string | null {
  if (!row || !/^[A-Z]$/.test(row.label)) return null
  return `${row.label}안`
}

function segmentChoiceLabel(label: string): string {
  return optionCodeLabel(label)
}

function provincePathId(label: string): string {
  return PROVINCE_ID_ALIASES[label] ?? label
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '')
  const full = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized
  const value = Number.parseInt(full, 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function mixHex(source: string, target: string, sourcePct: number): string {
  const a = hexToRgb(source)
  const b = hexToRgb(target)
  const t = Math.max(0, Math.min(1, sourcePct / 100))
  const channel = (from: number, to: number) => Math.round(from * t + to * (1 - t))
  return `rgb(${channel(a.r, b.r)}, ${channel(a.g, b.g)}, ${channel(a.b, b.b)})`
}

function getPersonaName(raw: RawPersonaResult): string {
  return personaDisplayName(raw.persona, raw.uuid)
}

function getPersonaChoice(raw: RawPersonaResult): string | null {
  const parsed = raw.parsed
  if (!parsed) return null
  return asString(parsed.choice)
    ?? asString(parsed.intent)
    ?? asString(parsed.segment)
    ?? asString(parsed.primary)
    ?? asString(parsed.preferred_price)
    ?? asString(parsed.reaction)
}

function getPersonaChoiceText(raw: RawPersonaResult, optionMap: Map<string, RankedMetricRow>): string | null {
  const choice = getPersonaChoice(raw)
  if (!choice) return null
  return optionMap.get(choice)?.detail || optionCodeLabel(choice)
}

function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function getPersonaAvatarSrc(raw: RawPersonaResult): string {
  const index = (hashString(raw.uuid) % 31) + 1
  return `/landing/portraits/portrait-${String(index).padStart(2, '0')}.png`
}

function getReadablePersonaRows(raw: RawPersonaResult): Array<{ label: string; value: string }> {
  const persona = raw.persona
  const rows = [
    { label: '이름', value: getPersonaName(raw) },
    { label: '선택', value: getPersonaChoice(raw) },
    { label: '성별', value: asString(persona.sex) },
    { label: '나이', value: asNumber(persona.age) !== null ? `${asNumber(persona.age)}세` : null },
    {
      label: '지역',
      value: [asString(persona.province), asString(persona.district)].filter(Boolean).join(' ') || null,
    },
    { label: '직업', value: asString(persona.occupation) },
    { label: '학력', value: asString(persona.education_level) },
    { label: '가구', value: asString(persona.family_type) },
    { label: '관심사', value: asString(persona.hobbies_and_interests) },
  ]
  return rows
    .filter((row): row is { label: string; value: string } => Boolean(row.value))
    .map((row) => ({ ...row, value: shortenText(row.value, 160) }))
}

function getReadableParsedRows(raw: RawPersonaResult): Array<{ label: string; value: string }> {
  if (!raw.parsed) return []
  return Object.entries(raw.parsed)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({
      label: humanizeKey(key),
      value: shortenText(compactJson(value), 180),
    }))
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(asString).filter((item): item is string => Boolean(item))
}

function formatPercent(value: unknown): string {
  const number = asNumber(value)
  return number === null ? 'N/A' : `${Math.round(number)}%`
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function getInsightTitle(insight: JsonObject, index: number): string {
  const type = asString(insight.type)
  const choice = asString(insight.choice)
  if (type === 'top_choice' && choice) return `${choice}안이 가장 많이 선택됐습니다`
  if (type === 'segment_signal') return '특정 세그먼트에서 반응 차이가 보입니다'
  if (type === 'risk' || type === 'quality_warning') return '해석할 때 주의가 필요합니다'

  const title = asString(insight.title)
  if (title && !/creative|choice|count|pct|metric|_/.test(title.toLowerCase())) return title
  return `${index + 1}번째 인사이트`
}

function getInsightBody(insight: JsonObject): string {
  const type = asString(insight.type)
  const choice = asString(insight.choice)
  const count = asNumber(insight.count)
  const pct = asNumber(insight.pct)
  const evidence = asString(insight.evidence)

  if (type === 'top_choice' && choice && count !== null && pct !== null) {
    return `${choice}안이 ${formatNumber(count)}명(${formatPct(pct)})에게 선택되어 가장 강한 반응을 얻었습니다.`
  }
  if (evidence) return evidence

  const parts = Object.entries(insight)
    .filter(([key]) => !['type', 'title'].includes(key))
    .map(([key, value]) => `${humanizeKey(key)}: ${compactJson(value)}`)
  return parts.length > 0 ? parts.join(' · ') : '추가 설명이 없습니다.'
}

function getPersonaMeta(raw: RawPersonaResult): string {
  const persona = raw.persona
  const age = persona.age ? `${persona.age}세` : null
  const sex = asString(persona.sex)
  const province = asString(persona.province)
  const district = asString(persona.district)
  const occupation = asString(persona.occupation)
  return [sex, age, province && district ? `${province} ${district}` : province, occupation]
    .filter(Boolean)
    .join(' · ')
}

function getPersonaReason(raw: RawPersonaResult): string {
  const parsedReason = raw.parsed ? asString(raw.parsed.reason) : null
  if (parsedReason) return parsedReason
  return raw.response.length > 180 ? `${raw.response.slice(0, 180)}...` : raw.response
}

function getPersonaTone(raw: RawPersonaResult): 'positive' | 'neutral' | 'negative' {
  if (raw.error) return 'negative'
  const parsed = raw.parsed
  const score = parsed ? asNumber(parsed.score) : null
  if (score !== null) {
    if (score >= 4 || score >= 70) return 'positive'
    if (score <= 2 || score <= 35) return 'negative'
  }

  const intent = parsed
    ? asString(parsed.intent) ?? asString(parsed.reaction) ?? asString(parsed.sentiment) ?? asString(parsed.choice)
    : null
  const text = intent?.toLowerCase() ?? ''
  if (/(positive|high|buy|retain|prefer|like|strong|긍정|높음|구매|선호|유지|좋)/.test(text)) return 'positive'
  if (/(negative|low|churn|reject|dislike|weak|부정|낮음|이탈|거부|싫)/.test(text)) return 'negative'
  return 'neutral'
}

function hasExplicitPersonaTone(raw: RawPersonaResult): boolean {
  if (raw.error) return true
  const parsed = raw.parsed
  if (!parsed) return false
  if (asNumber(parsed.score) !== null) return true
  return Boolean(
    asString(parsed.intent) ??
    asString(parsed.reaction) ??
    asString(parsed.sentiment)
  )
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(value)
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A'
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`
}

function formatPoint(value: number): string {
  const abs = Math.abs(value)
  return `${value >= 0 ? '+' : '-'}${Number.isInteger(abs) ? abs : abs.toFixed(1)}pt`
}

function rowShortName(row: RankedMetricRow | MetricRow | null): string {
  if (!row) return 'N/A'
  return choiceLabel(row)
}

function flattenMetricRows(sections: MetricSection[]): RankedMetricRow[] {
  return sections
    .flatMap((section) => section.rows.map((row, index) => ({
      ...row,
      sectionTitle: section.title,
      color: CHOICE_COLORS[index % CHOICE_COLORS.length],
    })))
    .filter((row) => row.count !== undefined || row.pct !== undefined || row.value !== undefined)
    .sort((a, b) => {
      const pctDiff = (b.pct ?? -1) - (a.pct ?? -1)
      if (pctDiff !== 0) return pctDiff
      return (b.count ?? 0) - (a.count ?? 0)
    })
}

function dimensionLabel(key: string): string {
  if (key.includes('age')) return '연령대'
  if (key.includes('sex')) return '성별'
  if (key.includes('province')) return '지역'
  if (key.includes('occupation')) return '직업'
  if (key.includes('education')) return '학력'
  return key.replace(/^breakdown_by_/, '')
}

function buildSegmentMatrices(segments: JsonObject, metricRows: RankedMetricRow[]): SegmentMatrix[] {
  const preferredColumns = metricRows.map((row) => row.label)
  return Object.entries(segments)
    .filter(([, value]) => isRecord(value))
    .map(([key, value]) => {
      const rows = Object.entries(value as Record<string, unknown>)
        .filter(([, segmentValue]) => isRecord(segmentValue))
        .map(([segment, segmentValue]) => {
          const counts = segmentValue as Record<string, unknown>
          const discovered = Object.keys(counts)
          const matchedColumns = preferredColumns.filter((label) => label in counts)
          const columns = matchedColumns.length > 0 ? matchedColumns : discovered
          const total = discovered.reduce((sum, label) => sum + (asNumber(counts[label]) ?? 0), 0)
          return {
            segment,
            total,
            cells: columns.map((label) => {
              const count = asNumber(counts[label]) ?? 0
              return {
                label,
                count,
                pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
              }
            }),
          }
        })
        .filter((row) => row.total > 0)
      const columns = Array.from(new Set(rows.flatMap((row) => row.cells.map((cell) => cell.label))))
      return {
        id: key,
        label: dimensionLabel(key),
        columns,
        rows,
      }
    })
    .filter((matrix) => matrix.rows.length > 0)
}

function buildSegmentSignals(
  matrices: SegmentMatrix[],
  metricRows: RankedMetricRow[],
): SegmentSignal[] {
  const overallPct = new Map(metricRows.map((row) => [row.label, row.pct ?? null]))
  return matrices
    .flatMap((matrix) => matrix.rows.map((row) => {
      const winner = [...row.cells].sort((a, b) => b.count - a.count)[0]
      const basePct = overallPct.get(winner.label)
      return {
        dimension: matrix.label,
        segment: row.segment,
        winner: winner.label,
        pct: winner.pct,
        total: row.total,
        lift: basePct === null || basePct === undefined ? null : Math.round((winner.pct - basePct) * 10) / 10,
      }
    }))
    .sort((a, b) => {
      const liftA = Math.abs(a.lift ?? 0)
      const liftB = Math.abs(b.lift ?? 0)
      if (liftB !== liftA) return liftB - liftA
      return b.total - a.total
    })
    .slice(0, 8)
}

function collectEvidenceQuotes(result: RunResultEnvelope, metricRows: RankedMetricRow[]): EvidenceQuote[] {
  const quotes: EvidenceQuote[] = []
  const reasons = isRecord(result.metrics.reasons_by_choice) ? result.metrics.reasons_by_choice : {}
  for (const row of metricRows.slice(0, 3)) {
    const rowReasons = Array.isArray(reasons[row.label]) ? reasons[row.label] as unknown[] : []
    for (const reason of rowReasons.slice(0, 2)) {
      const text = asString(reason)
      if (text) {
        quotes.push({
          label: rowShortName(row),
          meta: row.sectionTitle,
          body: text,
          tone: row === metricRows[0] ? 'positive' : 'neutral',
        })
      }
    }
  }

  for (const raw of result.raw_results) {
    if (quotes.length >= 9) break
    const parsed = raw.parsed
    const reason = parsed
      ? asString(parsed.reason)
        ?? asString(parsed.rationale)
        ?? asString(parsed.explanation)
        ?? asString(parsed.barrier)
      : null
    const body = reason ?? (raw.error ? raw.error : null)
    if (!body || quotes.some((quote) => quote.body === body)) continue
    quotes.push({
      label: getPersonaName(raw),
      meta: getPersonaMeta(raw) || raw.uuid.slice(0, 8),
      body,
      tone: getPersonaTone(raw),
    })
  }
  return quotes
}

function buildNextActions(
  result: RunResultEnvelope,
  winner: RankedMetricRow | null,
  runnerUp: RankedMetricRow | null,
  marginPct: number | null,
  segmentSignals: SegmentSignal[],
): string[] {
  const actions: string[] = []
  const winnerName = choiceTitle(winner)
  const runnerName = choiceTitle(runnerUp)

  if (result.total_responses < 50) {
    actions.push('현재 결과는 방향성 확인용으로 보고, 동일 조건에서 50명 이상으로 재실행해 결론을 고정합니다.')
  } else if (result.total_responses < 200) {
    actions.push('외부 공유 전에는 200명 run으로 확장해 세그먼트별 흔들림을 한 번 더 확인합니다.')
  }

  if (winner && marginPct !== null && marginPct >= 12) {
    actions.push(`${winnerName}을 1차 후보로 두고, 후속 실험은 카피 세부 표현과 타겟 세그먼트 조정에 집중합니다.`)
  } else if (winner && runnerUp) {
    actions.push(`${winnerName}과 ${runnerName}의 격차가 크지 않으므로, 두 안을 남겨 실제 채널/소재 조건에서 재비교합니다.`)
  } else if (winner) {
    actions.push(`${winnerName}이 현재 집계의 중심입니다. 원문 응답을 검토해 선택 이유가 제품 전략과 맞는지 확인합니다.`)
  }

  if (segmentSignals.length > 0) {
    const signal = segmentSignals[0]
    actions.push(`${signal.dimension} ${signal.segment}에서 ${segmentChoiceLabel(signal.winner)} 반응이 두드러집니다. 전체용 메시지와 세그먼트 전용 메시지를 분리해 검토합니다.`)
  }

  switch (result.simulation_type) {
    case 'creative_testing':
      actions.push('승자안은 유지하되, runner-up에서 반복 등장한 이유를 headline 또는 sub-copy 후보로 가져옵니다.')
      break
    case 'price_optimization':
      actions.push('선호 가격만 보지 말고 상위 가격대의 이탈 이유를 묶어 가격 저항선을 확인합니다.')
      break
    case 'market_segmentation':
      actions.push('가장 큰 세그먼트보다 “명확한 pain과 구매 상황이 있는 세그먼트”를 우선 공략 후보로 봅니다.')
      break
    case 'campaign_strategy':
      actions.push('상위 채널과 메시지를 곱해서 운영 조합을 만들고, 약한 조합은 예산 배분에서 제외 후보로 둡니다.')
      break
    default:
      actions.push('수치가 높은 항목만 채택하지 말고 반대 응답과 세그먼트 편차를 함께 확인한 뒤 다음 실험 조건을 좁힙니다.')
      break
  }
  return Array.from(new Set(actions)).slice(0, 5)
}

function buildReportAnalysis(result: RunResultEnvelope, metricSections: MetricSection[]): ReportAnalysis {
  const metricRows = flattenMetricRows(metricSections)
  const winner = metricRows[0] ?? null
  const runnerUp = metricRows[1] ?? null
  const marginPct = winner?.pct !== undefined && winner.pct !== null
    && runnerUp?.pct !== undefined && runnerUp.pct !== null
    ? Math.round((winner.pct - runnerUp.pct) * 10) / 10
    : null
  const parseSuccessRate = asNumber(result.quality.parse_success_rate)
  const validResponses = Math.max(0, result.total_responses - result.parse_failed)
  const segmentMatrices = buildSegmentMatrices(result.segments, metricRows)
  const segmentSignals = buildSegmentSignals(segmentMatrices, metricRows)
  const evidenceQuotes = collectEvidenceQuotes(result, metricRows)

  let confidenceLabel: string
  let confidenceBody: string
  if (parseSuccessRate !== null && parseSuccessRate < 85) {
    confidenceLabel = '해석 주의'
    confidenceBody = '구조화 실패가 의미 있게 발생했습니다. 원문 응답 확인 후 결론을 좁히는 편이 좋습니다.'
  } else if (result.total_responses >= 200 && (parseSuccessRate ?? 0) >= 90) {
    confidenceLabel = '보고서 기준 충족'
    confidenceBody = '표본 규모와 구조화 성공률이 좋아 세그먼트 차이까지 함께 해석할 수 있습니다.'
  } else if (result.total_responses >= 50) {
    confidenceLabel = '의사결정 보조 가능'
    confidenceBody = '전체 방향성은 읽을 수 있고, 큰 세그먼트 차이는 보조 근거로 사용할 수 있습니다.'
  } else {
    confidenceLabel = '탐색용'
    confidenceBody = '빠른 탐색에는 충분하지만 외부 공유용 결론으로 쓰기에는 표본이 작습니다.'
  }

  let decisionLabel = winner ? choiceTitle(winner) : '집계 대기'
  let decisionBody = winner
    ? `가장 높은 반응은 ${choiceDisplayTitle(winner)}입니다. 이 후보를 중심으로 다음 실험 조건을 좁힐 수 있습니다.`
    : '집계 가능한 정량 결과가 아직 없습니다.'
  if (winner && runnerUp && marginPct !== null) {
    if (marginPct >= 15) {
      decisionLabel = choiceDisplayTitle(winner)
      decisionBody = `${choiceDisplayTitle(winner)} 후보가 ${choiceDisplayTitle(runnerUp)} 후보보다 ${formatPoint(marginPct)} 앞섰습니다. 전체 선택 구조에서 분명한 우위가 보이며, 바로 적용 후보로 검토할 만합니다.`
    } else if (marginPct <= 6) {
      decisionLabel = '박빙 구간'
      decisionBody = `${choiceDisplayTitle(winner)} 후보가 앞서지만 ${choiceDisplayTitle(runnerUp)} 후보와의 차이가 ${formatPoint(marginPct)}에 그쳐, 메시지 조합 또는 세그먼트 분리 검토가 필요합니다.`
    } else {
      decisionLabel = `${choiceDisplayTitle(winner)} 우세`
      decisionBody = `${choiceDisplayTitle(winner)} 후보가 앞서지만, ${choiceDisplayTitle(runnerUp)} 후보도 충분히 가까워 세그먼트별 선택 이유를 같이 봐야 합니다.`
    }
  }

  return {
    metricRows,
    winner,
    runnerUp,
    marginPct,
    validResponses,
    parseSuccessRate,
    decisionLabel,
    decisionBody,
    confidenceLabel,
    confidenceBody,
    nextActions: buildNextActions(result, winner, runnerUp, marginPct, segmentSignals),
    segmentMatrices,
    segmentSignals,
    evidenceQuotes,
  }
}

function buildAgentReportView(result: RunResultEnvelope): AgentReportView | null {
  const orchestration = result.orchestration
  if (!isRecord(orchestration) || !isRecord(orchestration.agents)) return null
  const analysis = isRecord(orchestration.agents.analysis) ? orchestration.agents.analysis : {}
  const report = isRecord(orchestration.agents.report) ? orchestration.agents.report : {}
  const qa = isRecord(orchestration.agents.qa) ? orchestration.agents.qa : {}
  const view = {
    summary: asString(analysis.summary) ?? asString(analysis.primary_insight),
    findings: parseAgentFindings(analysis.key_findings),
    headline: asString(report.headline),
    recommendations: parseAgentRecommendations(report.recommendations),
    risks: parseAgentRisks(report.risks),
    qa: {
      passed: typeof qa.passed === 'boolean' ? qa.passed : null,
      severity: asString(qa.severity),
      warnings: asStringArray(qa.warnings),
      reviewNotes: asStringArray(qa.review_notes),
      confidence: asNumber(qa.confidence),
    },
  }
  if (
    !view.summary &&
    !view.headline &&
    view.findings.length === 0 &&
    view.recommendations.length === 0 &&
    view.risks.length === 0 &&
    view.qa.passed === null
  ) {
    return null
  }
  return view
}

function parseAgentFindings(value: unknown): AgentFinding[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (isRecord(item)) {
      const finding = asString(item.finding)
      if (!finding) return []
      return [{
        metricKey: asString(item.metric_key) ?? 'metric',
        finding,
        evidence: asString(item.evidence) ?? '근거 없음',
        confidence: asNumber(item.confidence),
      }]
    }
    const text = asString(item)
    return text ? [{ metricKey: 'metric', finding: text, evidence: '근거 없음', confidence: null }] : []
  })
}

function parseAgentRecommendations(value: unknown): AgentRecommendation[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (isRecord(item)) {
      const action = asString(item.action)
      if (!action) return []
      return [{
        priority: asString(item.priority) ?? 'medium',
        action,
        reason: asString(item.reason) ?? '근거 없음',
      }]
    }
    const text = asString(item)
    return text ? [{ priority: 'medium', action: text, reason: '근거 없음' }] : []
  })
}

function parseAgentRisks(value: unknown): AgentRisk[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (isRecord(item)) {
      const risk = asString(item.risk)
      if (!risk) return []
      return [{
        severity: asString(item.severity) ?? 'medium',
        risk,
        mitigation: asString(item.mitigation) ?? '완화책 없음',
      }]
    }
    const text = asString(item)
    return text ? [{ severity: 'medium', risk: text, mitigation: '완화책 없음' }] : []
  })
}

function qaSeverityLabel(severity: string | null): string {
  switch (severity) {
    case 'pass':
      return '통과'
    case 'directional_only':
      return '방향성 검증'
    case 'warning':
      return '주의'
    case 'fail':
      return '실패'
    default:
      return '미확인'
  }
}

function runStatusLabel(status: string): string {
  switch (status) {
    case 'completed':
      return '완료'
    case 'running':
      return '실행 중'
    case 'queued':
      return '대기 중'
    case 'failed':
      return '실패'
    case 'interrupted':
      return '중단됨'
    case 'canceled':
      return '취소됨'
    default:
      return status
  }
}

function displayRunId(runId: string | null | undefined): string {
  if (!runId) return '실행 ID 없음'
  return runId.startsWith('fixture-') ? '샘플 결과' : `실행 ID ${runId.slice(0, 8)}`
}

function userFacingError(message: string | null | undefined): string {
  const text = message ?? '알 수 없는 오류가 발생했습니다.'
  if (/timed out/i.test(text)) {
    return '응답 생성 시간이 초과됐습니다. 잠시 후 다시 실행하거나 표본 수를 줄여서 시도해주세요.'
  }
  if (/auth|required|login/i.test(text)) {
    return '로그인이 필요합니다. 로그인한 뒤 다시 시도해주세요.'
  }
  return text
}

function qaPassedLabel(passed: boolean | null): string {
  if (passed === null) return '검수 결과 없음'
  return passed ? '검수 통과' : '검토 필요'
}

function priorityLabel(value: string): string {
  switch (value) {
    case 'high':
      return '높음'
    case 'medium':
      return '중간'
    case 'low':
      return '낮음'
    default:
      return value
  }
}

function severityLabel(value: string): string {
  switch (value) {
    case 'high':
    case 'warning':
      return '주의'
    case 'medium':
      return '검토'
    case 'low':
      return '낮음'
    case 'fail':
      return '실패'
    default:
      return value
  }
}

function Shell({
  children,
  subtitle,
}: {
  children: React.ReactNode
  subtitle?: string
}) {
  return (
    <div style={{ minHeight:'100vh', background:'var(--color-bg-alt)', fontFamily:'var(--font-body)' }}>
      <header style={{
        position:'sticky',
        top:0,
        zIndex:50,
        height:60,
        padding:'0 32px',
        borderBottom:'1px solid transparent',
        background:'transparent',
        backdropFilter:'none',
        display:'flex',
        alignItems:'center',
        gap:16,
      }}>
        <button
          onClick={navigateToApp}
          style={{
            display:'flex',
            alignItems:'center',
            gap:6,
            padding:'6px 14px',
            borderRadius:'var(--radius-pill)',
            border:'1px solid var(--color-border)',
            background:'transparent',
            color:'var(--color-fg)',
            cursor:'pointer',
            fontSize:13,
            flexShrink:0,
          }}
        >
          <ArrowLeft size={14} strokeWidth={2.5} />시뮬레이션 시작하기
        </button>
        <div style={{ minWidth:0, flex:1 }}>
          <p style={{ margin:0, fontSize:14, fontWeight:700, color:'var(--color-fg-strong)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            Arabesque 결과
          </p>
          {subtitle && (
            <p style={{ margin:'2px 0 0', fontSize:12, color:'var(--color-fg-subtle)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {subtitle}
            </p>
          )}
        </div>
        <AuthStatus compact />
      </header>
      {children}
    </div>
  )
}

function StatePanel({
  title,
  body,
  tone = 'neutral',
  runId,
  primaryActionLabel = '앱으로 돌아가기',
  secondaryActionLabel,
}: {
  title: string
  body: string
  tone?: 'neutral' | 'warning'
  runId?: string | null
  primaryActionLabel?: string
  secondaryActionLabel?: string
}) {
  return (
    <Shell subtitle={title}>
      <main style={{ maxWidth:760, margin:'0 auto', padding:'72px 32px' }}>
        <section style={{
          border:'1px solid var(--color-border)',
          borderRadius:12,
          background:'var(--color-bg)',
          padding:28,
          display:'grid',
          gap:14,
        }}>
          {tone === 'warning' && <CircleAlert size={24} color='var(--color-status-destructive)' />}
          <h1 style={{ margin:0, fontSize:24, color:'var(--color-fg-strong)' }}>{title}</h1>
          <p style={{ margin:0, fontSize:15, lineHeight:1.7, color:'var(--color-fg-muted)' }}>{body}</p>
          {runId && (
            <p style={{ margin:'2px 0 0', color:'var(--color-fg-subtle)', fontSize:12 }}>
              오류 확인 ID: {displayRunId(runId)}
            </p>
          )}
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            <button
              onClick={navigateToApp}
              style={{
                padding:'9px 18px',
                borderRadius:'var(--radius-pill)',
                border:'none',
                background:'var(--color-primary)',
                color:'var(--color-fg-on-primary)',
                fontWeight:700,
                cursor:'pointer',
              }}
            >
              {primaryActionLabel}
            </button>
            {secondaryActionLabel && (
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding:'9px 18px',
                  borderRadius:'var(--radius-pill)',
                  border:'1px solid var(--color-border)',
                  background:'var(--color-bg)',
                  color:'var(--color-fg)',
                  fontWeight:700,
                  cursor:'pointer',
                }}
              >
                {secondaryActionLabel}
              </button>
            )}
          </div>
        </section>
      </main>
    </Shell>
  )
}

function countEntries(value: unknown): Array<{ label: string; count: number }> {
  if (!isRecord(value)) return []
  return Object.entries(value)
    .map(([label, item]) => ({ label, count: asNumber(item) ?? 0 }))
    .filter((item) => item.count > 0)
}

function sampleOrder(label: string): number {
  const age = Number(label.match(/\d+/)?.[0])
  if (Number.isFinite(age)) return age
  return label.localeCompare('가')
}

function SampleBars({
  title,
  entries,
  compact = false,
}: {
  title: string
  entries: Array<{ label: string; count: number }>
  compact?: boolean
}) {
  const total = entries.reduce((sum, item) => sum + item.count, 0)
  const visible = compact ? [...entries].sort((a, b) => b.count - a.count).slice(0, 8) : entries
  if (visible.length === 0) return null
  return (
    <div className="ks-sample-bars">
      <p>{title}</p>
      {visible.map((entry) => {
        const pct = total > 0 ? (entry.count / total) * 100 : 0
        return (
          <div className="ks-sample-bar-row" key={entry.label}>
            <span>{entry.label}</span>
            <div><b style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} /></div>
            <strong>{formatNumber(entry.count)}명</strong>
          </div>
        )
      })}
    </div>
  )
}

function SampleSummaryVisual({ summary }: { summary: JsonObject }) {
  const actualSampleSize = asNumber(summary.actual_sample_size)
  const ageEntries = countEntries(summary.age_buckets).sort((a, b) => sampleOrder(a.label) - sampleOrder(b.label))
  const sexEntries = countEntries(summary.sex)
  const provinceEntries = countEntries(summary.province)

  return (
    <div className="ks-sample-summary">
      {actualSampleSize !== null && (
        <div className="ks-sample-total">
          <p>실제 분석 표본</p>
          <strong>{formatNumber(actualSampleSize)}명</strong>
        </div>
      )}
      <SampleBars title="연령대" entries={ageEntries} />
      <SampleBars title="성별" entries={sexEntries} />
      <SampleBars title="지역 상위 분포" entries={provinceEntries} compact />
    </div>
  )
}

function TargetFilterSummary({ targetFilter }: { targetFilter: JsonObject }) {
  const entries = Object.entries(targetFilter)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
  if (entries.length === 0) {
    return <p className="ks-report-muted-text">별도 타겟 조건 없이 전체 표본을 사용했습니다.</p>
  }
  return (
    <dl className="ks-target-filter-list">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{humanizeKey(key)}</dt>
          <dd>{typeof value === 'boolean' ? yesNoLabel(value) : compactJson(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function TrustLayer({
  result,
  snapshot,
  analysis,
}: {
  result: RunResultEnvelope
  snapshot: RunSnapshot | null
  analysis: ReportAnalysis
}) {
  const parseSuccessRate = result.quality.parse_success_rate
  const generatedAt = snapshot?.completed_at ?? snapshot?.updated_at ?? snapshot?.created_at
  const cards = [
    { label: '응답 커버리지', value: `${formatNumber(result.total_responses)}/${formatNumber(result.sample_size)}` },
    { label: '구조화 성공', value: formatPercent(parseSuccessRate) },
    { label: '해석 범위', value: analysis.confidenceLabel },
    { label: '유효 응답', value: `${formatNumber(analysis.validResponses)}명` },
  ]

  return (
    <Section title="방법론과 신뢰 정보" kicker="검증 정보">
      <div className="ks-report-trust-grid">
        {cards.map((card) => (
          <div key={card.label} className="ks-report-trust-card">
            <p>{card.label}</p>
            <strong>{card.value}</strong>
          </div>
        ))}
      </div>
      <div className="ks-report-two-col">
        <div>
          <p className="ks-report-kv-label">표본 구성</p>
          <SampleSummaryVisual summary={result.sample_summary} />
        </div>
        <div>
          <p className="ks-report-kv-label">재현 정보</p>
          <p className="ks-report-muted-text">
            seed {result.seed} · {formatDate(generatedAt)}
          </p>
          <p className="ks-report-kv-label ks-report-kv-label--sub">타겟 조건</p>
          <TargetFilterSummary targetFilter={result.target_filter} />
        </div>
      </div>
      {result.warnings.filter((warning) => !isMethodologyDisclaimer(warning)).length > 0 && (
        <div className="ks-report-warning">
          <p>해석 유의사항</p>
          <ul>
            {result.warnings
              .filter((warning) => !isMethodologyDisclaimer(warning))
              .map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}
    </Section>
  )
}

function MetricDistribution({ section }: { section: MetricSection }) {
  if (section.rows.length === 0) {
    return (
      <Section title={section.title}>
        <p className="ks-report-muted-text">집계 가능한 선택 결과가 없습니다.</p>
      </Section>
    )
  }

  return (
    <Section title={section.title}>
      <div className="ks-metric-distribution">
        {section.rows.map((row, index) => {
          const color = CHOICE_COLORS[index % CHOICE_COLORS.length]
          const pct = row.pct ?? 0
          const chip = choiceCodeChip(row)
          return (
            <article className="ks-metric-distribution-row" key={`${row.label}-${index}`}>
              <div className="ks-metric-distribution-head">
                <div>
                  <p>{choiceDisplayTitle(row)}</p>
                  {chip && <span>{chip}</span>}
                </div>
                <strong style={{ color }}>
                  {row.value ?? `${row.count ?? 0}명`}{row.pct !== null && row.pct !== undefined ? ` · ${row.pct}%` : ''}
                </strong>
              </div>
              {row.pct !== null && row.pct !== undefined && (
                <div className="ks-metric-distribution-track">
                  <span style={{ width:`${Math.max(0, Math.min(100, pct))}%`, background:color }} />
                </div>
              )}
            </article>
          )
        })}
      </div>
    </Section>
  )
}

function Section({
  title,
  children,
  kicker,
  wide = false,
}: {
  title: string
  children: React.ReactNode
  kicker?: string
  wide?: boolean
}) {
  return (
    <section className={`ks-report-section${wide ? ' ks-report-section--wide' : ''}`}>
      <div>
        {kicker && <p className="ks-report-section-kicker">{kicker}</p>}
        <h2 className="ks-report-section-title">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function InsightList({ insights }: { insights: JsonObject[] }) {
  return (
    <Section title="인사이트">
      {insights.length === 0 ? (
        <p style={{ margin:0, color:'var(--color-fg-muted)', fontSize:14 }}>생성된 인사이트가 없습니다.</p>
      ) : (
        <div className="ks-insight-list">
          {insights.map((insight, index) => (
            <article key={`${getInsightTitle(insight, index)}-${index}`} className="ks-insight-card">
              <h3>{getInsightTitle(insight, index)}</h3>
              <p>{getInsightBody(insight)}</p>
            </article>
          ))}
        </div>
      )}
    </Section>
  )
}

function ResultFeedback({ result }: { result: RunResultEnvelope }) {
  const [usefulnessScore, setUsefulnessScore] = useState(4)
  const [trustScore, setTrustScore] = useState(4)
  const [actionabilityScore, setActionabilityScore] = useState(4)
  const [intendedAction, setIntendedAction] = useState('')
  const [freeText, setFreeText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    setError(null)
    submitRunFeedback(result.run_id, {
      usefulness_score: usefulnessScore,
      trust_score: trustScore,
      actionability_score: actionabilityScore,
      result_expectation: 'result_viewed',
      intended_action: intendedAction.trim() || null,
      free_text: freeText.trim() || null,
    })
      .then(() => setSubmitted(true))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  return (
    <Section title="결과 피드백">
      <div className="ks-feedback-card">
        {submitted ? (
          <p className="ks-feedback-done">피드백을 저장했습니다. 이 데이터는 결과 품질과 제품 개선에 사용됩니다.</p>
        ) : (
          <>
            <div className="ks-feedback-scores">
              <ScoreControl label="유용성" value={usefulnessScore} onChange={setUsefulnessScore} />
              <ScoreControl label="신뢰도" value={trustScore} onChange={setTrustScore} />
              <ScoreControl label="실행성" value={actionabilityScore} onChange={setActionabilityScore} />
            </div>
            <label className="ks-feedback-field">
              <span>이 결과로 무엇을 할 예정인가요?</span>
              <input
                value={intendedAction}
                onChange={(event) => setIntendedAction(event.target.value)}
                placeholder="예: 19,900원은 보류하고 14,900원 trial을 먼저 테스트"
              />
            </label>
            <label className="ks-feedback-field">
              <span>부족했던 점</span>
              <textarea
                rows={3}
                value={freeText}
                onChange={(event) => setFreeText(event.target.value)}
                placeholder="결과 해석, 질문 흐름, 보고서에서 아쉬웠던 점을 적어주세요."
              />
            </label>
            {error && <p className="ks-feedback-error">{error}</p>}
            <button className="ks-chat-btn ks-chat-btn--primary" type="button" onClick={submit}>
              피드백 저장
            </button>
          </>
        )}
      </div>
    </Section>
  )
}

function ScoreControl({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {[1, 2, 3, 4, 5].map((score) => (
          <option key={score} value={score}>{score}점</option>
        ))}
      </select>
    </label>
  )
}

function ReportHero({
  result,
  analysis,
  exportError,
  onExport,
}: {
  result: RunResultEnvelope
  analysis: ReportAnalysis
  exportError: string | null
  onExport: () => void
}) {
  const winner = analysis.winner
  const runner = analysis.runnerUp
  const winnerChip = choiceCodeChip(winner)
  const runnerChip = choiceCodeChip(runner)
  return (
    <section className="ks-report-hero">
      <div className="ks-report-hero-copy">
        <p className="ks-report-eyebrow">{getSimulationLabel(result.simulation_type)} 분석 보고서</p>
        {winnerChip && <span className="ks-report-option-chip">{winnerChip} 선두</span>}
        <h1>{analysis.decisionLabel}</h1>
        <p>{analysis.decisionBody}</p>
        <div className="ks-report-hero-metrics" aria-label="핵심 지표">
          <article>
            <p>응답 표본</p>
            <strong>{formatNumber(analysis.validResponses)}명</strong>
            <span>전체 {formatNumber(result.total_responses)}명 중 해석 가능</span>
          </article>
          <article>
            <p>선호 격차</p>
            <strong>{analysis.marginPct !== null ? formatPoint(analysis.marginPct) : 'N/A'}</strong>
            <span>{runner ? `${choiceDisplayTitle(runner)} 대비` : '비교 후보 부족'}</span>
          </article>
          <article>
            <p>해석 상태</p>
            <strong>{analysis.confidenceLabel}</strong>
            <span>{analysis.parseSuccessRate !== null ? `구조화 성공 ${formatPct(analysis.parseSuccessRate)}` : '구조화율 없음'}</span>
          </article>
        </div>
        <div className="ks-report-hero-actions">
          <button className="ks-report-export" onClick={onExport} type="button">
            <Download size={15} strokeWidth={2.2} />
            검토용 보고서 내보내기
          </button>
          <span>{displayRunId(result.run_id)} · n={formatNumber(result.total_responses)}</span>
        </div>
        {exportError && <p className="ks-report-export-error">Export failed: {exportError}</p>}
      </div>
      <div className="ks-report-hero-panel">
        <div>
          <p>최종 판단</p>
          <strong>{analysis.confidenceLabel}</strong>
          <span>{analysis.confidenceBody}</span>
        </div>
        <div>
          <p>1위 항목</p>
          <strong>{choiceDisplayTitle(winner)}</strong>
          <span>{winner?.pct !== undefined ? `${formatPct(winner.pct)} · ${winner.count ?? 0}명` : '집계 없음'}</span>
          {winnerChip && <span>{winnerChip}</span>}
        </div>
        <div>
          <p>비교 기준</p>
          <strong>{runner ? choiceDisplayTitle(runner) : 'N/A'}</strong>
          <span>{analysis.marginPct !== null ? `격차 ${formatPoint(analysis.marginPct)}` : '격차 산출 불가'}</span>
          {runnerChip && <span>{runnerChip}</span>}
        </div>
      </div>
    </section>
  )
}

function ExecutiveSummary({ analysis }: { analysis: ReportAnalysis }) {
  const rows = [
    {
      label: '무엇을 선택할까',
      value: analysis.decisionLabel,
      body: analysis.decisionBody,
    },
    {
      label: '신뢰도',
      value: analysis.confidenceLabel,
      body: analysis.confidenceBody,
      info: '표본 수, 응답 해석 성공률, 세그먼트 비교 가능성을 합쳐 판단한 내부 기준입니다.',
    },
    {
      label: '승자 격차',
      value: analysis.marginPct !== null ? formatPoint(analysis.marginPct) : 'N/A',
      body: analysis.marginPct !== null
        ? '격차가 클수록 전체 시장 반응의 방향이 안정적입니다. 작은 격차는 세그먼트별 분리 해석이 필요합니다.'
        : '비율 정보가 없어 격차를 정량화하지 못했습니다.',
    },
  ]
  return (
    <Section title="핵심 요약" kicker="의사결정">
      <div className="ks-report-brief-grid">
        {rows.map((row) => (
          <article key={row.label} className="ks-report-brief-card">
            <p>
              {row.label}
              {'info' in row && row.info && (
                <button className="ks-info-button" title={row.info} aria-label={row.info} type="button">
                  <Info size={13} strokeWidth={2.4} />
                </button>
              )}
            </p>
            <strong>{row.value}</strong>
            <span>{row.body}</span>
          </article>
        ))}
      </div>
      {analysis.nextActions.length > 0 && (
        <div className="ks-report-action-list">
          <p>권장 액션</p>
          <ol>
            {analysis.nextActions.map((action) => <li key={action}>{action}</li>)}
          </ol>
        </div>
      )}
    </Section>
  )
}

function AgentReportPanel({ result }: { result: RunResultEnvelope }) {
  const agentReport = buildAgentReportView(result)
  if (!agentReport) return null
  const qaLabel = qaSeverityLabel(agentReport.qa.severity)
  const qaClass = agentReport.qa.severity ? ` ks-agent-qa--${agentReport.qa.severity}` : ''

  return (
    <Section title="AI 해석 보고서" kicker="분석·보고·검수">
      <div className="ks-agent-summary">
        <div>
          <p>핵심 결론</p>
          <strong>{agentReport.headline ?? '핵심 결론 없음'}</strong>
          {agentReport.summary && <span>{agentReport.summary}</span>}
        </div>
        <div className={`ks-agent-qa${qaClass}`}>
          <p>검수 상태</p>
          <strong>{qaLabel}</strong>
          <span>
            {qaPassedLabel(agentReport.qa.passed)}
            {agentReport.qa.confidence !== null ? ` · 신뢰도 ${Math.round(agentReport.qa.confidence * 100)}%` : ''}
          </span>
        </div>
      </div>

      <div className="ks-agent-grid">
        <div className="ks-agent-panel">
          <h3>핵심 발견</h3>
          {agentReport.findings.length === 0 ? (
            <p className="ks-report-muted-text">구조화된 핵심 발견이 없습니다.</p>
          ) : (
            <ul>
              {agentReport.findings.map((finding, index) => (
                <li key={`${finding.metricKey}-${index}`}>
                  <b>{humanizeKey(finding.metricKey)}</b>
                  <span>{finding.finding}</span>
                  <small>{finding.evidence}{finding.confidence !== null ? ` · ${Math.round(finding.confidence * 100)}%` : ''}</small>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ks-agent-panel">
          <h3>추천 행동</h3>
          {agentReport.recommendations.length === 0 ? (
            <p className="ks-report-muted-text">구조화된 권고가 없습니다.</p>
          ) : (
            <ol>
              {agentReport.recommendations.map((item, index) => (
                <li key={`${item.priority}-${index}`}>
                  <b>{priorityLabel(item.priority)}</b>
                  <span>{item.action}</span>
                  <small>{item.reason}</small>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="ks-agent-panel">
          <h3>주의할 점</h3>
          {agentReport.risks.length === 0 ? (
            <p className="ks-report-muted-text">구조화된 리스크가 없습니다.</p>
          ) : (
            <ul>
              {agentReport.risks.map((item, index) => (
                <li key={`${item.severity}-${index}`}>
                  <b>{severityLabel(item.severity)}</b>
                  <span>{item.risk}</span>
                  <small>{item.mitigation}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {(agentReport.qa.warnings.length > 0 || agentReport.qa.reviewNotes.length > 0) && (
        <div className="ks-agent-notes">
          <h3>검수 메모</h3>
          <ul>
            {[...agentReport.qa.warnings, ...agentReport.qa.reviewNotes].map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}

function ProtocolPanel({ result }: { result: RunResultEnvelope }) {
  const protocol = isRecord(result.protocol) ? result.protocol : null
  if (!protocol) return null
  const protocolId = asString(protocol.protocol_id) ?? asString(result.metrics.protocol_id) ?? 'protocol'
  const calibration = isRecord(result.metrics.calibration) ? result.metrics.calibration : null
  const interviewGuide = isRecord(protocol.interview_guide) ? protocol.interview_guide : null
  const stepSummaries = Array.isArray(protocol.step_summaries)
    ? protocol.step_summaries.filter(isRecord)
    : []
  return (
    <Section title="리서치 프로토콜" kicker={protocolId}>
      <div className="ks-agent-grid">
        {stepSummaries.length > 0 && (
          <div className="ks-agent-panel">
            <h3>진행 단계</h3>
            <ul>
              {stepSummaries.map((step, index) => (
                <li key={`${asString(step.id) ?? 'step'}-${index}`}>
                  <b>{humanizeKey(asString(step.id) ?? `step_${index + 1}`)}</b>
                  <span>
                    parsed {String(step.parsed_count ?? 0)} · failed {String(step.parse_failed ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {calibration && <CalibrationPanel calibration={calibration} />}
        {interviewGuide && <InterviewGuidePanel guide={interviewGuide} />}
      </div>
    </Section>
  )
}

function CalibrationPanel({ calibration }: { calibration: Record<string, unknown> }) {
  const [view, setView] = useState<'weighted' | 'sample'>('weighted')
  const weightedPct = isRecord(calibration.weighted_pct) ? calibration.weighted_pct : {}
  const weightedCounts = isRecord(calibration.weighted_counts) ? calibration.weighted_counts : {}
  const sampleDistribution = isRecord(calibration.sample_distribution) ? calibration.sample_distribution : {}
  const rows = Object.entries(view === 'weighted' ? weightedPct : sampleDistribution)
  const warnings = Array.isArray(calibration.warnings) ? calibration.warnings.map(String) : []
  return (
    <div className="ks-agent-panel">
      <h3>보정 결과</h3>
      <div className="ks-report-tabs" role="tablist" aria-label="Calibration view">
        <button
          aria-selected={view === 'weighted'}
          className={view === 'weighted' ? 'is-active' : ''}
          onClick={() => setView('weighted')}
          type="button"
        >
          보정 후
        </button>
        <button
          aria-selected={view === 'sample'}
          className={view === 'sample' ? 'is-active' : ''}
          onClick={() => setView('sample')}
          type="button"
        >
          표본 분포
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="ks-report-muted-text">보정 가능한 집계가 없습니다.</p>
      ) : (
        <ul>
          {rows.map(([label, value]) => (
            <li key={label}>
              <b>{label}</b>
              <span>
                {view === 'weighted'
                  ? `${formatPercent(asNumber(value))} · ${formatNumber(asNumber(weightedCounts[label]) ?? 0)} weighted`
                  : `${formatNumber(asNumber(value) ?? 0)}명`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && <small>{warnings.join(' · ')}</small>}
    </div>
  )
}

function InterviewGuidePanel({ guide }: { guide: Record<string, unknown> }) {
  const questions = Array.isArray(guide.questions) ? guide.questions.filter(isRecord) : []
  return (
    <div className="ks-agent-panel">
      <h3>다음 인터뷰 질문</h3>
      {questions.length === 0 ? (
        <p className="ks-report-muted-text">생성된 인터뷰 질문이 없습니다.</p>
      ) : (
        <ol>
          {questions.map((item, index) => (
            <li key={`${asString(item.slot_id) ?? 'question'}-${index}`}>
              <b>{asString(item.question) ?? '질문 없음'}</b>
              <span>{asString(item.why_this_question) ?? '근거 없음'}</span>
              {isRecord(item.evidence) && <small>{compactJson(item.evidence)}</small>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function MetricNarrative({ analysis }: { analysis: ReportAnalysis }) {
  if (analysis.metricRows.length === 0) {
    return (
      <Section title="주요 지표 해석" kicker="시장 반응">
        <p className="ks-report-muted-text">집계 가능한 지표가 아직 없습니다.</p>
      </Section>
    )
  }

  return (
    <Section title="주요 지표 해석" kicker="시장 반응">
      <div className="ks-report-rank-list">
        {analysis.metricRows.slice(0, 8).map((row, index) => (
          <div className="ks-report-rank-row" key={`${row.sectionTitle}-${row.label}`}>
            <span className="ks-report-rank-index">{index + 1}</span>
            <div>
              <p>{choiceDisplayTitle(row)}</p>
              <span>{choiceCodeChip(row) ? `${row.sectionTitle} · ${choiceCodeChip(row)}` : row.sectionTitle}</span>
            </div>
            <strong style={{ color: row.color }}>
              {row.pct !== null && row.pct !== undefined ? formatPct(row.pct) : row.value ?? `${row.count ?? 0}명`}
            </strong>
            {row.pct !== null && row.pct !== undefined && (
              <div className="ks-report-rank-bar">
                <span style={{ width: `${Math.max(0, Math.min(100, row.pct))}%`, background: row.color }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

function SegmentSignalTable({ signals }: { signals: SegmentSignal[] }) {
  return (
    <Section title="세그먼트별 해석 포인트" kicker="세그먼트 신호">
      {signals.length === 0 ? (
        <p className="ks-report-muted-text">비교 가능한 세그먼트 신호가 없습니다.</p>
      ) : (
        <div className="ks-report-signal-table">
          {signals.map((signal) => (
            <article key={`${signal.dimension}-${signal.segment}-${signal.winner}`}>
              <div>
                <p>{signal.dimension} · {signal.segment}</p>
                <strong>{segmentChoiceLabel(signal.winner)} 반응 집중</strong>
              </div>
              <span>{formatPct(signal.pct)} · {formatNumber(signal.total)}명</span>
              <em>{signal.lift !== null ? `전체 대비 ${formatPoint(signal.lift)}` : '전체 기준 없음'}</em>
            </article>
          ))}
        </div>
      )}
    </Section>
  )
}

function colorForColumn(columns: string[], label: string): string {
  const index = Math.max(0, columns.indexOf(label))
  return CHOICE_COLORS[index % CHOICE_COLORS.length]
}

function sortedMatrixRows(matrix: SegmentMatrix): SegmentMatrixRow[] {
  if (matrix.id.includes('age')) {
    return [...matrix.rows].sort((a, b) => sampleOrder(a.segment) - sampleOrder(b.segment))
  }
  return [...matrix.rows].sort((a, b) => b.total - a.total)
}

function MatrixStackedBars({ matrix }: { matrix: SegmentMatrix }) {
  return (
    <div className="ks-segment-stack-bars">
      {sortedMatrixRows(matrix).map((row) => (
        <article key={row.segment} className="ks-segment-stack-row">
          <div>
            <strong>{row.segment}</strong>
            <span>{formatNumber(row.total)}명</span>
          </div>
          <div className="ks-segment-stack-track">
            {row.cells
              .filter((cell) => cell.count > 0)
              .map((cell) => (
                <span
                  key={cell.label}
                  style={{
                    width: `${Math.max(3, Math.min(100, cell.pct))}%`,
                    background: colorForColumn(matrix.columns, cell.label),
                  }}
                  title={`${cell.label}: ${cell.count}명 · ${formatPct(cell.pct)}`}
                />
              ))}
          </div>
          <p>
            {row.cells
              .filter((cell) => cell.count > 0)
              .sort((a, b) => b.count - a.count)
              .map((cell) => `${cell.label} ${formatPct(cell.pct)}`)
              .join(' · ')}
          </p>
        </article>
      ))}
    </div>
  )
}

function GenderSegmentBars({ matrix }: { matrix: SegmentMatrix }) {
  return (
    <div className="ks-gender-bars">
      {sortedMatrixRows(matrix).map((row) => {
        const winner = [...row.cells].sort((a, b) => b.count - a.count)[0]
        const isFemale = row.segment.includes('여')
        return (
          <article key={row.segment}>
            <div className="ks-gender-icon" aria-hidden="true">
              {isFemale ? <Venus size={22} /> : <Mars size={22} />}
            </div>
            <div>
              <strong>{row.segment}</strong>
              <span>{formatNumber(row.total)}명 · {winner ? `${segmentChoiceLabel(winner.label)} ${formatPct(winner.pct)}` : '집계 없음'}</span>
              <div className="ks-segment-stack-track">
                {row.cells
                  .filter((cell) => cell.count > 0)
                  .map((cell) => (
                    <span
                      key={cell.label}
                      style={{
                        width: `${Math.max(3, Math.min(100, cell.pct))}%`,
                        background: colorForColumn(matrix.columns, cell.label),
                      }}
                      title={`${segmentChoiceLabel(cell.label)}: ${cell.count}명 · ${formatPct(cell.pct)}`}
                    />
                  ))}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function KoreaProvinceMap({ matrix }: { matrix: SegmentMatrix }) {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch(KOREA_PROVINCE_MAP_PATH)
      .then((response) => response.text())
      .then((text) => {
        if (active) setSvgMarkup(text)
      })
      .catch(() => {
        if (active) setSvgMarkup(null)
      })
    return () => {
      active = false
    }
  }, [])

  const styledSvg = useMemo(() => {
    if (!svgMarkup) return null
    const regionStyles = sortedMatrixRows(matrix)
      .map((row) => {
        const winner = [...row.cells].sort((a, b) => b.count - a.count)[0]
        if (!winner) return ''
        const color = colorForColumn(matrix.columns, winner.label)
        const fill = mixHex(color, '#f8fafc', Math.max(18, Math.min(88, winner.pct)))
        return `path[id="${provincePathId(row.segment)}"]{fill:${fill};stroke:${color};stroke-width:1.2;}`
      })
      .filter(Boolean)
      .join('')
    const style = `<style>
      .ks-korea-svg-map path{fill:#eef2f7;stroke:#ffffff;stroke-width:.7;transition:fill .18s ease,stroke .18s ease;}
      .ks-korea-svg-map path:hover{stroke:#111827;stroke-width:2;}
      ${regionStyles}
    </style>`
    return svgMarkup
      .replace('<svg ', '<svg class="ks-korea-svg-map" role="img" aria-label="대한민국 지역별 반응 지도" ')
      .replace('<g id="전국_시도_경계">', `${style}<g id="전국_시도_경계">`)
  }, [matrix, svgMarkup])

  if (!styledSvg) {
    return <p className="ks-report-muted-text">지도를 불러오는 중입니다.</p>
  }

  return (
    <div className="ks-korea-map">
      <div className="ks-korea-map-canvas" dangerouslySetInnerHTML={{ __html: styledSvg }} />
      <div className="ks-korea-map-list">
        {sortedMatrixRows(matrix).slice(0, 8).map((row) => {
          const winner = [...row.cells].sort((a, b) => b.count - a.count)[0]
          return (
            <article key={row.segment}>
              <strong>{row.segment}</strong>
              <span>{winner ? `${segmentChoiceLabel(winner.label)} ${formatPct(winner.pct)}` : '집계 없음'}</span>
              <small>{formatNumber(row.total)}명</small>
            </article>
          )
        })}
      </div>
      <p className="ks-korea-map-source">
        행정경계 SVG: statgarten/maps · SGIS 기반 · MIT
      </p>
    </div>
  )
}

function SegmentVisualizations({ matrices }: { matrices: SegmentMatrix[] }) {
  return (
    <div className="ks-segment-visual-stack">
      {matrices.map((matrix) => (
        <article className="ks-segment-visual-card" key={matrix.id}>
          <div className="ks-segment-visual-head">
            <h3>{matrix.id.includes('province') ? '지역별 반응 지도' : `${matrix.label}별 반응`}</h3>
            <div className="ks-segment-legend">
              {matrix.columns.map((column) => (
                <span key={column}>
                  <b style={{ background: colorForColumn(matrix.columns, column) }} />
                  {column}
                </span>
              ))}
            </div>
          </div>
          {matrix.id.includes('province') ? (
            <KoreaProvinceMap matrix={matrix} />
          ) : matrix.id.includes('sex') ? (
            <GenderSegmentBars matrix={matrix} />
          ) : (
            <MatrixStackedBars matrix={matrix} />
          )}
        </article>
      ))}
    </div>
  )
}

function SegmentHeatmaps({ matrices }: { matrices: SegmentMatrix[] }) {
  const [viewMode, setViewMode] = useState<SegmentViewMode>('visual')

  return (
    <Section title="세그먼트 반응 매트릭스" kicker="세그먼트 표" wide>
      {matrices.length === 0 ? (
        <p className="ks-report-muted-text">시각화 가능한 세그먼트 breakdown이 없습니다.</p>
      ) : (
        <>
          <div className="ks-segment-view-toggle" role="tablist" aria-label="세그먼트 시각화 방법">
            <button
              aria-selected={viewMode === 'visual'}
              onClick={() => setViewMode('visual')}
              role="tab"
              type="button"
            >
              직관 보기
            </button>
            <button
              aria-selected={viewMode === 'table'}
              onClick={() => setViewMode('table')}
              role="tab"
              type="button"
            >
              표로 보기
            </button>
          </div>
          {viewMode === 'visual' ? (
            <SegmentVisualizations matrices={matrices} />
          ) : (
            <div className="ks-report-heatmap-stack">
              {matrices.map((matrix) => (
                <article className="ks-report-heatmap" key={matrix.id}>
                  <h3>{matrix.label}</h3>
                  <div
                    className="ks-report-heatmap-grid"
                    style={{ gridTemplateColumns: `minmax(112px, 1.15fr) repeat(${matrix.columns.length}, minmax(118px, 1fr))` }}
                  >
                    <span />
                    {matrix.columns.map((column) => <strong key={column}>{column}</strong>)}
                    {sortedMatrixRows(matrix).map((row) => (
                      <div className="ks-report-heatmap-row" key={row.segment}>
                        <b>{row.segment}</b>
                        {matrix.columns.map((column) => {
                          const cell = row.cells.find((item) => item.label === column) ?? { label: column, count: 0, pct: 0 }
                          return (
                            <span
                              key={column}
                              className="ks-report-heatmap-cell"
                              style={{ '--ks-cell-alpha': `${Math.max(8, Math.min(90, Math.round(cell.pct)))}%` } as CSSProperties}
                            >
                              {cell.count > 0 ? `${cell.count}명 · ${formatPct(cell.pct)}` : '-'}
                            </span>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </Section>
  )
}

function EvidenceBoard({ quotes }: { quotes: EvidenceQuote[] }) {
  return (
    <Section title="해석 근거 발언" kicker="응답 근거">
      {quotes.length === 0 ? (
        <p className="ks-report-muted-text">표시할 근거 발언이 없습니다.</p>
      ) : (
        <div className="ks-report-evidence-grid">
          {quotes.map((quote, index) => (
            <article className={`ks-report-evidence-card ks-report-evidence-card--${quote.tone}`} key={`${quote.label}-${index}`}>
              <p>{quote.label}</p>
              <blockquote>{quote.body}</blockquote>
              <span>{quote.meta}</span>
            </article>
          ))}
        </div>
      )}
    </Section>
  )
}

function SegmentBreakdown({ matrices }: { matrices: SegmentMatrix[] }) {
  return (
    <Section title="세그먼트 보조 요약" kicker="부록">
      {matrices.length === 0 ? (
        <p style={{ margin:0, color:'var(--color-fg-muted)', fontSize:14 }}>세그먼트 집계가 없습니다.</p>
      ) : (
        <div className="ks-segment-appendix-compact">
          {matrices.map((matrix) => (
            <article key={matrix.id}>
              <h3>{matrix.label}</h3>
              <div>
                {sortedMatrixRows(matrix).slice(0, 4).map((row) => {
                  const winner = [...row.cells].sort((a, b) => b.count - a.count)[0]
                  return (
                    <span key={row.segment}>
                      <b>{row.segment}</b>
                      {winner ? `${segmentChoiceLabel(winner.label)} ${formatPct(winner.pct)}` : '집계 없음'}
                    </span>
                  )
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </Section>
  )
}

function PersonaEvidence({ rawResults }: { rawResults: RawPersonaResult[] }) {
  const examples = rawResults.filter((raw) => raw.response || raw.error).slice(0, 6)
  return (
    <Section title="페르소나 별 피드백">
      {examples.length === 0 ? (
        <p style={{ margin:0, color:'var(--color-fg-muted)', fontSize:14 }}>표시할 응답 예시가 없습니다.</p>
      ) : (
        <div className="ks-persona-feedback-grid">
          {examples.map((raw) => (
            <article key={raw.uuid} className="ks-persona-feedback-card">
              <div>
                <p>{getPersonaName(raw)}</p>
                {getPersonaChoice(raw) && <span>{getPersonaChoice(raw)} 선택</span>}
              </div>
              <small>{getPersonaMeta(raw)}</small>
              <p>{getPersonaReason(raw)}</p>
            </article>
          ))}
        </div>
      )}
    </Section>
  )
}

function PersonaCrowd({
  rawResults,
  metricRows,
}: {
  rawResults: RawPersonaResult[]
  metricRows: RankedMetricRow[]
}) {
  const personas = rawResults.filter((raw) => raw.response || raw.error)
  const visible = personas
  const quotes = personas.slice(0, 12)
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [selected, setSelected] = useState<RawPersonaResult | null>(null)
  const optionMap = useMemo(
    () => new Map(metricRows.map((row) => [row.label, row])),
    [metricRows],
  )

  useEffect(() => {
    if (quotes.length < 2) return
    const timer = window.setInterval(() => {
      setQuoteIndex((current) => (current + 1) % quotes.length)
    }, 3500)
    return () => window.clearInterval(timer)
  }, [quotes.length])

  if (visible.length === 0) return null

  const quote = quotes[quoteIndex % quotes.length]
  const hasToneMetric = visible.some(hasExplicitPersonaTone)
  const responseCount = visible.filter((raw) => raw.response && !raw.error).length
  const errorCount = visible.filter((raw) => raw.error).length
  const counts = visible.reduce(
    (acc, raw) => {
      acc[getPersonaTone(raw)] += 1
      return acc
    },
    { positive: 0, neutral: 0, negative: 0 },
  )

  return (
    <Section title="군중감">
      <div className="ks-crowd-section">
        <div className="ks-crowd-header">
          <p>
            카드 {visible.length}명 표시 · 전체 응답 {rawResults.length}명
          </p>
          {hasToneMetric ? (
            <span>
              긍정 {counts.positive} · 중립 {counts.neutral} · 부정/오류 {counts.negative}
            </span>
          ) : (
            <span>
              응답 {responseCount} · 오류 {errorCount}
            </span>
          )}
        </div>

        {quote && (
          <article className={`ks-crowd-quote ks-crowd-quote--${getPersonaTone(quote)}`}>
            <div>
              <img alt="" loading="lazy" src={getPersonaAvatarSrc(quote)} />
              <div>
                <strong>{getPersonaName(quote)}</strong>
                <span>{getPersonaMeta(quote) || quote.uuid.slice(0, 8)}</span>
              </div>
              {getPersonaChoiceText(quote, optionMap) && <em>{getPersonaChoiceText(quote, optionMap)}</em>}
            </div>
            <p>{getPersonaReason(quote)}</p>
          </article>
        )}

        <div className="ks-crowd-grid" aria-label="Persona response grid">
          {visible.map((raw, index) => (
            <button
              className={`ks-crowd-person ks-crowd-person--${getPersonaTone(raw)}`}
              key={raw.uuid}
              onClick={() => setSelected(raw)}
              title={`${index + 1}. ${getPersonaName(raw)} · ${getPersonaMeta(raw)}`}
              type="button"
            >
              <img alt="" loading="lazy" src={getPersonaAvatarSrc(raw)} />
              <span>{index + 1}</span>
              <strong>{getPersonaName(raw)}</strong>
              <small>{getPersonaChoiceText(raw, optionMap) ?? '응답 보기'}</small>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="ks-crowd-modal-backdrop" role="presentation" onClick={() => setSelected(null)}>
          <article
            aria-label="Persona response detail"
            aria-modal="true"
            className="ks-crowd-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="ks-crowd-modal-head">
              <div className="ks-crowd-modal-person">
                <img alt="" src={getPersonaAvatarSrc(selected)} />
                <div>
                  <p>{getPersonaName(selected)}</p>
                  <span>{getPersonaMeta(selected) || selected.uuid}</span>
                  {getPersonaChoiceText(selected, optionMap) && <em>{getPersonaChoiceText(selected, optionMap)}</em>}
                </div>
              </div>
              <button aria-label="닫기" className="ks-crowd-modal-close" onClick={() => setSelected(null)} type="button">
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>
            <p className="ks-crowd-modal-response">{selected.error ?? selected.response}</p>
            <dl className="ks-crowd-modal-fields">
              <div>
                <dt>페르소나 정보</dt>
                {getReadablePersonaRows(selected).map((row) => (
                  <dd key={row.label}><b>{row.label}</b><span>{row.value}</span></dd>
                ))}
              </div>
              {getReadableParsedRows(selected).length > 0 && (
                <div>
                  <dt>응답 해석</dt>
                  {getReadableParsedRows(selected).map((row) => (
                    <dd key={row.label}><b>{row.label}</b><span>{row.value}</span></dd>
                  ))}
                </div>
              )}
            </dl>
          </article>
        </div>
      )}
    </Section>
  )
}

function ApiReport({
  result,
  snapshot,
}: {
  result: RunResultEnvelope
  snapshot: RunSnapshot | null
}) {
  const metricSections = getMetricSections(result)
  const analysis = buildReportAnalysis(result, metricSections)
  const [exportError, setExportError] = useState<string | null>(null)
  const handleExport = () => {
    setExportError(null)
    recordAnalyticsEvent({
      event_name: 'export_clicked',
      page: '/results',
      run_id: result.run_id,
      simulation_type: result.simulation_type,
      payload: {},
    }).catch(() => {
      // Export should not depend on analytics collection.
    })
    downloadExport(result.run_id).catch((err) => {
      setExportError(err instanceof Error ? err.message : String(err))
    })
  }
  return (
    <Shell subtitle={`${displayRunId(result.run_id)} · ${runStatusLabel(result.status)}`}>
      <main className="ks-report-main">
        <ReportHero
          analysis={analysis}
          exportError={exportError}
          onExport={handleExport}
          result={result}
        />

        <ExecutiveSummary analysis={analysis} />
        <AgentReportPanel result={result} />
        <ProtocolPanel result={result} />

        <div className="ks-report-grid">
          <MetricNarrative analysis={analysis} />
          <InsightList insights={result.insights} />
        </div>

        <div className="ks-report-grid">
          {metricSections.slice(0, 2).map((section) => (
            <MetricDistribution key={section.title} section={section} />
          ))}
          <SegmentSignalTable signals={analysis.segmentSignals} />
        </div>

        {metricSections.length > 2 && (
          <div className="ks-report-grid">
            {metricSections.slice(2).map((section) => (
              <MetricDistribution key={section.title} section={section} />
            ))}
          </div>
        )}

        <SegmentHeatmaps matrices={analysis.segmentMatrices} />
        <ResultFeedback result={result} />
        <EvidenceBoard quotes={analysis.evidenceQuotes} />
        <SegmentBreakdown matrices={analysis.segmentMatrices} />
        <TrustLayer analysis={analysis} result={result} snapshot={snapshot} />
        <PersonaCrowd metricRows={analysis.metricRows} rawResults={result.raw_results} />
        <PersonaEvidence rawResults={result.raw_results} />
      </main>
    </Shell>
  )
}

export function ResultsStoryPage({ storyId }: { storyId: string }) {
  const story = runStateFixtures.find((item) => item.id === storyId)

  if (!story) {
    return (
      <StatePanel
        title="알 수 없는 결과 상태입니다"
        body={`등록된 결과 샘플이 없습니다: ${storyId}`}
        tone="warning"
      />
    )
  }

  if (story.result) {
    return <ApiReport result={story.result} snapshot={story.snapshot} />
  }

  if (!story.snapshot) {
    return (
      <StatePanel
        title="표시할 run이 없습니다"
        body="실제 실행 ID가 없을 때는 결과를 표시할 수 없습니다. 시뮬레이션을 시작해주세요."
      />
    )
  }

  if (story.snapshot.status === 'failed' || story.snapshot.status === 'interrupted') {
    return (
      <StatePanel
        title={`시뮬레이션 ${runStatusLabel(story.snapshot.status)}`}
        body={`입력 내용은 브라우저에 보존됩니다. ${userFacingError(story.snapshot.error?.message ?? `${story.label} 상태입니다.`)}`}
        runId={story.snapshot.run_id}
        primaryActionLabel="입력으로 돌아가기"
        secondaryActionLabel="다시 확인"
        tone="warning"
      />
    )
  }

  return (
    <StatePanel
      title={`시뮬레이션 ${runStatusLabel(story.snapshot.status)}`}
      body={[
        story.restored ? '이전 실행을 복원했습니다' : null,
        displayRunId(story.snapshot.run_id),
        `${story.snapshot.done_count}/${story.snapshot.total_count}명 응답 완료`,
        story.partials ? `부분 결과 ${story.partials.partial_count}개` : null,
        story.label,
      ].filter(Boolean).join(' · ')}
    />
  )
}

export function ResultsPage() {
  const [apiRunId, setApiRunId] = useState<string | null>(null)
  const [apiSnapshot, setApiSnapshot] = useState<RunSnapshot | null>(null)
  const [apiResult, setApiResult] = useState<RunResultEnvelope | null>(null)
  const [apiMessage, setApiMessage] = useState<string | null>(null)
  const [partialCount, setPartialCount] = useState<number | null>(null)

  useEffect(() => {
    const runId = readRunIdFromLocation()
    setApiRunId(runId)
    if (!runId) return

    let cancelled = false
    let timer: number | null = null

    const load = async () => {
      try {
        const snapshot = await getRun(runId)
        if (cancelled) return
        setApiSnapshot(snapshot)
        const result = await getRunResult(runId)
        if (cancelled) return
        setApiResult(result)
        setPartialCount(null)
        setApiMessage(null)
        if (timer !== null) window.clearInterval(timer)
      } catch (err) {
        if (cancelled) return
        if (err instanceof APIError && err.payload?.code === 'RESULT_NOT_READY') {
          const partials = await getRunPartials(runId)
          if (cancelled) return
          setPartialCount(partials.partial_count)
          setApiMessage(
            partials.partial_count > 0
              ? `부분 결과 ${partials.partial_count}/${partials.total_count}개를 복구했습니다.`
              : '결과를 생성하는 중입니다.'
          )
          return
        }
        setApiMessage(err instanceof Error ? err.message : String(err))
        if (timer !== null) window.clearInterval(timer)
      }
    }

    load()
    timer = window.setInterval(load, 2500)
    return () => {
      cancelled = true
      if (timer !== null) window.clearInterval(timer)
    }
  }, [])

  if (!apiRunId) {
    return (
      <StatePanel
        title="표시할 run이 없습니다"
        body="결과 페이지는 실제 run_id가 있을 때만 API 결과를 렌더링합니다. 시뮬레이션을 시작하면 완료 후 이 화면으로 돌아옵니다."
      />
    )
  }

  if (apiResult) {
    return <ApiReport result={apiResult} snapshot={apiSnapshot} />
  }

  if (apiMessage && apiSnapshot?.status === 'failed') {
    return (
      <StatePanel
        title="시뮬레이션 실패"
        body={`입력 내용은 유지됩니다. ${userFacingError(apiSnapshot.error?.message ?? apiMessage)}`}
        runId={apiSnapshot.run_id}
        primaryActionLabel="입력으로 돌아가기"
        secondaryActionLabel="다시 확인"
        tone="warning"
      />
    )
  }

  return (
    <StatePanel
      title={apiSnapshot ? `시뮬레이션 ${runStatusLabel(apiSnapshot.status)}` : '결과를 불러오는 중'}
      body={[
        apiRunId ? displayRunId(apiRunId) : null,
        apiSnapshot ? `${apiSnapshot.done_count}/${apiSnapshot.total_count}명 응답 완료` : null,
        partialCount !== null ? `부분 결과 ${partialCount}개` : null,
        apiMessage,
      ].filter(Boolean).join(' · ') || '잠시 후 다시 확인합니다.'}
    />
  )
}
