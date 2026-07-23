import { getMetricSections, getSimulationLabel, type MetricRow } from '../simulations/registry'
import type { JsonObject, RawPersonaResult, RunResultEnvelope } from '../types/api'
import { personaDisplayName } from './personaDisplay'
import type {
  V2EvidenceQuote,
  V2MetricCard,
  V2RankRow,
  V2ResultView,
  V2SegmentMatrix,
  V2SegmentRow,
} from './types'

const CHART_COLORS = ['#d9ff5a', '#68e1fd', '#c4b5fd', '#fca5a5', '#fde68a', '#86efac']

type AgentReportView = {
  summary: string | null
  headline: string | null
  findings: string[]
  recommendations: string[]
  risks: string[]
  qaWarnings: string[]
}

type RankedMetricRow = V2RankRow & {
  sectionTitle: string
}

export function adaptRunResult(result: RunResultEnvelope): V2ResultView {
  const rankRows = buildRankRows(result)
  const winner = rankRows[0] ?? null
  const runnerUp = rankRows[1] ?? null
  const agentReport = buildAgentReportView(result)
  const parseSuccessRate = parseSuccessRateOf(result)
  const confidence = confidenceCopy(result.total_responses, parseSuccessRate)
  const segmentMatrices = buildSegmentMatrices(result.segments)
  const evidenceQuotes = buildEvidenceQuotes(result.raw_results, winner?.label ?? null)
  const recommendations = firstNonEmpty(
    agentReport.recommendations,
    buildDefaultRecommendations(result, winner, runnerUp),
  )
  const positiveSignals = firstNonEmpty(
    reasonsForWinner(result.metrics, winner?.label ?? null),
    agentReport.findings,
    evidenceQuotes.filter((quote) => quote.tone === 'positive').map((quote) => quote.body),
  ).slice(0, 4)
  const objections = firstNonEmpty(
    lowSignalReasons(result.raw_results),
    agentReport.risks,
    [...result.warnings, ...agentReport.qaWarnings],
  ).slice(0, 4)

  return {
    runId: result.run_id,
    simulationLabel: getSimulationLabel(result.simulation_type),
    headline: agentReport.headline ?? headlineFor(result, winner, runnerUp),
    conclusion: agentReport.summary ?? conclusionFor(result, winner, runnerUp),
    winnerLabel: winner ? displayChoice(winner.label) : 'N/A',
    winnerName: winner?.name ?? '집계 대기',
    winnerPct: winner?.pct ?? null,
    runnerUpLabel: runnerUp ? displayChoice(runnerUp.label) : null,
    marginPct: margin(winner, runnerUp),
    confidenceLabel: confidence.label,
    confidenceBody: confidence.body,
    statusLabel: statusLabel(result.status),
    cards: buildMetricCards(result, parseSuccessRate),
    ranks: rankRows,
    positiveSignals,
    objections,
    recommendations,
    warnings: result.warnings,
    segmentMatrices,
    evidenceQuotes,
    methodology: buildMethodology(result, parseSuccessRate),
  }
}

export function colorForRank(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length]
}

function buildRankRows(result: RunResultEnvelope): RankedMetricRow[] {
  return getMetricSections(result)
    .flatMap((section) => section.rows.map((row) => rankedRow(section.title, row)))
    .filter((row) => row.count !== null || row.pct !== null || row.detail !== null)
    .sort((a, b) => scoreRow(b) - scoreRow(a))
    .map((row, index) => ({
      ...row,
      color: colorForRank(index),
      winner: index === 0,
    }))
}

function rankedRow(sectionTitle: string, row: MetricRow): RankedMetricRow {
  const detail = row.detail ?? (typeof row.value === 'string' ? row.value : null)
  return {
    id: `${sectionTitle}:${row.label}`,
    sectionTitle,
    label: row.label,
    name: detail ?? displayChoice(row.label),
    count: row.count ?? null,
    pct: row.pct ?? (typeof row.value === 'number' ? row.value : null),
    detail,
    color: colorForRank(0),
    winner: false,
  }
}

function scoreRow(row: V2RankRow): number {
  return row.pct ?? row.count ?? 0
}

