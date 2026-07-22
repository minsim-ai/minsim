import type { JsonObject, RawPersonaResult, RunResultEnvelope } from '../types/api'
import {
  displayName as legacyDisplayName,
  isMaleLabel,
  personaDisplayName,
  sexShortLabel,
} from './personaDisplay'

export type TitleBody = { title: string; body: string }

export type MinsimCreative = {
  id: string
  label: string
  text: string
  angle: string
  pct: number
  count: number
  band: number
  color: string
  winner: boolean
}

export type MinsimRegion = {
  name: string
  svgId: string
  leadId: string
  lead: string
  pct: string
  pctValue: number
  focusId: string
  focusLabel: string
  focusPct: number
  deltaPoint: number
  distribution: Record<string, number>
  n: number
  reliability: string
  reliabilityRank: number
  why: string
  actions: string[]
}

export type MinsimGender = {
  g: string
  icon: string
  n: number
  leadId: string
  lead: string
  pct: string
  parts: [string, number][]
}

export type MinsimAgeFull = { label: string; n: number; pct: Record<string, number> | null; lead: string | null }
export type MinsimInterestRow = { label: string; count: number; pct: number }
export type MinsimFinalSummary = {
  winner: { label: string; pct: number; count: number } | null
  pains: TitleBody[]
  actions: TitleBody[]
  caution: string
  verdictLine: string
}
export type MinsimOppRiskCol = { k: string; dir: 'up' | 'down' }
export type MinsimOppRiskVerdict = { label: string; rationale: string; source: 'agent' | 'heuristic' }
export type MinsimOppRiskRow = {
  seg: string
  n: number
  v: number[]
  note: string
  sweet: boolean
  verdict: MinsimOppRiskVerdict
}
export type MinsimOppRisk = { cols: MinsimOppRiskCol[]; rows: MinsimOppRiskRow[]; note: string }
export type MinsimObjection = { rank: number; reason: string; pct: number }

export type MinsimReport = {
  run: {
    panel: number
    valid: number
    gap: string
    gapPoint: number | null
    seed: number
    ts: string
    runId: string
    status: string
    structured: string
    excludeUnemployed: boolean
    verdictLine: string
    conclusion: string
  }
  winner: MinsimCreative | null
  runnerUp: MinsimCreative | null
  creatives: MinsimCreative[]
  optColor: Record<string, string>
  sentiment: { pos: number; neu: number; neg: number } | null
  intent: MinsimIntent | null
  core: {
    conclusion: string
    positives: TitleBody[]
    rejections: TitleBody[]
    improvements: TitleBody[]
    nextExp: { t: string; d: string }[]
  }
  decision: { judgeBody: string[] }
  report: { headline: string; summary: string; findings: TitleBody[]; actions: TitleBody[]; watch: TitleBody[] }
  keywords: { w: string; n: number }[]
  oppRisk: MinsimOppRisk | null
  objections: MinsimObjection[]
  ageFull: MinsimAgeFull[]
  interest: MinsimInterestRow[] | null
  finalSummary: MinsimFinalSummary | null
  segment: {
    mode: 'choice' | 'intent' | 'segment'
    focusId: string
    focusLabel: string
    overallPct: number
    metricLabel: string
  }
  gender: MinsimGender[]
  regions: MinsimRegion[]
  reco: { action: string; meta: string; bullets: string[] }
  sampleAge: [string, number][]
  sampleRegion: [string, number][]
  crowd: { uuid: string; name: string; sex: string; age: number | string; region: string; occ: string; choice: string; quote: string }[]
  quotes: { uuid: string; name: string; choice: string; meta: string; q: string }[]
  disclaimer: string
}

const OPT: Record<string, string> = {
  A: 'var(--opt-a)',
  B: 'var(--opt-b)',
  C: 'var(--opt-c)',
  D: 'var(--opt-d)',
}

const OUTCOME_COLORS: Record<string, string> = {
  유지: 'var(--segment-retain)',
  관망: 'var(--segment-watch)',
  이탈: 'var(--segment-churn)',
  수용: 'var(--segment-retain)',
  거부: 'var(--segment-churn)',
}

const SEGMENT_PALETTE = [
  'var(--opt-a)',
  'var(--opt-b)',
  'var(--opt-c)',
  'var(--opt-d)',
  'var(--segment-retain)',
  'var(--segment-watch)',
  'var(--segment-churn)',
  'var(--fg-dim)',
] as const

const SEGMENT_TOP_N = 8
const OTHER_SEGMENT_ID = '기타'

const PROVINCE_SVG_ID: Record<string, string> = {
  서울: '서울특별시',
  부산: '부산광역시',
  대구: '대구광역시',
  인천: '인천광역시',
  광주: '광주광역시',
  대전: '대전광역시',
  울산: '울산광역시',
  세종: '세종특별자치시',
  경기: '경기도',
  강원: '강원도',
  충북: '충청북도',
  충청북: '충청북도',
  충남: '충청남도',
  충청남: '충청남도',
  전북: '전라북도',
  전라북: '전라북도',
  전남: '전라남도',
  전라남: '전라남도',
  경북: '경상북도',
  경상북: '경상북도',
  경남: '경상남도',
  경상남: '경상남도',
  제주: '제주특별자치도',
}

const AGE_ORDER = ['10대', '20대', '30대', '40대', '50대', '60대', '70대+', '70대', '80대+']

const KEYWORD_STOP = new Set([
  '선택', '이유', '점수', '설득력', '명확성', '공감도', '의향', '세그먼트', '니즈', '페인', '포지셔닝', '강점', '약점',
  '가격', '구매', '관망', '거부', '거절', '고려', '대표의향', '선호가격', '지불의향가격', '가격별의향', '원',
  '있습니다', '없습니다', '합니다', '입니다', '때문', '그리고', '하지만', '가장', '조금', '정도', '대한', '위한',
  '이해', '효용', '신뢰', '빨리', '있어서', '했습니다', '수', '더', '이', '그', '저', '것', '등',
])

