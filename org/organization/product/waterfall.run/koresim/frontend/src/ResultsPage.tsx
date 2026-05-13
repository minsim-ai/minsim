import { useEffect, useState, type CSSProperties } from 'react'
import { ArrowLeft, UserCircle, WarningCircle, X } from '@phosphor-icons/react'
import { Download } from 'lucide-react'
import { APIError } from './api/client'
import { getRun, getRunExport, getRunPartials, getRunResult } from './api/runs'
import { AuthStatus } from './components/AuthStatus'
import { runStateFixtures } from './data/runStateFixtures'
import {
  getMetricSections,
  getPersonaPrimaryLabel,
  getSimulationLabel,
  type MetricSection,
  type MetricRow,
} from './simulations/registry'
import type { JsonObject, RawPersonaResult, RunResultEnvelope, RunSnapshot } from './types/api'

const CHOICE_COLORS = ['#0066FF', '#00A878', '#7C3AED', '#D97706', '#64748B']

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
  return asString(insight.title) ?? asString(insight.type) ?? `Insight ${index + 1}`
}

function getInsightBody(insight: JsonObject): string {
  return asString(insight.evidence) ?? compactJson(insight)
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

function rowDisplayName(row: RankedMetricRow | MetricRow | null): string {
  if (!row) return 'N/A'
  if (row.detail) return `${row.label} · ${row.detail}`
  return row.label
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
          label: rowDisplayName(row),
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
      label: getPersonaPrimaryLabel(raw),
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
  const winnerName = rowDisplayName(winner)
  const runnerName = rowDisplayName(runnerUp)

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
    actions.push(`${signal.dimension} ${signal.segment}에서 ${signal.winner} 반응이 두드러집니다. 전체용 메시지와 세그먼트 전용 메시지를 분리해 검토합니다.`)
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

  let decisionLabel = winner ? `${rowDisplayName(winner)} 중심` : '집계 대기'
  let decisionBody = winner
    ? `${rowDisplayName(winner)}이 현재 결과의 중심입니다.`
    : '집계 가능한 정량 결과가 아직 없습니다.'
  if (winner && runnerUp && marginPct !== null) {
    if (marginPct >= 15) {
      decisionLabel = `${rowDisplayName(winner)} 채택 후보`
      decisionBody = `${rowDisplayName(winner)}이 ${rowDisplayName(runnerUp)}보다 ${formatPoint(marginPct)} 앞서며, 전체 선택 구조에서 분명한 우위를 보입니다.`
    } else if (marginPct <= 6) {
      decisionLabel = '박빙 구간'
      decisionBody = `${rowDisplayName(winner)}이 앞서지만 ${rowDisplayName(runnerUp)}와의 차이가 ${formatPoint(marginPct)}에 그쳐, 메시지 조합 또는 세그먼트 분리 검토가 필요합니다.`
    } else {
      decisionLabel = `${rowDisplayName(winner)} 조건부 우세`
      decisionBody = `${rowDisplayName(winner)}이 앞서지만, ${rowDisplayName(runnerUp)}도 충분히 가까워 세그먼트별 선택 이유를 같이 봐야 합니다.`
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
        borderBottom:'1px solid var(--color-border)',
        background:'var(--color-bg-glass)',
        backdropFilter:'blur(16px)',
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
          <ArrowLeft size={14} weight="bold" />새 시뮬레이션
        </button>
        <div style={{ minWidth:0, flex:1 }}>
          <p style={{ margin:0, fontSize:14, fontWeight:700, color:'var(--color-fg-strong)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            Arabesque Results
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
}: {
  title: string
  body: string
  tone?: 'neutral' | 'warning'
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
          {tone === 'warning' && <WarningCircle size={24} color='var(--color-status-destructive)' />}
          <h1 style={{ margin:0, fontSize:24, color:'var(--color-fg-strong)' }}>{title}</h1>
          <p style={{ margin:0, fontSize:15, lineHeight:1.7, color:'var(--color-fg-muted)' }}>{body}</p>
          <div>
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
              앱으로 돌아가기
            </button>
          </div>
        </section>
      </main>
    </Shell>
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
  const model = result.model_alias ?? result.provider_model ?? result.provider ?? result.llm_backend ?? 'N/A'
  const generatedAt = snapshot?.completed_at ?? snapshot?.updated_at ?? snapshot?.created_at
  const cards = [
    { label: '응답 커버리지', value: `${formatNumber(result.total_responses)}/${formatNumber(result.sample_size)}` },
    { label: '구조화 성공', value: formatPercent(parseSuccessRate) },
    { label: '해석 범위', value: analysis.confidenceLabel },
    { label: '유효 응답', value: `${formatNumber(analysis.validResponses)}명` },
  ]

  return (
    <Section title="방법론과 신뢰 정보" kicker="Method">
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
          <p className="ks-report-kv-label">Sample footprint</p>
          <p className="ks-report-muted-text">
            {compactJson(result.sample_summary)}
          </p>
        </div>
        <div>
          <p className="ks-report-kv-label">Reproducibility</p>
          <p className="ks-report-muted-text">
            seed {result.seed} · model {model} · {formatDate(generatedAt)}
          </p>
          <p className="ks-report-subtle-text">
            target {compactJson(result.target_filter)}
          </p>
        </div>
      </div>
      {result.warnings.length > 0 && (
        <div className="ks-report-warning">
          <p>해석 유의사항</p>
          <ul>
            {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}
      <p className="ks-report-disclaimer">
        본 결과는 NVIDIA Nemotron-Personas-Korea(CC BY 4.0) 기반 synthetic persona 시뮬레이션입니다. 실제 설문, 시장 점유율, 수요 보장을 의미하지 않으며 의사결정 전 보조 검증 자료로 사용해야 합니다.
      </p>
    </Section>
  )
}

function MetricDistribution({ section }: { section: MetricSection }) {
  if (section.rows.length === 0) {
    return (
      <Section title={section.title}>
        <p style={{ margin:0, color:'var(--color-fg-muted)', fontSize:14 }}>집계 가능한 선택 결과가 없습니다.</p>
      </Section>
    )
  }

  return (
    <Section title={section.title}>
      <div style={{ display:'grid', gap:14 }}>
        {section.rows.map((row, index) => {
          const color = CHOICE_COLORS[index % CHOICE_COLORS.length]
          const pct = row.pct ?? 0
          return (
            <div key={`${row.label}-${index}`}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'baseline', marginBottom:8 }}>
                <div style={{ minWidth:0 }}>
                  <p style={{ margin:0, fontSize:15, fontWeight:800, color:'var(--color-fg-strong)' }}>
                    {row.label}
                  </p>
                  {row.detail && (
                    <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--color-fg-muted)', lineHeight:1.45 }}>
                      {row.detail}
                    </p>
                  )}
                </div>
                <p style={{ margin:0, fontSize:16, fontWeight:800, color }}>
                  {row.value ?? `${row.count ?? 0}명`}{row.pct !== null && row.pct !== undefined ? ` · ${row.pct}%` : ''}
                </p>
              </div>
              {row.pct !== null && row.pct !== undefined && (
                <div style={{ height:8, borderRadius:4, background:'var(--color-border)', overflow:'hidden' }}>
                  <div style={{ width:`${Math.max(0, Math.min(100, pct))}%`, height:'100%', background:color }} />
                </div>
              )}
            </div>
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
        <div style={{ display:'grid', gap:12 }}>
          {insights.map((insight, index) => (
            <article key={`${getInsightTitle(insight, index)}-${index}`} style={{ padding:14, border:'1px solid var(--color-border)', borderRadius:8 }}>
              <h3 style={{ margin:'0 0 6px', fontSize:15, color:'var(--color-fg-strong)' }}>{getInsightTitle(insight, index)}</h3>
              <p style={{ margin:0, fontSize:13, lineHeight:1.6, color:'var(--color-fg-muted)' }}>{getInsightBody(insight)}</p>
            </article>
          ))}
        </div>
      )}
    </Section>
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
  return (
    <section className="ks-report-hero">
      <div className="ks-report-hero-copy">
        <p className="ks-report-eyebrow">{getSimulationLabel(result.simulation_type)} 분석 보고서</p>
        <h1>{analysis.decisionLabel}</h1>
        <p>{analysis.decisionBody}</p>
        <div className="ks-report-hero-actions">
          <button className="ks-report-export" onClick={onExport} type="button">
            <Download size={15} strokeWidth={2.2} />
            검토용 JSON export
          </button>
          <span>{result.run_id.slice(0, 8)} · n={formatNumber(result.total_responses)}</span>
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
          <strong>{rowDisplayName(winner)}</strong>
          <span>{winner?.pct !== undefined ? `${formatPct(winner.pct)} · ${winner.count ?? 0}명` : '집계 없음'}</span>
        </div>
        <div>
          <p>비교 기준</p>
          <strong>{runner ? rowDisplayName(runner) : 'N/A'}</strong>
          <span>{analysis.marginPct !== null ? `격차 ${formatPoint(analysis.marginPct)}` : '격차 산출 불가'}</span>
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
      label: '얼마나 믿을 수 있나',
      value: analysis.confidenceLabel,
      body: analysis.confidenceBody,
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
    <Section title="Executive Summary" kicker="Decision">
      <div className="ks-report-brief-grid">
        {rows.map((row) => (
          <article key={row.label} className="ks-report-brief-card">
            <p>{row.label}</p>
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
    <Section title="AI Agent Report" kicker="Analysis · Report · QA">
      <div className="ks-agent-summary">
        <div>
          <p>Agent headline</p>
          <strong>{agentReport.headline ?? 'Agent headline 없음'}</strong>
          {agentReport.summary && <span>{agentReport.summary}</span>}
        </div>
        <div className={`ks-agent-qa${qaClass}`}>
          <p>QA status</p>
          <strong>{qaLabel}</strong>
          <span>
            passed {agentReport.qa.passed === null ? 'N/A' : agentReport.qa.passed ? 'true' : 'false'}
            {agentReport.qa.confidence !== null ? ` · confidence ${Math.round(agentReport.qa.confidence * 100)}%` : ''}
          </span>
        </div>
      </div>

      <div className="ks-agent-grid">
        <div className="ks-agent-panel">
          <h3>Key findings</h3>
          {agentReport.findings.length === 0 ? (
            <p className="ks-report-muted-text">구조화된 핵심 발견이 없습니다.</p>
          ) : (
            <ul>
              {agentReport.findings.map((finding, index) => (
                <li key={`${finding.metricKey}-${index}`}>
                  <b>{finding.metricKey}</b>
                  <span>{finding.finding}</span>
                  <small>{finding.evidence}{finding.confidence !== null ? ` · ${Math.round(finding.confidence * 100)}%` : ''}</small>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ks-agent-panel">
          <h3>Recommendations</h3>
          {agentReport.recommendations.length === 0 ? (
            <p className="ks-report-muted-text">구조화된 권고가 없습니다.</p>
          ) : (
            <ol>
              {agentReport.recommendations.map((item, index) => (
                <li key={`${item.priority}-${index}`}>
                  <b>{item.priority}</b>
                  <span>{item.action}</span>
                  <small>{item.reason}</small>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="ks-agent-panel">
          <h3>Risks</h3>
          {agentReport.risks.length === 0 ? (
            <p className="ks-report-muted-text">구조화된 리스크가 없습니다.</p>
          ) : (
            <ul>
              {agentReport.risks.map((item, index) => (
                <li key={`${item.severity}-${index}`}>
                  <b>{item.severity}</b>
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
          {[...agentReport.qa.warnings, ...agentReport.qa.reviewNotes].map((note) => (
            <span key={note}>{note}</span>
          ))}
        </div>
      )}
    </Section>
  )
}

function MetricNarrative({ analysis }: { analysis: ReportAnalysis }) {
  if (analysis.metricRows.length === 0) {
    return (
      <Section title="주요 지표 해석" kicker="Market response">
        <p className="ks-report-muted-text">집계 가능한 지표가 아직 없습니다.</p>
      </Section>
    )
  }

  return (
    <Section title="주요 지표 해석" kicker="Market response">
      <div className="ks-report-rank-list">
        {analysis.metricRows.slice(0, 8).map((row, index) => (
          <div className="ks-report-rank-row" key={`${row.sectionTitle}-${row.label}`}>
            <span className="ks-report-rank-index">{index + 1}</span>
            <div>
              <p>{rowDisplayName(row)}</p>
              <span>{row.sectionTitle}</span>
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
    <Section title="세그먼트별 해석 포인트" kicker="Over-index">
      {signals.length === 0 ? (
        <p className="ks-report-muted-text">비교 가능한 세그먼트 신호가 없습니다.</p>
      ) : (
        <div className="ks-report-signal-table">
          {signals.map((signal) => (
            <article key={`${signal.dimension}-${signal.segment}-${signal.winner}`}>
              <div>
                <p>{signal.dimension} · {signal.segment}</p>
                <strong>{signal.winner} 반응 집중</strong>
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

function SegmentHeatmaps({ matrices }: { matrices: SegmentMatrix[] }) {
  return (
    <Section title="세그먼트 반응 매트릭스" kicker="Heatmap" wide>
      {matrices.length === 0 ? (
        <p className="ks-report-muted-text">시각화 가능한 세그먼트 breakdown이 없습니다.</p>
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
                {matrix.rows.map((row) => (
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
    </Section>
  )
}

function EvidenceBoard({ quotes }: { quotes: EvidenceQuote[] }) {
  return (
    <Section title="해석 근거 발언" kicker="Voice evidence">
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

function SegmentBreakdown({ segments }: { segments: JsonObject }) {
  const entries = Object.entries(segments)
  return (
    <Section title="세그먼트 원본 요약" kicker="Appendix">
      {entries.length === 0 ? (
        <p style={{ margin:0, color:'var(--color-fg-muted)', fontSize:14 }}>세그먼트 집계가 없습니다.</p>
      ) : (
        <div style={{ display:'grid', gap:12 }}>
          {entries.map(([name, value]) => (
            <div key={name} style={{ padding:14, border:'1px solid var(--color-border)', borderRadius:8 }}>
              <p style={{ margin:'0 0 6px', fontSize:13, fontWeight:800, color:'var(--color-primary)' }}>{name}</p>
              <p style={{ margin:0, fontSize:13, lineHeight:1.65, color:'var(--color-fg-muted)', overflowWrap:'anywhere' }}>{compactJson(value)}</p>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function PersonaEvidence({ rawResults }: { rawResults: RawPersonaResult[] }) {
  const examples = rawResults.filter((raw) => raw.response || raw.error).slice(0, 6)
  return (
    <Section title="페르소나 응답 예시">
      {examples.length === 0 ? (
        <p style={{ margin:0, color:'var(--color-fg-muted)', fontSize:14 }}>표시할 응답 예시가 없습니다.</p>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:12 }}>
          {examples.map((raw) => (
            <article key={raw.uuid} style={{ border:'1px solid var(--color-border)', borderRadius:8, padding:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:8 }}>
                <p style={{ margin:0, fontSize:13, fontWeight:800, color:'var(--color-fg-strong)' }}>
                  {getPersonaPrimaryLabel(raw)}
                </p>
                <span style={{ color:'var(--color-fg-subtle)', fontSize:11 }}>{raw.uuid.slice(0, 8)}</span>
              </div>
              <p style={{ margin:'0 0 8px', fontSize:12, color:'var(--color-fg-subtle)' }}>{getPersonaMeta(raw)}</p>
              <p style={{ margin:0, fontSize:13, lineHeight:1.6, color:'var(--color-fg-muted)' }}>{getPersonaReason(raw)}</p>
            </article>
          ))}
        </div>
      )}
    </Section>
  )
}

function PersonaCrowd({ rawResults }: { rawResults: RawPersonaResult[] }) {
  const personas = rawResults.filter((raw) => raw.response || raw.error)
  const visible = personas.slice(0, 100)
  const quotes = personas.slice(0, 12)
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [selected, setSelected] = useState<RawPersonaResult | null>(null)

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
            카드 {visible.length}명 표시
            {rawResults.length > visible.length ? ` · 전체 응답 ${rawResults.length}명 중 일부` : ` · 전체 응답 ${rawResults.length}명`}
          </p>
          {hasToneMetric ? (
            <span>
              긍정 {counts.positive} · 중립 {counts.neutral} · 부정/오류 {counts.negative}
            </span>
          ) : (
            <span>
              응답 {responseCount} · 오류 {errorCount} · 감성 분류 미적용 (아직고정값)
            </span>
          )}
        </div>

        {quote && (
          <article className={`ks-crowd-quote ks-crowd-quote--${getPersonaTone(quote)}`}>
            <div>
              <strong>{getPersonaPrimaryLabel(quote)}</strong>
              <span>{getPersonaMeta(quote) || quote.uuid.slice(0, 8)}</span>
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
              title={`${index + 1}. ${getPersonaPrimaryLabel(raw)} · ${getPersonaMeta(raw)}`}
              type="button"
            >
              <UserCircle size={18} weight="fill" />
              <span>{index + 1}</span>
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
              <div>
                <p>{getPersonaPrimaryLabel(selected)}</p>
                <span>{getPersonaMeta(selected) || selected.uuid}</span>
              </div>
              <button aria-label="닫기" className="ks-crowd-modal-close" onClick={() => setSelected(null)} type="button">
                <X size={16} weight="bold" />
              </button>
            </div>
            <p className="ks-crowd-modal-response">{selected.error ?? selected.response}</p>
            <dl className="ks-crowd-modal-fields">
              <div>
                <dt>persona</dt>
                <dd>{compactJson(selected.persona)}</dd>
              </div>
              <div>
                <dt>parsed</dt>
                <dd>{compactJson(selected.parsed)}</dd>
              </div>
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
    downloadExport(result.run_id).catch((err) => {
      setExportError(err instanceof Error ? err.message : String(err))
    })
  }
  return (
    <Shell subtitle={`${result.run_id.slice(0, 8)} · ${result.status}`}>
      <main className="ks-report-main">
        <ReportHero
          analysis={analysis}
          exportError={exportError}
          onExport={handleExport}
          result={result}
        />

        <ExecutiveSummary analysis={analysis} />
        <AgentReportPanel result={result} />

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
        <EvidenceBoard quotes={analysis.evidenceQuotes} />
        <SegmentBreakdown segments={result.segments} />
        <TrustLayer analysis={analysis} result={result} snapshot={snapshot} />
        <PersonaCrowd rawResults={result.raw_results} />
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
        body={`등록된 story fixture가 없습니다: ${storyId}`}
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
        body="Story fixture: no_run_selected. 실제 run_id가 없을 때 결과 페이지가 보여주는 상태입니다."
      />
    )
  }

  if (story.snapshot.status === 'failed' || story.snapshot.status === 'interrupted') {
    return (
      <StatePanel
        title={`Run ${story.snapshot.status}`}
        body={story.snapshot.error?.message ?? `${story.label} 상태입니다.`}
        tone="warning"
      />
    )
  }

  return (
    <StatePanel
      title={`Run ${story.snapshot.status}`}
      body={[
        story.restored ? 'localStorage restore state' : null,
        `run ${story.snapshot.run_id.slice(0, 8)}`,
        `${story.snapshot.done_count}/${story.snapshot.total_count} complete`,
        story.partials ? `partials ${story.partials.partial_count}` : null,
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
        body="결과 페이지는 실제 run_id가 있을 때만 API 결과를 렌더링합니다. 새 시뮬레이션을 시작하면 완료 후 이 화면으로 돌아옵니다."
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
        body={apiSnapshot.error?.message ?? apiMessage}
        tone="warning"
      />
    )
  }

  return (
    <StatePanel
      title={apiSnapshot ? `Run ${apiSnapshot.status}` : '결과를 불러오는 중'}
      body={[
        apiRunId ? `run ${apiRunId.slice(0, 8)}` : null,
        apiSnapshot ? `${apiSnapshot.done_count}/${apiSnapshot.total_count} complete` : null,
        partialCount !== null ? `partials ${partialCount}` : null,
        apiMessage,
      ].filter(Boolean).join(' · ') || '잠시 후 다시 확인합니다.'}
    />
  )
}