function buildMetricCards(result: RunResultEnvelope, parseSuccessRate: number | null): V2MetricCard[] {
  return [
    {
      label: '응답 표본',
      value: `${formatNumber(result.total_responses)}명`,
      detail: `요청 ${formatNumber(result.sample_size)}명`,
    },
    {
      label: '응답 정리 성공',
      value: parseSuccessRate === null ? 'N/A' : formatPct(parseSuccessRate),
      detail: `읽지 못한 응답 ${formatNumber(result.parse_failed)}건`,
    },
    {
      label: '판단 상태',
      value: qualityGrade(result.quality),
      detail: statusLabel(result.status),
    },
  ]
}

function headlineFor(result: RunResultEnvelope, winner: V2RankRow | null, runnerUp: V2RankRow | null): string {
  if (!winner) return `${getSimulationLabel(result.simulation_type)} 결과를 정리 중입니다`
  const gap = margin(winner, runnerUp)
  if (gap !== null && gap <= 6) return `${displayChoice(winner.label)}가 앞서지만 박빙입니다`
  return `${displayChoice(winner.label)}가 가장 강한 반응을 얻었습니다`
}

function conclusionFor(result: RunResultEnvelope, winner: V2RankRow | null, runnerUp: V2RankRow | null): string {
  const summary = result.safe_intake_summary
  if (!winner) return summary?.decision_question || '집계 가능한 정량 결과가 아직 없습니다.'
  const gap = margin(winner, runnerUp)
  const winnerText = winner.name === displayChoice(winner.label) ? winner.name : `${displayChoice(winner.label)} · ${winner.name}`
  if (gap !== null && runnerUp) {
    return `${winnerText}가 ${displayChoice(runnerUp.label)} 대비 ${formatPoint(gap)} 앞섰습니다. 세그먼트별 반응과 실제 발언을 함께 보고 다음 실험 조건을 좁히세요.`
  }
  return `${winnerText}를 기준안으로 두고 후속 질문과 세그먼트 검증을 진행할 수 있습니다.`
}

function confidenceCopy(total: number, parseSuccessRate: number | null): { label: string; body: string } {
  if ((parseSuccessRate ?? 0) >= 90 && total >= 50) {
    return {
      label: '보고서 기준 충족',
      body: '표본 규모와 응답 정리 성공률이 좋아 세그먼트 차이까지 함께 해석할 수 있습니다.',
    }
  }
  if (total >= 30) {
    return {
      label: '의사결정 보조 가능',
      body: '전체 방향성은 읽을 수 있고, 큰 세그먼트 차이는 보조 근거로 사용할 수 있습니다.',
    }
  }
  return {
    label: '탐색용',
    body: '빠른 탐색에는 충분하지만 외부 공유용 결론으로 쓰기에는 표본이 작습니다.',
  }
}

function buildSegmentMatrices(segments: JsonObject): V2SegmentMatrix[] {
  return Object.entries(segments)
    .flatMap(([id, value]) => {
      if (!isRecord(value)) return []
      const rows = segmentRows(value)
      if (rows.length === 0) return []
      const columns = Array.from(new Set(rows.flatMap((row) => row.cells.map((cell) => cell.label))))
      return [{
        id,
        label: segmentLabel(id),
        columns,
        rows: rows.map((row) => ({
          ...row,
          cells: columns.map((column) => row.cells.find((cell) => cell.label === column) ?? { label: column, count: 0, pct: 0 }),
        })),
      }]
    })
    .slice(0, 6)
}

function segmentRows(value: Record<string, unknown>): V2SegmentRow[] {
  return Object.entries(value)
    .flatMap(([segment, cells]) => {
      if (!isRecord(cells)) return []
      const rawCells = Object.entries(cells)
        .flatMap(([label, count]) => {
          if (label === 'total' || label === 'n' || label === 'sample_size') return []
          const numeric = asNumber(count)
          return numeric === null ? [] : [{ label, count: numeric }]
        })
      const total = rawCells.reduce((sum, cell) => sum + cell.count, 0)
      if (total <= 0) return []
      return [{
        segment,
        total,
        cells: rawCells.map((cell) => ({
          ...cell,
          pct: round((cell.count / total) * 100),
        })),
      }]
    })
    .sort((a, b) => b.total - a.total)
}