export function buildMinsimReport(result: RunResultEnvelope, options: { completedAt?: string | null } = {}): MinsimReport {
  const metrics = isRecord(result.metrics) ? result.metrics : {}
  const choiceCounts = numberRecord(metrics.choice_counts)
  const choicePct = numberRecord(metrics.choice_pct)
  const intentCounts = numberRecord(metrics.intent_counts)
  const intentPct = numberRecord(metrics.intent_pct)
  const segmentCounts = numberRecord(metrics.segment_counts)
  const segmentPct = numberRecord(metrics.segment_pct)
  const creativeTexts = stringArray(metrics.creatives)
  const reasonsByChoice = recordOfStringArray(metrics.reasons_by_choice)

  const hasChoices = Object.keys(choiceCounts).length > 0
  const hasIntent = !hasChoices && Object.keys(intentCounts).length > 0
  const hasSegments = !hasChoices && !hasIntent && Object.keys(segmentCounts).length > 0
  const segmentMode: MinsimReport['segment']['mode'] = hasChoices ? 'choice' : hasIntent ? 'intent' : hasSegments ? 'segment' : 'choice'
  const isChoiceMode = segmentMode === 'choice'

  const rawOutcomeCounts = hasChoices ? choiceCounts : hasIntent ? intentCounts : segmentCounts
  const rawOutcomePct = hasChoices ? choicePct : hasIntent ? intentPct : segmentPct
  const { counts: outcomeCounts, pct: outcomePct, ids } = resolveOutcomeColumns(
    rawOutcomeCounts,
    rawOutcomePct,
    segmentMode,
  )
  const validChoiceTotal = Object.values(outcomeCounts).reduce((sum, count) => sum + count, 0)

  const creatives: MinsimCreative[] = ids.map((id, index) => {
    const count = outcomeCounts[id] ?? 0
    const pct = round(outcomePct[id] ?? 0)
    return {
      id,
      label: isChoiceMode ? `${id}안` : segmentResidualLabel(id),
      text: isChoiceMode ? (creativeTexts[index] ?? `${id}안`) : segmentResidualLabel(id),
      angle: '',
      pct,
      count,
      band: wilsonMarginPct(count, validChoiceTotal),
      color: colorForOutcome(id, index),
      winner: false,
    }
  })
  // "기타" is a residual long-tail bucket, never a competitive winner/target.
  const namedCreatives = creatives.filter((item) => item.id !== OTHER_SEGMENT_ID)
  const residualCreatives = creatives.filter((item) => item.id === OTHER_SEGMENT_ID)
  const rankedNamed = [...namedCreatives].sort((a, b) => b.pct - a.pct || a.id.localeCompare(b.id))
  if (rankedNamed[0]) rankedNamed[0].winner = true
  const ranked = [...rankedNamed, ...residualCreatives]
  const winner = rankedNamed[0] ?? null
  const runnerUp = rankedNamed[1] ?? null
  const gapPoint = winner && runnerUp ? round(winner.pct - runnerUp.pct) : null

  const agent = buildAgentView(result)
  const parseSuccessRate = parseSuccess(result)
  const total = result.total_responses
  const status = confidenceLabel(total, parseSuccessRate)

  const sentiment = deriveSentiment(result.raw_results)
  const intent = deriveIntent(result.raw_results, result.simulation_type)

  const findings = agent.findings.slice(0, 4)
  const actions = agent.actions.slice(0, 4)
  const watch = agent.watch.slice(0, 4)

  const recommendedTarget = asString(metrics.recommended_first_target)
  const namedIds = ids.filter((id) => id !== OTHER_SEGMENT_ID)
  const focusId = segmentMode === 'intent' && outcomePct.이탈 !== undefined
    ? '이탈'
    : (recommendedTarget && recommendedTarget !== OTHER_SEGMENT_ID && (recommendedTarget in outcomeCounts || recommendedTarget in rawOutcomeCounts)
      ? recommendedTarget
      : (winner?.id ?? namedIds[0] ?? ''))
  const focusLabel = outcomeLabel(focusId, isChoiceMode)
  const overallFocusPct = round(outcomePct[focusId] ?? 0)
  const displaySegments = foldSegmentBreakdowns(result.segments, ids, segmentMode === 'segment')
  const ageFull = buildAgeFull(displaySegments)
  const gender = buildGender(displaySegments, isChoiceMode)
  const regions = buildRegions(displaySegments, isChoiceMode, segmentMode, focusId, overallFocusPct)

  const winnerLabel = winner?.label ?? (segmentMode === 'segment' ? '주요 세그먼트' : '기준안')
  const reco = {
    action: '다듬기 →',
    meta: `재실행 · 1위 ${winnerLabel} ${winner?.pct ?? 0}% · 격차 ${gapPoint === null ? '집계 중' : `+${gapPoint}pt`}`,
    bullets: firstNonEmpty(
      actions.map((item) => item.title),
      [
        `${winnerLabel}을 기준안으로 두고 후속 질문에서 거절 이유를 확인합니다.`,
        '상위 반응 세그먼트에 같은 메시지를 우선 적용하고, 약한 세그먼트는 별도 가설로 분리합니다.',
        '외부 공유 전에는 표본을 키워 세그먼트 흔들림을 한 번 더 확인합니다.',
      ],
    ).slice(0, 3),
  }

  const nextExp = [
    { t: '패널 확장 재실행', d: '같은 조건으로 표본을 키워 세그먼트 흔들림을 확인합니다.' },
    ...(runnerUp ? [{ t: `${winnerLabel} vs ${runnerUp.label} 분리 테스트`, d: '상위 두 후보를 세그먼트별로 나눠 비교합니다.' }] : []),
  ].slice(0, 2)

  const metricLabel = focusId === '이탈'
    ? '이탈률'
    : segmentMode === 'segment'
      ? `${focusLabel} 점유율`
      : `${focusLabel} 반응률`

  const report: MinsimReport = {
    run: {
      panel: total,
      valid: Math.max(0, total - result.parse_failed),
      gap: gapPoint === null ? '집계 중' : `+${gapPoint}pt`,
      gapPoint,
      seed: result.seed,
      ts: formatTs(options.completedAt),
      runId: result.run_id.slice(0, 8),
      status,
      structured: parseSuccessRate === null ? 'N/A' : `${round(parseSuccessRate)}%`,
      excludeUnemployed: Boolean(isRecord(result.target_filter) && result.target_filter.exclude_unemployed),
      verdictLine: agent.headline || (winner
        ? (segmentMode === 'segment'
          ? `‘${winner.text}’ 세그먼트(${winner.pct}%)를 1순위 타깃으로 권장합니다.`
          : `‘${winner.text}’ 메시지(${winner.label})가 가장 강하게 반응합니다.`)
        : '핵심 결론을 해석 중입니다.'),
      conclusion: agent.summary || '집계 결과를 해석 중입니다.',
    },
    winner,
    runnerUp,
    creatives: ranked,
    optColor: OPT,
    sentiment,
    intent,
    core: {
      conclusion: agent.summary || (winner ? winner.text : '핵심 결론을 해석 중입니다.'),
      positives: firstNonEmpty(
        findings.slice(0, 2),
        reasonsByChoice[winner?.id ?? '']?.slice(0, 2).map((reason) => ({ title: reason, body: '' })) ?? [],
      ),
      rejections: watch.slice(0, 2),
      improvements: actions.slice(0, 2),
      nextExp,
    },
    decision: {
      judgeBody: buildJudgeBody(winner, runnerUp, gapPoint, status, segmentMode),
    },
    report: {
      headline: agent.headline || (winner
        ? (segmentMode === 'segment'
          ? `${winner.label} 세그먼트를 1순위 타깃으로 권장합니다.`
          : `${winner.label} 메시지를 기준안으로 권장합니다.`)
        : '결과를 해석 중입니다.'),
      summary: agent.summary || reasonsByChoice[winner?.id ?? '']?.[0] || '집계 결과를 해석 중입니다.',
      findings,
      actions,
      watch,
    },
    keywords: buildKeywords(result.raw_results, reasonsByChoice),
    oppRisk: buildOppRisk(
      displaySegments,
      result.raw_results,
      winner?.id ?? null,
      result.metrics,
      agentVerdictsOf(result),
    ),
    objections: buildObjections(result.raw_results, watch),
    ageFull,
    interest: buildInterest(result.metrics),
    finalSummary: null,
    segment: {
      mode: segmentMode,
      focusId,
      focusLabel,
      overallPct: overallFocusPct,
      metricLabel,
    },
    gender,
    regions,
    reco,
    sampleAge: buildSampleAge(displaySegments, isRecord(result.sample_summary) ? result.sample_summary : null),
    sampleRegion: buildSampleRegion(displaySegments, isRecord(result.sample_summary) ? result.sample_summary : null),
    crowd: buildCrowd(result.raw_results),
    quotes: buildQuotes(result.raw_results),
    disclaimer: buildDisclaimer(result),
  }
  return { ...report, finalSummary: buildFinalSummary(report) }
}

type AgentView = { headline: string; summary: string; findings: TitleBody[]; actions: TitleBody[]; watch: TitleBody[] }

function buildAgentView(result: RunResultEnvelope): AgentView {
  const orchestration = isRecord(result.orchestration) ? result.orchestration : {}
  const agents = isRecord(orchestration.agents) ? orchestration.agents : {}
  const analysis = isRecord(agents.analysis) ? agents.analysis : {}
  const report = isRecord(agents.report) ? agents.report : {}
  const qa = isRecord(agents.qa) ? agents.qa : {}

  const findings: TitleBody[] = arrayOf(analysis.key_findings).flatMap((item) => {
    if (isRecord(item)) {
      const title = asString(item.finding)
      if (!title) return []
      return [{ title, body: sanitizeEvidenceBody(asString(item.evidence) ?? '') }]
    }
    return asString(item) ? [{ title: String(item), body: '' }] : []
  })

  const actions: TitleBody[] = arrayOf(report.recommendations).flatMap((item) => {
    if (isRecord(item)) {
      const title = asString(item.action)
      if (!title) return []
      return [{ title, body: asString(item.reason) ?? '' }]
    }
    return asString(item) ? [{ title: String(item), body: '' }] : []
  })

  const watch: TitleBody[] = [
    ...arrayOf(report.risks).flatMap((item) => {
      if (isRecord(item)) {
        const title = asString(item.risk)
        if (!title) return []
        return [{ title, body: asString(item.mitigation) ?? '' }]
      }
      return asString(item) ? [{ title: String(item), body: '' }] : []
    }),
    ...stringArray(qa.review_notes).map((note) => ({ title: note, body: '' })),
    ...stringArray(qa.warnings).map((warning) => ({ title: warning, body: 'AI QA 경고' })),
    ...Object.entries(agents).flatMap(([name, output]) => (
      isRecord(output) && output.mode === 'fallback'
        ? [{ title: `${name} 단계가 fallback으로 처리됨`, body: asString(output.fallback_reason) ?? '원본 AI 단계 실패' }]
        : []
    )),
  ]

  return {
    headline: asString(report.headline) ?? '',
    summary: asString(analysis.summary) ?? asString(analysis.primary_insight) ?? '',
    findings,
    actions,
    watch,
  }
}

function buildJudgeBody(
  winner: MinsimCreative | null,
  runnerUp: MinsimCreative | null,
  gapPoint: number | null,
  status: string,
  mode: MinsimReport['segment']['mode'] = 'choice',
): string[] {
  const lines: string[] = []
  if (winner && runnerUp && gapPoint !== null) {
    lines.push(
      mode === 'segment'
        ? `이 패널에서는 ${winner.label}(${winner.pct}%)가 ${runnerUp.label}(${runnerUp.pct}%)보다 ${gapPoint}%포인트 더 큽니다. 실제 시장 일반화 전 추가 검증이 필요합니다.`
        : `이 패널에서는 ${runnerUp.label}(${runnerUp.pct}%)보다 ${gapPoint}%포인트 더 많이 선택됐습니다. 실제 시장 일반화 전 추가 검증이 필요합니다.`,
    )
  } else if (winner) {
    lines.push(
      mode === 'segment'
        ? `${winner.label}가 ${winner.pct}%로 가장 큰 세그먼트입니다.`
        : `${winner.label}가 ${winner.pct}%로 가장 강한 반응을 얻었습니다.`,
    )
  }
  lines.push(`단, 신뢰도는 ‘${status}’ 수준 — 큰 세그먼트 차이는 근거로 쓰되 소표본 세그먼트는 분리 해석이 필요합니다.`)
  return lines
}

/** Hide or humanize machine metric-key evidence so it never shows as report body copy. */
export function sanitizeEvidenceBody(evidence: string): string {
  const trimmed = evidence.trim()
  if (!trimmed) return ''
  if (!looksLikeMachineEvidence(trimmed)) return trimmed
  return humanizeMachineEvidence(trimmed) ?? ''
}