function buildEvidenceQuotes(rawResults: RawPersonaResult[], winner: string | null): V2EvidenceQuote[] {
  return rawResults
    .filter((item) => item.response && !item.error)
    .slice(0, 18)
    .map((item) => {
      const choice = primaryChoice(item)
      return {
        uuid: item.uuid,
        label: `${nameOf(item)} · ${displayChoice(choice)}`,
        meta: metaOf(item),
        body: shorten(item.response.replace(/\s+/g, ' '), 190),
        tone: quoteTone(item, winner),
        cohort: choice || 'all',
      }
    })
    .sort((a, b) => toneRank(a.tone) - toneRank(b.tone))
    .slice(0, 12)
}

function quoteTone(item: RawPersonaResult, winner: string | null): V2EvidenceQuote['tone'] {
  const score = item.parsed ? asNumber(item.parsed.score) : null
  const choice = primaryChoice(item)
  if (score !== null && score <= 2) return 'negative'
  if (score !== null && score >= 4) return 'positive'
  if (winner && choice === winner) return 'positive'
  return 'neutral'
}

function toneRank(tone: V2EvidenceQuote['tone']): number {
  if (tone === 'positive') return 0
  if (tone === 'negative') return 1
  return 2
}

function primaryChoice(item: RawPersonaResult): string {
  const parsed = item.parsed
  if (!parsed) return ''
  return String(
    parsed.choice ??
      parsed.intent ??
      parsed.segment ??
      parsed.primary ??
      parsed.preferred_price ??
      parsed.score ??
      '',
  )
}

function reasonsForWinner(metrics: JsonObject, winner: string | null): string[] {
  if (!winner || !isRecord(metrics.reasons_by_choice)) return []
  const reasons = metrics.reasons_by_choice[winner]
  if (!Array.isArray(reasons)) return []
  return reasons.map(String).filter(Boolean).slice(0, 4)
}

function lowSignalReasons(rawResults: RawPersonaResult[]): string[] {
  return rawResults
    .filter((item) => {
      const score = item.parsed ? asNumber(item.parsed.score) : null
      return score !== null && score <= 2
    })
    .map((item) => {
      const reason = item.parsed && typeof item.parsed.reason === 'string' ? item.parsed.reason : item.response
      return shorten(reason.replace(/\s+/g, ' '), 120)
    })
    .filter(Boolean)
    .slice(0, 4)
}

function buildDefaultRecommendations(
  result: RunResultEnvelope,
  winner: V2RankRow | null,
  runnerUp: V2RankRow | null,
): string[] {
  if (!winner) return ['집계가 완료된 뒤 우세 항목과 세그먼트 차이를 기준으로 후속 실험을 설계합니다.']
  const items = [`${displayChoice(winner.label)}를 기준안으로 두고 후속 질문에서 거절 이유를 확인합니다.`]
  const gap = margin(winner, runnerUp)
  if (gap !== null && gap <= 6) {
    items.push('격차가 작으므로 메시지 조합이나 타겟 세그먼트를 나누어 재실행합니다.')
  } else {
    items.push('상위 반응 세그먼트에 같은 메시지를 우선 적용하고, 약한 세그먼트는 별도 가설로 분리합니다.')
  }
  if (result.total_responses < 50) items.push('외부 공유 전에는 표본을 50명 이상으로 키워 재현성을 확인합니다.')
  return items
}

function buildAgentReportView(result: RunResultEnvelope): AgentReportView {
  const orchestration = isRecord(result.orchestration) ? result.orchestration : {}
  const agents = isRecord(orchestration.agents) ? orchestration.agents : {}
  const analysis = isRecord(agents.analysis) ? agents.analysis : {}
  const report = isRecord(agents.report) ? agents.report : {}
  const qa = isRecord(agents.qa) ? agents.qa : {}
  return {
    summary: asString(analysis.summary) ?? asString(analysis.primary_insight),
    headline: asString(report.headline),
    findings: parseFindings(analysis.key_findings),
    recommendations: parseRecommendations(report.recommendations),
    risks: parseRisks(report.risks),
    qaWarnings: asStringArray(qa.warnings),
  }
}