function looksLikeMachineEvidence(text: string): boolean {
  if (/needs\.count\s*=|pains\.count\s*=|segment_counts\.|segment_pct\.|breakdown_by_/i.test(text)) return true
  if (/\b[a-z][a-z0-9_]*\.[A-Za-z0-9_.[\]가-힣]+\s*=/.test(text)) return true
  if (/\b[a-z][a-z0-9_]+\[/.test(text)) return true
  if (/^[A-Za-z0-9_.'"[\]=\s,:%+\-가-힣]+$/.test(text) && /[a-z][a-z0-9_]*\s*=/.test(text) && !/\s{2,}|다\.|요\.|니다/.test(text)) {
    return true
  }
  return false
}

function humanizeMachineEvidence(text: string): string | null {
  const needCountFirst = /needs\.count\s*=\s*(\d+)[^\n]*needs\.label\s*=\s*['"]([^'"]+)['"]/i.exec(text)
  if (needCountFirst) return `「${needCountFirst[2]}」 니즈 ${needCountFirst[1]}건`
  const needLabelFirst = /needs\.label\s*=\s*['"]([^'"]+)['"][^\n]*needs\.count\s*=\s*(\d+)/i.exec(text)
  if (needLabelFirst) return `「${needLabelFirst[1]}」 니즈 ${needLabelFirst[2]}건`

  const painCountFirst = /pains\.count\s*=\s*(\d+)[^\n]*pains\.label\s*=\s*['"]([^'"]+)['"]/i.exec(text)
  if (painCountFirst) return `「${painCountFirst[2]}」 페인 ${painCountFirst[1]}건`
  const painLabelFirst = /pains\.label\s*=\s*['"]([^'"]+)['"][^\n]*pains\.count\s*=\s*(\d+)/i.exec(text)
  if (painLabelFirst) return `「${painLabelFirst[1]}」 페인 ${painLabelFirst[2]}건`

  const segmentCount = /segment_counts\.([^=\s,]+)\s*=\s*([\d.]+)/i.exec(text)
  if (segmentCount) {
    const name = segmentCount[1]?.replace(/_/g, ' ') ?? ''
    const value = segmentCount[2]
    const pct = /segment_pct\.[^=\s,]+\s*=\s*([\d.]+)/i.exec(text)?.[1]
    if (name && value) {
      return pct ? `「${name}」 ${value}건 · ${pct}%` : `「${name}」 ${value}건`
    }
  }

  const labelThenCount = /(?:label|name)\s*=\s*['"]([^'"]+)['"][^\n]*(?:count|n)\s*=\s*(\d+)/i.exec(text)
  if (labelThenCount) return `「${labelThenCount[1]}」 ${labelThenCount[2]}건`
  const countThenLabel = /(?:count|n)\s*=\s*(\d+)[^\n]*(?:label|name)\s*=\s*['"]([^'"]+)['"]/i.exec(text)
  if (countThenLabel) return `「${countThenLabel[2]}」 ${countThenLabel[1]}건`

  return null
}

function resolveOutcomeColumns(
  rawCounts: Record<string, number>,
  rawPct: Record<string, number>,
  mode: MinsimReport['segment']['mode'],
): { counts: Record<string, number>; pct: Record<string, number>; ids: string[] } {
  if (Object.keys(rawCounts).length === 0 && Object.keys(rawPct).length === 0) {
    return { counts: {}, pct: {}, ids: [] }
  }

  if (mode !== 'segment') {
    const ids = Object.keys(rawCounts).length
      ? Object.keys(rawCounts).sort()
      : Object.keys(rawPct).sort()
    return { counts: rawCounts, pct: rawPct, ids }
  }

  const ranked = Object.entries(rawCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const top = ranked.slice(0, SEGMENT_TOP_N)
  const rest = ranked.slice(SEGMENT_TOP_N)
  const otherCount = rest.reduce((sum, [, count]) => sum + count, 0)
  const total = ranked.reduce((sum, [, count]) => sum + count, 0) || 1

  const counts: Record<string, number> = Object.fromEntries(top)
  const pct: Record<string, number> = {}
  for (const [id, count] of top) {
    pct[id] = rawPct[id] !== undefined ? round(rawPct[id]) : round((count / total) * 100)
  }
  const ids = top.map(([id]) => id)
  if (otherCount > 0) {
    counts[OTHER_SEGMENT_ID] = otherCount
    pct[OTHER_SEGMENT_ID] = round((otherCount / total) * 100)
    ids.push(OTHER_SEGMENT_ID)
  }
  return { counts, pct, ids }
}

function foldSegmentBreakdowns(
  segments: JsonObject,
  primaryIds: string[],
  enabled: boolean,
): JsonObject {
  if (!enabled || primaryIds.length === 0) return segments
  const primary = new Set(primaryIds.filter((id) => id !== OTHER_SEGMENT_ID))
  const foldRecord = (counts: Record<string, number>): Record<string, number> => {
    const next: Record<string, number> = {}
    let other = 0
    for (const [key, value] of Object.entries(counts)) {
      if (primary.has(key)) next[key] = (next[key] ?? 0) + value
      else other += value
    }
    if (other > 0 && primaryIds.includes(OTHER_SEGMENT_ID)) next[OTHER_SEGMENT_ID] = other
    for (const id of primaryIds) {
      if (next[id] === undefined) next[id] = 0
    }
    return next
  }

  const foldMap = (value: unknown): JsonObject => {
    if (!isRecord(value)) return {}
    const out: JsonObject = {}
    for (const [label, row] of Object.entries(value)) {
      out[label] = foldRecord(numberRecord(row))
    }
    return out
  }

  return {
    ...segments,
    breakdown_by_age: foldMap(segments.breakdown_by_age),
    breakdown_by_province: foldMap(segments.breakdown_by_province),
    breakdown_by_sex: foldMap(segments.breakdown_by_sex),
  }
}

function colorForOutcome(id: string, index: number): string {
  if (OPT[id]) return OPT[id]
  if (OUTCOME_COLORS[id]) return OUTCOME_COLORS[id]
  if (id === OTHER_SEGMENT_ID) return 'var(--fg-faint)'
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return SEGMENT_PALETTE[(hash + index) % SEGMENT_PALETTE.length]
}

function deriveSentiment(rawResults: RawPersonaResult[]): { pos: number; neu: number; neg: number } | null {
  const scores = rawResults.map(scoreOf).filter((value): value is number => value !== null)
  if (scores.length >= 5) {
    const pos = pctOf(scores.filter((score) => score >= 4).length, scores.length)
    const neg = pctOf(scores.filter((score) => score <= 2).length, scores.length)
    return { pos, neg, neu: Math.max(0, 100 - pos - neg) }
  }
  return null
}

/**
 * 시뮬레이션마다 페르소나가 답하는 의향 어휘가 다르다. 여기 없는
 * simulation_type은 의향 카드를 그리지 않는다.
 *
 * 과거에는 `구매/거부/관망` 정규식 하나로 전부 재분류해서, 어휘가 다른
 * 시뮬레이션(수용·유지·이탈)의 응답이 조용히 버려지고 남은 표본으로 100%를
 * 다시 계산했다. 200명 중 80명이 수용해도 "구매 0%"가 나왔다.
 */
const INTENT_VOCAB: Record<string, { title: string; labels: string[] }> = {
  price_optimization: { title: '구매 의향', labels: ['구매', '관망', '거부'] },
  product_launch: { title: '구매 의향', labels: ['구매', '관망', '거부'] },
  startup_item_validation: { title: '수용 의향', labels: ['수용', '관망', '거부'] },
  churn_prediction: { title: '유지 의향', labels: ['유지', '관망', '이탈'] },
}

const MIN_INTENT_SAMPLE = 5

export type MinsimIntent = {
  title: string
  parts: [string, number][]
  counted: number
  total: number
}

function deriveIntent(rawResults: RawPersonaResult[], simulationType: string): MinsimIntent | null {
  const vocab = INTENT_VOCAB[simulationType]
  if (!vocab) return null

  const values = rawResults.map(intentOf).filter((value): value is string => value !== null)
  const counted = values.filter((value) => vocab.labels.includes(value))
  if (counted.length < MIN_INTENT_SAMPLE) return null

  return {
    title: vocab.title,
    parts: vocab.labels.map((label) => [
      label,
      pctOf(counted.filter((value) => value === label).length, counted.length),
    ]),
    counted: counted.length,
    total: rawResults.length,
  }
}

function scoreOf(item: RawPersonaResult): number | null {
  const parsed = item.parsed
  if (parsed && typeof parsed.score === 'number') return parsed.score
  const match = /점수[:：]\s*([0-9])/.exec(item.response ?? '')
  return match ? Number(match[1]) : null
}

/** 응답이 실제로 쓴 라벨을 그대로 돌려준다. 재분류는 `deriveIntent`가 어휘표로 한다. */
function intentOf(item: RawPersonaResult): string | null {
  const parsed = item.parsed
  const raw = (parsed && typeof parsed.intent === 'string' ? parsed.intent : null) ??
    (/대표의향[:：]\s*(\S+)/.exec(item.response ?? '')?.[1] ?? /(?:^|\n)의향[:：]\s*(\S+)/.exec(item.response ?? '')?.[1] ?? null)
  return raw ? raw.trim() : null
}

function buildInterest(metrics: JsonObject): MinsimInterestRow[] | null {
  if (!isRecord(metrics.interest_breakdown)) return null
  const breakdown = numberRecord(metrics.interest_breakdown)
  const total = sumValues(breakdown)
  if (total <= 0) return null
  return ['관심있음', '관심없음', '가격저항']
    .filter((label) => label in breakdown)
    .map((label) => ({
      label,
      count: breakdown[label] ?? 0,
      pct: round(((breakdown[label] ?? 0) / total) * 100),
    }))
}

function buildFinalSummary(report: MinsimReport): MinsimFinalSummary {
  const winner = report.winner
    ? {
        label: report.winner.text || report.winner.label,
        pct: report.winner.pct,
        count: report.winner.count,
      }
    : null
  const pains = firstNonEmpty(
    report.objections
      .filter((item) => item.reason)
      .slice(0, 2)
      .map((item) => ({ title: item.reason, body: item.pct > 0 ? `${item.pct}%` : '' })),
    report.report.watch.slice(0, 2),
    [{ title: '뚜렷한 거부 요인이 집계되지 않았습니다', body: '후속 질문으로 확인하세요.' }],
  )
  const actions = firstNonEmpty(
    report.report.actions.slice(0, 2),
    report.reco.bullets.slice(0, 2).map((title) => ({ title, body: '' })),
    [{ title: '표본을 키워 같은 조건으로 재실행합니다', body: '' }],
  )
  const caution =
    report.report.watch[0]?.title ?? '소표본 결과는 방향성 참고로만 사용하세요.'
  return {
    winner,
    pains,
    actions,
    caution,
    verdictLine: report.run.verdictLine,
  }
}

function buildAgeFull(segments: JsonObject): MinsimAgeFull[] {
  const byAge = isRecord(segments.breakdown_by_age) ? segments.breakdown_by_age : {}
  return orderKeys(Object.keys(byAge), AGE_ORDER).map((label) => {
    const counts = numberRecord((byAge as JsonObject)[label])
    const n = sumValues(counts)
    if (n <= 0) return { label, n: 0, pct: null, lead: null }
    const pct: Record<string, number> = {}
    for (const [id, count] of Object.entries(counts)) {
      pct[id] = round((count / n) * 100)
    }
    const leadEntry = pickLeadCount(
      Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    )
    return { label, n, pct, lead: leadEntry?.[0] ?? null }
  })
}

function buildGender(segments: JsonObject, hasChoices: boolean): MinsimGender[] {
  const bySex = isRecord(segments.breakdown_by_sex) ? segments.breakdown_by_sex : {}
  return Object.keys(bySex).map((label) => {
    const counts = numberRecord((bySex as JsonObject)[label])
    const n = sumValues(counts)
    const parts = Object.entries(counts)
      .map(([id, count]) => [id, n > 0 ? round((count / n) * 100) : 0] as [string, number])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    const top = pickLeadPart(parts)
    const isMale = isMaleLabel(label)
    return {
      g: label,
      icon: isMale ? '♂' : '♀',
      n,
      leadId: top?.[0] ?? '',
      lead: top ? outcomeLabel(top[0], hasChoices) : 'N/A',
      pct: top ? `${top[1]}%` : '0%',
      parts,
    }
  })
}

function buildRegions(
  segments: JsonObject,
  hasChoices: boolean,
  mode: MinsimReport['segment']['mode'],
  focusId: string,
  overallFocusPct: number,
): MinsimRegion[] {
  const byProvince = isRecord(segments.breakdown_by_province) ? segments.breakdown_by_province : {}
  return Object.keys(byProvince)
    .map((name) => {
      const counts = numberRecord((byProvince as JsonObject)[name])
      const n = sumValues(counts)
      const entries = Object.entries(counts)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      const leadEntry = pickLeadCount(entries)
      const lead = leadEntry ? leadEntry[0] : ''
      const pctNum = leadEntry && n > 0 ? round((leadEntry[1] / n) * 100) : 0
      const leadLabel = outcomeLabel(lead, hasChoices)
      const focusPct = n > 0 ? round(((counts[focusId] ?? 0) / n) * 100) : 0
      const deltaPoint = round(focusPct - overallFocusPct)
      const displayName = PROVINCE_SVG_ID[name] ?? name
      const reliability = reliabilityForSample(n)
      const isReferenceOnly = n < 10
      const focusLabel = outcomeLabel(focusId, hasChoices)
      const deltaText = `${deltaPoint >= 0 ? '+' : ''}${deltaPoint}pt`
      const metricWord = mode === 'segment' ? '점유율' : '반응률'
      const why = isReferenceOnly
        ? `표본이 ${n}명뿐이라 편차가 큽니다. ${focusLabel} ${focusPct}%는 방향성 참고치로만 해석하세요.`
        : hasChoices
          ? `${displayName}의 ${focusLabel} 반응률은 ${focusPct}%로 전체보다 ${deltaText}입니다. 이 합성 패널에서 관측된 차이이며 시장 전체를 뜻하지 않습니다.`
          : `${displayName}의 ${focusLabel} ${metricWord}은 ${focusPct}%로 전체보다 ${deltaText}입니다. 표본 ${n}명의 합성 패널 반응으로 해석하세요.`
      const actions = isReferenceOnly
        ? ['지역 표본을 늘려 다시 확인', `${focusLabel} 이유를 소규모 후속 질문으로 확인`]
        : hasChoices
          ? [`${focusLabel} 메시지로 지역 타겟 테스트`, '전체 대비 차이가 난 이유를 후속 질문으로 확인']
          : mode === 'segment'
            ? [`${focusLabel} 비중이 높은 지역 코호트에 후속 질문`, '세그먼트 선택 이유를 소규모로 확인']
            : [`${focusLabel} 트리거를 지역 코호트에 다시 질문`, '유지·관망으로 전환할 조건을 별도 확인']
      const distribution = Object.fromEntries(
        Object.entries(counts).map(([id, count]) => [id, n > 0 ? round((count / n) * 100) : 0]),
      )
      return {
        name: displayName,
        svgId: displayName,
        leadId: lead,
        lead: leadLabel,
        pct: `${pctNum}%`,
        pctValue: pctNum,
        focusId,
        focusLabel,
        focusPct,
        deltaPoint,
        distribution,
        n,
        reliability: reliability.label,
        reliabilityRank: reliability.rank,
        why,
        actions,
      }
    })
    .sort((a, b) => b.n - a.n)
}

function outcomeLabel(id: string, hasChoices: boolean): string {
  if (!id) return 'N/A'
  if (hasChoices) return `${id}안`
  return segmentResidualLabel(id)
}

function segmentResidualLabel(id: string): string {
  if (id === OTHER_SEGMENT_ID) return '기타 롱테일(잔여)'
  return id
}

/** Prefer a named outcome over the residual "기타" bucket when picking a lead. */
function pickLeadCount(entries: [string, number][]): [string, number] | undefined {
  return entries.find(([id, count]) => id !== OTHER_SEGMENT_ID && count > 0) ?? entries[0]
}

function pickLeadPart(parts: [string, number][]): [string, number] | undefined {
  return parts.find(([id, pct]) => id !== OTHER_SEGMENT_ID && pct > 0) ?? parts[0]
}

function reliabilityForSample(n: number): { label: string; rank: number } {
  if (n >= 50) return { label: '높음', rank: 4 }
  if (n >= 30) return { label: '보통', rank: 3 }
  if (n >= 10) return { label: '낮음', rank: 2 }
  return { label: '참고', rank: 1 }
}

function buildKeywords(rawResults: RawPersonaResult[], reasonsByChoice: Record<string, string[]>): { w: string; n: number }[] {
  const counts = new Map<string, number>()
  const push = (text: string) => {
    for (const token of text.split(/[^가-힣]+/)) {
      if (token.length < 2 || KEYWORD_STOP.has(token)) continue
      counts.set(token, (counts.get(token) ?? 0) + 1)
    }
  }
  for (const item of rawResults) {
    const text = reasonTextOf(item)
    if (text) push(text)
  }
  for (const reasons of Object.values(reasonsByChoice)) reasons.forEach(push)
  return [...counts.entries()]
    .map(([w, n]) => ({ w, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 7)
}

// --- 기회 / 리스크 통합 맵 + 주요 거부 요인 ---
const OPP_RISK_COLS: MinsimOppRiskCol[] = [
  { k: '수용도', dir: 'up' },
  { k: '니즈 강도', dir: 'up' },
  { k: '가격 저항', dir: 'down' },
  { k: '신뢰 우려', dir: 'down' },
  { k: '경쟁 압력', dir: 'down' },
]

const PRICE_KEYWORDS = ['가격', '비싸', '부담', '구독', '요금', '비용', '지출', '할인', '결제', '유료', '가성비', '돈']
const TRUST_KEYWORDS = ['신뢰', '불안', '의심', '진짜', '효과', '회의', '과장', '검증', '광고', '사기', '걱정', '못믿', '믿을']
const ALT_KEYWORDS = ['이미', '기존', '대안', '다른', '비교', '경쟁', '굳이', '쓰던', '충분', '있어']

const OBJECTION_THEMES: { label: string; keywords: string[] }[] = [
  { label: '가격 부담 (비용·구독 저항)', keywords: PRICE_KEYWORDS },
  { label: '신뢰·효과 회의', keywords: TRUST_KEYWORDS },
  { label: '사용·접근 장벽', keywords: ['어렵', '복잡', '조작', '불편', '모르', '배우', '익숙', '접근', '설치', '사용법'] },
  { label: '개인정보·보안 우려', keywords: ['개인정보', '녹음', '보안', '사생활', '유출', '감시', '프라이버시'] },
  { label: '필요성 의문', keywords: ['필요없', '굳이', '이미', '대안', '기존', '없어도', '없이', '아직'] },
]

/**
 * Prefer structured human prose over raw model payloads.
 * campus_priority stores top_reason (not reason); raw response is often JSON.
 */
function reasonTextOf(item: RawPersonaResult): string {
  const fromParsed = proseFromParsed(item.parsed)
  if (fromParsed) return fromParsed
  const response = typeof item.response === 'string' ? item.response : ''
  return extractReason(response) || proseFromJsonPayload(response) || humanReadableSnippet(response)
}

function proseFromParsed(parsed: RawPersonaResult['parsed']): string {
  if (!parsed || typeof parsed !== 'object') return ''
  for (const key of ['reason', 'top_reason', 'bottom_reason', 'need', 'pain'] as const) {
    const value = (parsed as Record<string, unknown>)[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/** Pull top_reason/reason out of a JSON persona response string. */
function proseFromJsonPayload(response: string): string {
  const trimmed = response.trim()
  if (!trimmed) return ''
  try {
    const payload = JSON.parse(trimmed) as unknown
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return proseFromParsed(payload as RawPersonaResult['parsed'])
    }
  } catch {
    // Fall through to field regex for slightly broken JSON.
  }
  for (const key of ['top_reason', 'reason', 'bottom_reason']) {
    const match = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`).exec(response)
    if (!match) continue
    try {
      return JSON.parse(`"${match[1]}"`) as string
    } catch {
      return match[1].replace(/\\n/g, ' ').trim()
    }
  }
  return ''
}

/** Never surface raw JSON blobs as “quotes” in research UI. */
function humanReadableSnippet(response: string): string {
  const flat = response.replace(/\s+/g, ' ').trim()
  if (!flat) return ''
  if (flat.startsWith('{') || flat.startsWith('[')) return ''
  return flat.slice(0, 220)
}

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword))
}

function ageBucketMatches(age: unknown, label: string): boolean {
  if (typeof age !== 'number' || !Number.isFinite(age)) return false
  const base = Number.parseInt(label, 10)
  if (Number.isNaN(base)) return false
  if (/\+/.test(label) || /이상/.test(label)) return age >= base
  return Math.floor(age / 10) * 10 === base
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, round(value)))
}

function buildOppRisk(
  segments: JsonObject,
  rawResults: RawPersonaResult[],
  winnerId: string | null,
  metrics?: JsonObject,
  agentVerdicts?: Map<string, MinsimAgentVerdict>,
): MinsimOppRisk | null {
  // Prefer the backend opp-risk/v1 matrix so the numbers the analysis agent
  // judged are exactly the numbers rendered (A-3). Old runs fall back to the
  // local heuristic computation below.
  const backendRows = backendOppRiskRows(metrics)
  if (backendRows) {
    return {
      cols: OPP_RISK_COLS,
      rows: backendRows.map((row) => decorateOppRiskRow(row, agentVerdicts)),
      note: '0–100 상대값은 응답 분포·점수·키워드 빈도로 계산한 우선순위 참고치이며 시장 확률이나 전환율이 아닙니다.',
    }
  }
  const byAge = isRecord(segments.breakdown_by_age) ? segments.breakdown_by_age : {}
  const labels = orderKeys(Object.keys(byAge), AGE_ORDER).filter(
    (label) => sumValues(numberRecord((byAge as JsonObject)[label])) > 0,
  )
  if (labels.length === 0) return null

  const validReasons = rawResults.filter((item) => !item.error).map(reasonTextOf).filter(Boolean)
  const globalPrice = validReasons.length ? pctOf(validReasons.filter((text) => matchesAny(text, PRICE_KEYWORDS)).length, validReasons.length) : 0
  const globalTrust = validReasons.length ? pctOf(validReasons.filter((text) => matchesAny(text, TRUST_KEYWORDS)).length, validReasons.length) : 0

  const scored = labels.map((label) => {
    const counts = numberRecord((byAge as JsonObject)[label])
    const n = sumValues(counts)
    const winnerCount = winnerId !== null && winnerId in counts ? counts[winnerId] : Math.max(0, ...Object.values(counts))
    const winnerShare = n > 0 ? (winnerCount / n) * 100 : 0

    const personas = rawResults.filter((item) => !item.error && ageBucketMatches(item.persona.age, label))
    const scores = personas.map(scoreOf).filter((value): value is number => value !== null)
    const avg = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null
    const posShare = scores.length ? pctOf(scores.filter((value) => value >= 4).length, scores.length) : null
    const scoreNorm = avg !== null ? ((avg - 1) / 4) * 100 : null

    const reasons = personas.map(reasonTextOf).filter(Boolean)
    const denom = personas.length
    const priceHits = reasons.filter((text) => matchesAny(text, PRICE_KEYWORDS)).length
    const trustHits = reasons.filter((text) => matchesAny(text, TRUST_KEYWORDS)).length
    const altHits = reasons.filter((text) => matchesAny(text, ALT_KEYWORDS)).length

    const acceptance = clampScore(posShare !== null ? winnerShare * 0.6 + posShare * 0.4 : winnerShare)
    const need = clampScore(scoreNorm !== null ? scoreNorm * 0.7 + (posShare ?? scoreNorm) * 0.3 : Math.min(90, winnerShare * 0.8 + 15))
    const price = clampScore(denom > 0 ? (priceHits / denom) * 100 : globalPrice)
    const trust = clampScore(denom > 0 ? (trustHits / denom) * 100 : globalTrust)
    const competition = clampScore(0.6 * (100 - winnerShare) + 0.4 * (denom > 0 ? (altHits / denom) * 100 : 0))

    const v = [acceptance, need, price, trust, competition]
    const opportunity = acceptance + need - (price + trust + competition) / 3
    return { seg: label, n, v, opportunity }
  })

  let bestIndex = -1
  let bestScore = -Infinity
  scored.forEach((row, index) => {
    if (row.opportunity > bestScore) {
      bestScore = row.opportunity
      bestIndex = index
    }
  })

  const rows: MinsimOppRiskRow[] = scored.map((row, index) => {
    const sweet = scored.length > 1 && index === bestIndex && bestScore > 40
    return decorateOppRiskRow({ seg: row.seg, n: row.n, v: row.v, sweet }, agentVerdicts)
  })

  return {
    cols: OPP_RISK_COLS,
    rows,
    note: '제품 검증 전용 휴리스틱 v1입니다. 0–100 상대값은 응답 분포·점수·키워드 빈도로 계산한 우선순위 참고치이며 시장 확률이나 전환율이 아닙니다.',
  }
}

type MinsimAgentVerdict = { verdict: string; rationale: string }

const OPP_RISK_VERDICT_LABELS = ['매력적', '조건부', '보류']

function backendOppRiskRows(
  metrics?: JsonObject,
): { seg: string; n: number; v: number[]; sweet: boolean }[] | null {
  const matrix = metrics && isRecord(metrics.opp_risk_matrix) ? metrics.opp_risk_matrix : null
  if (!matrix || !Array.isArray(matrix.rows)) return null
  const rows: { seg: string; n: number; v: number[]; sweet: boolean }[] = []
  for (const item of matrix.rows) {
    if (!isRecord(item)) continue
    const seg = typeof item.seg === 'string' ? item.seg : ''
    const values = Array.isArray(item.v)
      ? item.v.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      : []
    if (!seg || values.length !== 5) continue
    rows.push({
      seg,
      n: typeof item.n === 'number' && Number.isFinite(item.n) ? item.n : 0,
      v: values.map(clampScore),
      sweet: item.sweet === true,
    })
  }
  return rows.length > 0 ? rows : null
}

function decorateOppRiskRow(
  row: { seg: string; n: number; v: number[]; sweet: boolean },
  agentVerdicts?: Map<string, MinsimAgentVerdict>,
): MinsimOppRiskRow {
  const note = oppRiskNote(row.v, row.sweet)
  const agent = agentVerdicts?.get(row.seg)
  const verdict: MinsimOppRiskVerdict = agent
    ? { label: agent.verdict, rationale: agent.rationale, source: 'agent' }
    : { label: heuristicVerdictLabel(row.v, row.sweet), rationale: note, source: 'heuristic' }
  return { ...row, note, verdict }
}

function heuristicVerdictLabel(v: number[], sweet: boolean): string {
  const [acceptance, need, price, trust, competition] = v
  const opportunity = acceptance + need
  const topRisk = Math.max(price, trust, competition)
  if (sweet && topRisk < 45) return '매력적'
  if (opportunity >= 150 || (need >= 60 && acceptance < 55) || opportunity >= 110) return '조건부'
  return '보류'
}

function agentVerdictsOf(result: RunResultEnvelope): Map<string, MinsimAgentVerdict> {
  const map = new Map<string, MinsimAgentVerdict>()
  const orchestration = isRecord(result.orchestration) ? result.orchestration : {}
  const agents = isRecord(orchestration.agents) ? orchestration.agents : {}
  const analysis = isRecord(agents.analysis) ? agents.analysis : {}
  if (!Array.isArray(analysis.generation_verdicts)) return map
  for (const item of analysis.generation_verdicts) {
    if (!isRecord(item)) continue
    const key = typeof item.segment_key === 'string' ? item.segment_key : ''
    const verdict = typeof item.verdict === 'string' ? item.verdict : ''
    const rationale = typeof item.rationale === 'string' ? item.rationale : ''
    if (key && rationale && OPP_RISK_VERDICT_LABELS.includes(verdict)) {
      map.set(key, { verdict, rationale })
    }
  }
  return map
}

function oppRiskNote(v: number[], sweet: boolean): string {
  const [acceptance, need, price, trust, competition] = v
  const opportunity = acceptance + need
  const risks: [string, number][] = [['가격', price], ['신뢰', trust], ['경쟁', competition]]
  const [topRiskName, topRiskValue] = risks.sort((a, b) => b[1] - a[1])[0]
  if (sweet && topRiskValue < 45) return '상대 반응 높음 · 후속 검증 우선 세그먼트'
  if (opportunity >= 150) return topRiskValue >= 45 ? `상대 반응은 높으나 ${topRiskName} 저항 동반` : '상대 반응 높음 · 실제 고객 검증 필요'
  if (need >= 60 && acceptance < 55) return `니즈는 크나 ${topRiskName} 저항이 발목`
  if (opportunity >= 110) return `니즈는 있으나 ${topRiskName} 리스크가 관건`
  return '관망 우세 · 근거 보강 후 재확인 필요'
}

export const SMALL_SAMPLE_THRESHOLD = 10

export function formatShare(pct: number, count: number, total: number): string {
  return `${pct}% (${total.toLocaleString('ko-KR')}명 중 ${count.toLocaleString('ko-KR')}명)`
}

function wilsonMarginPct(successes: number, total: number): number {
  if (total <= 0) return 0
  const z = 1.96
  const p = successes / total
  const denominator = 1 + (z * z) / total
  const margin = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator
  return round(margin * 100)
}

function buildObjections(rawResults: RawPersonaResult[], watch: TitleBody[]): MinsimObjection[] {
  const reasons = rawResults.filter((item) => !item.error).map(reasonTextOf).filter(Boolean)
  const counts = new Map<string, number>()
  for (const text of reasons) {
    for (const theme of OBJECTION_THEMES) {
      if (matchesAny(text, theme.keywords)) {
        counts.set(theme.label, (counts.get(theme.label) ?? 0) + 1)
        break
      }
    }
  }
  const ranked = [...counts.entries()]
    .map(([reason, count]) => ({ reason, pct: pctOf(count, reasons.length) }))
    .filter((item) => item.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4)
  if (ranked.length > 0) {
    return ranked.map((item, index) => ({ rank: index + 1, reason: item.reason, pct: item.pct }))
  }
  return watch
    .slice(0, 4)
    .filter((item) => item.title.trim())
    .map((item, index) => ({ rank: index + 1, reason: item.title, pct: 0 }))
}

/**
 * Methodology sample charts.
 * Most sims put demographics in segments.breakdown_by_*.
 * campus_priority/campus_policy put tier maps in segments and demographics only in sample_summary.
 */
function buildSampleAge(segments: JsonObject, sampleSummary: JsonObject | null = null): [string, number][] {
  const byAge = isRecord(segments.breakdown_by_age) ? segments.breakdown_by_age : {}
  const fromSegments = orderKeys(Object.keys(byAge), AGE_ORDER)
    .map((label) => [label, sumValues(numberRecord((byAge as JsonObject)[label]))] as [string, number])
    .filter(([, n]) => n > 0)
  if (fromSegments.length > 0) return fromSegments

  const buckets = sampleSummary && isRecord(sampleSummary.age_buckets) ? sampleSummary.age_buckets : {}
  return orderKeys(Object.keys(buckets), AGE_ORDER)
    .map((label) => [label, Number(buckets[label]) || 0] as [string, number])
    .filter(([, n]) => n > 0)
}

function buildSampleRegion(segments: JsonObject, sampleSummary: JsonObject | null = null): [string, number][] {
  const byProvince = isRecord(segments.breakdown_by_province) ? segments.breakdown_by_province : {}
  const fromSegments = Object.keys(byProvince)
    .map((name) => [name, sumValues(numberRecord((byProvince as JsonObject)[name]))] as [string, number])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
  if (fromSegments.length > 0) return fromSegments

  const province = sampleSummary && isRecord(sampleSummary.province) ? sampleSummary.province : {}
  return Object.keys(province)
    .map((name) => [name, Number(province[name]) || 0] as [string, number])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
}

function buildCrowd(rawResults: RawPersonaResult[]): MinsimReport['crowd'] {
  return rawResults
    .filter((item) => !item.error)
    .slice(0, 50)
    .map((item) => {
      const persona = item.persona
      const sex = typeof persona.sex === 'string' ? persona.sex : '미상'
      return {
        uuid: item.uuid,
        name: personaDisplayName(persona, item.uuid),
        sex,
        age: typeof persona.age === 'number' ? persona.age : (persona.age as string) ?? '',
        region: (typeof persona.district === 'string' && persona.district) || (typeof persona.province === 'string' ? persona.province : ''),
        occ: typeof persona.occupation === 'string' ? persona.occupation : '',
        choice: choiceOf(item),
        quote: reasonTextOf(item).slice(0, 220),
      }
    })
}

function buildQuotes(rawResults: RawPersonaResult[]): MinsimReport['quotes'] {
  return rawResults
    .filter((item) => !item.error)
    .map((item) => {
      const body = reasonTextOf(item)
      if (!body) return null
      const persona = item.persona
      const sex = typeof persona.sex === 'string' ? persona.sex : '미상'
      const metaParts = [
        sexShortLabel(sex),
        typeof persona.age === 'number' ? `${persona.age}세` : null,
        (typeof persona.district === 'string' && persona.district) || (typeof persona.province === 'string' ? persona.province : null),
        typeof persona.occupation === 'string' ? persona.occupation : null,
      ].filter((part): part is string => Boolean(part))
      return {
        uuid: item.uuid,
        name: personaDisplayName(persona, item.uuid),
        choice: choiceOf(item),
        meta: metaParts.join(' · '),
        q: body.slice(0, 280),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 12)
}

function extractReason(response: string): string {
  const match = /이유[:：]\s*([^\n]+)/.exec(response)
  return match ? match[1].trim() : ''
}

function buildDisclaimer(result: RunResultEnvelope): string {
  const dataset = typeof result.dataset_name === 'string' && result.dataset_name.trim()
    ? result.dataset_name.trim()
    : result.country_id && result.country_id !== 'kr'
      ? `Nemotron-Personas-${result.country_id.toUpperCase()}`
      : 'Nemotron-Personas-Korea'
  return `본 결과는 NVIDIA ${dataset}(CC BY 4.0) 기반 합성 페르소나 시뮬레이션입니다. 실제 설문·시장 점유율·수요 보장을 의미하지 않으며, 의사결정 전 보조 검증 자료로 사용해야 합니다.`
}

/** Re-export legacy helper for any external callers. Prefer personaDisplayName. */
export function displayName(seed: string, sex: string): string {
  return legacyDisplayName(seed, sex)
}

export function choiceOf(item: RawPersonaResult): string {
  const parsed = item.parsed
  if (parsed && typeof parsed.choice === 'string' && parsed.choice.trim()) return parsed.choice.trim().charAt(0)
  if (parsed && typeof parsed.intent === 'string' && parsed.intent.trim()) return parsed.intent.trim()
  if (parsed && typeof parsed.segment === 'string' && parsed.segment.trim()) return parsed.segment.trim()
  if (parsed && typeof parsed.primary === 'string' && parsed.primary.trim()) return parsed.primary.trim()
  // campus_priority: first rank item is the persona's top choice label
  if (parsed && Array.isArray(parsed.ranking) && parsed.ranking.length > 0) {
    const top = parsed.ranking[0]
    if (typeof top === 'string' && top.trim()) return top.trim()
  }
  const match = /선택[:：]\s*([A-D])/.exec(item.response ?? '')
  if (match) return match[1]
  const intentMatch = /(?:대표)?의향[:：]\s*(유지|관망|이탈)/.exec(item.response ?? '')
  if (intentMatch) return intentMatch[1]
  const segmentMatch = /세그먼트[:：]\s*([^\n]+)/.exec(item.response ?? '')
  return segmentMatch ? segmentMatch[1].trim() : ''
}

/** Test/export helper for campus_priority JSON quote regression. */
export function humanQuoteFromRaw(item: RawPersonaResult): string {
  return reasonTextOf(item)
}

function confidenceLabel(total: number, parseSuccessRate: number | null): string {
  if ((parseSuccessRate ?? 0) >= 90 && total >= 50) return '보고서 기준 충족'
  if (total >= 30) return '의사결정 보조 가능'
  return '탐색용'
}

function parseSuccess(result: RunResultEnvelope): number | null {
  if (result.total_responses <= 0) return null
  return round(((result.total_responses - result.parse_failed) / result.total_responses) * 100)
}

function formatTs(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
}

function firstNonEmpty<T>(...values: T[][]): T[] {
  return values.find((items) => items.length > 0) ?? []
}

function orderKeys(keys: string[], order: string[]): string[] {
  const ranked = keys.filter((key) => order.includes(key)).sort((a, b) => order.indexOf(a) - order.indexOf(b))
  const rest = keys.filter((key) => !order.includes(key))
  return [...ranked, ...rest]
}

function numberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {}
  const out: Record<string, number> = {}
  for (const [key, item] of Object.entries(value)) {
    const numeric = asNumber(item)
    if (numeric !== null) out[key] = numeric
  }
  return out
}

function recordOfStringArray(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {}
  const out: Record<string, string[]> = {}
  for (const [key, item] of Object.entries(value)) out[key] = stringArray(item)
  return out
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function sumValues(record: Record<string, number>): number {
  return Object.values(record).reduce((sum, value) => sum + value, 0)
}

function pctOf(part: number, total: number): number {
  return total > 0 ? round((part / total) * 100) : 0
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