function parseFindings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (isRecord(item)) return asString(item.finding) ? [String(item.finding)] : []
    return asString(item) ? [String(item)] : []
  })
}

function parseRecommendations(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (isRecord(item)) {
      const action = asString(item.action)
      const reason = asString(item.reason)
      return action ? [reason ? `${action} (${reason})` : action] : []
    }
    return asString(item) ? [String(item)] : []
  })
}

function parseRisks(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (isRecord(item)) {
      const risk = asString(item.risk)
      const mitigation = asString(item.mitigation)
      return risk ? [mitigation ? `${risk} 대응: ${mitigation}` : risk] : []
    }
    return asString(item) ? [String(item)] : []
  })
}

function buildMethodology(result: RunResultEnvelope, parseSuccessRate: number | null): string[] {
  const countryLine = [
    result.country_id ? `국가 ${result.country_id}` : null,
    result.dataset_name ? `데이터셋 ${result.dataset_name}` : null,
    result.language ? `언어 ${result.language}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return [
    `응답 ${formatNumber(result.total_responses)}명 · 요청 표본 ${formatNumber(result.sample_size)}명`,
    `응답 정리 성공 ${parseSuccessRate === null ? 'N/A' : formatPct(parseSuccessRate)}`,
    ...(countryLine ? [countryLine] : []),
    `타겟 조건 ${compactJson(result.target_filter)}`,
  ]
}

function parseSuccessRateOf(result: RunResultEnvelope): number | null {
  if (result.total_responses <= 0) return null
  return round(((result.total_responses - result.parse_failed) / result.total_responses) * 100)
}

function margin(winner: V2RankRow | null, runnerUp: V2RankRow | null): number | null {
  if (!winner || !runnerUp || winner.pct === null || runnerUp.pct === null) return null
  return round(winner.pct - runnerUp.pct)
}

function qualityGrade(quality: JsonObject): string {
  const grade = quality.overall_grade ?? quality.sample_quality_grade
  return typeof grade === 'string' && grade.trim() ? grade : 'N/A'
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    completed: '완료',
    running: '실행 중',
    queued: '대기 중',
    failed: '실패',
    canceled: '취소됨',
    interrupted: '중단됨',
  }
  return labels[status] ?? status
}

function displayChoice(value: string): string {
  if (!value) return 'N/A'
  return /^[A-Z]$/.test(value) ? `${value}안` : value
}

function segmentLabel(value: string): string {
  const labels: Record<string, string> = {
    breakdown_by_age: '연령',
    breakdown_by_sex: '성별',
    breakdown_by_province: '지역',
    demographic_segments: '인구통계',
  }
  return labels[value] ?? value.replace(/^breakdown_by_/, '').replace(/_/g, ' ')
}

function nameOf(item: RawPersonaResult): string {
  return personaDisplayName(item.persona, item.uuid)
}

function metaOf(item: RawPersonaResult): string {
  const parts = [
    item.persona.sex,
    typeof item.persona.age === 'number' ? `${item.persona.age}세` : item.persona.age,
    item.persona.province,
    item.persona.occupation,
  ]
  return parts.filter((part) => typeof part === 'string' && part.trim()).join(' · ') || '페르소나'
}

function compactJson(value: unknown): string {
  if (value === null || value === undefined) return '없음'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(compactJson).join(', ') || '없음'
  if (!isRecord(value)) return String(value)
  const text = Object.entries(value)
    .filter(([, item]) => item !== null && item !== undefined && item !== '' && !(Array.isArray(item) && item.length === 0))
    .map(([key, item]) => `${key}: ${compactJson(item)}`)
    .join(' · ')
  return text || '없음'
}

function firstNonEmpty(...values: string[][]): string[] {
  return values.find((items) => items.length > 0) ?? []
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatNumber(value: number): string {
  return value.toLocaleString('ko-KR')
}

function formatPct(value: number): string {
  return `${round(value)}%`
}

function formatPoint(value: number): string {
  return `${round(value)}%p`
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function shorten(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max).trim()}...` : value
}
