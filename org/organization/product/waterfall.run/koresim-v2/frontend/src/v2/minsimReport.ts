import type { JsonObject, RawPersonaResult, RunResultEnvelope } from '../types/api'

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
  lead: string
  pct: string
  n: number
  reliability: string
  why: string
  actions: string[]
}

export type MinsimGender = {
  g: string
  icon: string
  n: number
  lead: string
  pct: string
  parts: [string, number][]
}

export type MinsimAgeRow = { label: string; n: number; parts: [string, number][] }
export type MinsimAgeFull = { label: string; n: number; pct: Record<string, number> | null; lead: string | null }
export type MinsimOppRiskCol = { k: string; dir: 'up' | 'down' }
export type MinsimOppRiskRow = { seg: string; v: number[]; note: string; sweet: boolean }
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
  intent: { buy: number; consider: number; no: number } | null
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
  ageRows: MinsimAgeRow[]
  ageFull: MinsimAgeFull[]
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

const AGE_ORDER = ['20대', '30대', '40대', '50대', '60대', '70대+', '70대', '80대+']
const NAMES_F = ['강순녀', '나순희', '장화영', '유복연', '안혜영', '박미정', '조승희', '오은숙', '정경희', '김명숙', '최영숙', '위영래', '정성임', '이도화', '강은채']
const NAMES_M = ['이재호', '임병태', '손동하', '봉수훈', '오민영', '이성기', '권상운', '백용일', '유상연', '송영범', '장남식', '이태호', '최옥남', '정승현', '이찬종']

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
  const creativeTexts = stringArray(metrics.creatives)
  const reasonsByChoice = recordOfStringArray(metrics.reasons_by_choice)
  const validChoiceTotal = Object.values(choiceCounts).reduce((sum, count) => sum + count, 0)

  const ids = Object.keys(choiceCounts).length
    ? Object.keys(choiceCounts).sort()
    : ['A', 'B', 'C'].filter((id) => id in choicePct)
  const creatives: MinsimCreative[] = ids.map((id, index) => {
    const count = choiceCounts[id] ?? 0
    const pct = round(choicePct[id] ?? 0)
    return {
      id,
      label: `${id}안`,
      text: creativeTexts[index] ?? `${id}안`,
      angle: '',
      pct,
      count,
      band: wilsonMarginPct(count, validChoiceTotal),
      color: OPT[id] ?? 'var(--opt-d)',
      winner: false,
    }
  })
  const ranked = [...creatives].sort((a, b) => b.pct - a.pct)
  if (ranked[0]) ranked[0].winner = true
  const winner = ranked[0] ?? null
  const runnerUp = ranked[1] ?? null
  const gapPoint = winner && runnerUp ? round(winner.pct - runnerUp.pct) : null

  const agent = buildAgentView(result)
  const parseSuccessRate = parseSuccess(result)
  const total = result.total_responses
  const status = confidenceLabel(total, parseSuccessRate)

  const sentiment = deriveSentiment(result.raw_results)
  const intent = deriveIntent(result.raw_results)

  const findings = agent.findings.slice(0, 4)
  const actions = agent.actions.slice(0, 4)
  const watch = agent.watch.slice(0, 4)

  const ageRows = buildAgeRows(result.segments)
  const ageFull = buildAgeFull(result.segments)
  const gender = buildGender(result.segments)
  const regions = buildRegions(result.segments)

  const winnerLabel = winner?.label ?? '기준안'
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
    { t: '패널 확장 재실행', d: '동일 시드로 표본을 키워 세그먼트 흔들림을 확인합니다.' },
    ...(runnerUp ? [{ t: `${winnerLabel} vs ${runnerUp.label} 분리 테스트`, d: '상위 두 후보를 세그먼트별로 나눠 비교합니다.' }] : []),
  ].slice(0, 2)

  return {
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
      verdictLine: agent.headline || (winner ? `‘${winner.text}’ 메시지(${winner.label})가 가장 강하게 반응합니다.` : '핵심 결론을 해석 중입니다.'),
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
      judgeBody: buildJudgeBody(winner, runnerUp, gapPoint, status),
    },
    report: {
      headline: agent.headline || (winner ? `${winner.label} 메시지를 기준안으로 권장합니다.` : '결과를 해석 중입니다.'),
      summary: agent.summary || reasonsByChoice[winner?.id ?? '']?.[0] || '집계 결과를 해석 중입니다.',
      findings,
      actions,
      watch,
    },
    keywords: buildKeywords(result.raw_results, reasonsByChoice),
    oppRisk: buildOppRisk(result.segments, result.raw_results, winner?.id ?? null),
    objections: buildObjections(result.raw_results, watch),
    ageRows,
    ageFull,
    gender,
    regions,
    reco,
    sampleAge: buildSampleAge(result.segments),
    sampleRegion: buildSampleRegion(result.segments),
    crowd: buildCrowd(result.raw_results),
    quotes: buildQuotes(result.raw_results),
    disclaimer:
      '본 결과는 NVIDIA Nemotron-Personas-Korea(CC BY 4.0) 기반 synthetic persona 시뮬레이션입니다. 실제 설문·시장 점유율·수요 보장을 의미하지 않으며, 의사결정 전 보조 검증 자료로 사용해야 합니다.',
  }
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
      return [{ title, body: asString(item.evidence) ?? '' }]
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
): string[] {
  const lines: string[] = []
  if (winner && runnerUp && gapPoint !== null) {
    lines.push(
      `이 synthetic panel에서는 ${runnerUp.label}(${runnerUp.pct}%)보다 ${gapPoint}%포인트 더 많이 선택됐습니다. 실제 시장 일반화 전 추가 검증이 필요합니다.`,
    )
  } else if (winner) {
    lines.push(`${winner.label}가 ${winner.pct}%로 가장 강한 반응을 얻었습니다.`)
  }
  lines.push(`단, 신뢰도는 ‘${status}’ 수준 — 큰 세그먼트 차이는 근거로 쓰되 소표본 세그먼트는 분리 해석이 필요합니다.`)
  return lines
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

function deriveIntent(rawResults: RawPersonaResult[]): { buy: number; consider: number; no: number } | null {
  const intents = rawResults.map(intentOf).filter((value): value is string => value !== null)
  if (intents.length >= 5) {
    const buy = pctOf(intents.filter((value) => value === 'buy').length, intents.length)
    const no = pctOf(intents.filter((value) => value === 'no').length, intents.length)
    return { buy, no, consider: Math.max(0, 100 - buy - no) }
  }
  return null
}

function scoreOf(item: RawPersonaResult): number | null {
  const parsed = item.parsed
  if (parsed && typeof parsed.score === 'number') return parsed.score
  const match = /점수[:：]\s*([0-9])/.exec(item.response ?? '')
  return match ? Number(match[1]) : null
}

function intentOf(item: RawPersonaResult): string | null {
  const parsed = item.parsed
  const raw = (parsed && typeof parsed.intent === 'string' ? parsed.intent : null) ??
    (/대표의향[:：]\s*(\S+)/.exec(item.response ?? '')?.[1] ?? /(?:^|\n)의향[:：]\s*(\S+)/.exec(item.response ?? '')?.[1] ?? null)
  if (!raw) return null
  if (/구매|구입|예/.test(raw)) return 'buy'
  if (/거부|거절|아니|미구매/.test(raw)) return 'no'
  if (/관망|고려|보류|중립/.test(raw)) return 'consider'
  return null
}

function buildAgeRows(segments: JsonObject): MinsimAgeRow[] {
  const byAge = isRecord(segments.breakdown_by_age) ? segments.breakdown_by_age : {}
  return orderKeys(Object.keys(byAge), AGE_ORDER)
    .flatMap((label) => {
      const counts = numberRecord((byAge as JsonObject)[label])
      const n = sumValues(counts)
      if (n <= 0) return []
      const parts = Object.entries(counts)
        .map(([id, count]) => [id, round((count / n) * 100)] as [string, number])
        .sort((a, b) => b[1] - a[1])
      return [{ label, n, parts }]
    })
}

function buildAgeFull(segments: JsonObject): MinsimAgeFull[] {
  const byAge = isRecord(segments.breakdown_by_age) ? segments.breakdown_by_age : {}
  return orderKeys(Object.keys(byAge), AGE_ORDER).map((label) => {
    const counts = numberRecord((byAge as JsonObject)[label])
    const n = sumValues(counts)
    if (n <= 0) return { label, n: 0, pct: null, lead: null }
    const pct: Record<string, number> = {}
    let lead = ''
    let leadCount = -1
    for (const [id, count] of Object.entries(counts)) {
      pct[id] = round((count / n) * 100)
      if (count > leadCount) {
        leadCount = count
        lead = id
      }
    }
    return { label, n, pct, lead }
  })
}

function buildGender(segments: JsonObject): MinsimGender[] {
  const bySex = isRecord(segments.breakdown_by_sex) ? segments.breakdown_by_sex : {}
  return Object.keys(bySex).map((label) => {
    const counts = numberRecord((bySex as JsonObject)[label])
    const n = sumValues(counts)
    const parts = Object.entries(counts)
      .map(([id, count]) => [id, n > 0 ? round((count / n) * 100) : 0] as [string, number])
      .sort((a, b) => b[1] - a[1])
    const top = parts[0]
    const isMale = /남/.test(label)
    return {
      g: label,
      icon: isMale ? '♂' : '♀',
      n,
      lead: top ? `${top[0]}안` : 'N/A',
      pct: top ? `${top[1]}%` : '0%',
      parts,
    }
  })
}

function buildRegions(segments: JsonObject): MinsimRegion[] {
  const byProvince = isRecord(segments.breakdown_by_province) ? segments.breakdown_by_province : {}
  return Object.keys(byProvince)
    .map((name) => {
      const counts = numberRecord((byProvince as JsonObject)[name])
      const n = sumValues(counts)
      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
      const top = entries[0]
      const lead = top ? top[0] : 'B'
      const pctNum = top && n > 0 ? round((top[1] / n) * 100) : 0
      const leadLabel = `${lead}안`
      const lowSample = n < 30
      const why = lowSample
        ? `표본이 작아(n=${n}) 편차가 큽니다. ${leadLabel} 우세는 방향성 참고치로만 해석하세요.`
        : `${leadLabel} 선호가 ${pctNum}%로 가장 높은 지역 표본입니다. 이 panel 안에서 관측된 차이이며 시장 전체를 뜻하지 않습니다.`
      const actions = lowSample
        ? ['패널 확대 후 재확인 필요', `${leadLabel} 중심 메시지로 소규모 반응 확인`]
        : [`${leadLabel} 중심 메시지로 지역 타겟 테스트`, '상위 반응 세그먼트에 같은 카피 우선 적용']
      return {
        name,
        svgId: PROVINCE_SVG_ID[name] ?? name,
        lead: leadLabel,
        pct: `${pctNum}%`,
        n,
        reliability: n >= 50 ? '높음' : n >= 30 ? '보통' : '낮음',
        why,
        actions,
      }
    })
    .sort((a, b) => b.n - a.n)
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
    const parsed = item.parsed
    if (parsed && typeof parsed.reason === 'string') push(parsed.reason)
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

function reasonTextOf(item: RawPersonaResult): string {
  const parsed = item.parsed
  if (parsed && typeof parsed.reason === 'string' && parsed.reason.trim()) return parsed.reason
  const response = typeof item.response === 'string' ? item.response : ''
  return extractReason(response) || response
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
): MinsimOppRisk | null {
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
    return { seg: label, v, opportunity }
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
    return { seg: row.seg, v: row.v, note: oppRiskNote(row.v, sweet), sweet }
  })

  return {
    cols: OPP_RISK_COLS,
    rows,
    note: '제품 검증 전용 휴리스틱 v1입니다. 0–100 상대값은 응답 분포·점수·키워드 빈도로 계산한 우선순위 참고치이며 시장 확률이나 전환율이 아닙니다.',
  }
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

function buildSampleAge(segments: JsonObject): [string, number][] {
  const byAge = isRecord(segments.breakdown_by_age) ? segments.breakdown_by_age : {}
  return orderKeys(Object.keys(byAge), AGE_ORDER).map((label) => [label, sumValues(numberRecord((byAge as JsonObject)[label]))])
}

function buildSampleRegion(segments: JsonObject): [string, number][] {
  const byProvince = isRecord(segments.breakdown_by_province) ? segments.breakdown_by_province : {}
  return Object.keys(byProvince)
    .map((name) => [name, sumValues(numberRecord((byProvince as JsonObject)[name]))] as [string, number])
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
      const reason = item.parsed && typeof item.parsed.reason === 'string' ? item.parsed.reason : ''
      return {
        uuid: item.uuid,
        name: displayName(item.uuid, sex),
        sex,
        age: typeof persona.age === 'number' ? persona.age : (persona.age as string) ?? '',
        region: (typeof persona.district === 'string' && persona.district) || (typeof persona.province === 'string' ? persona.province : ''),
        occ: typeof persona.occupation === 'string' ? persona.occupation : '',
        choice: choiceOf(item),
        quote: (reason || extractReason(item.response) || item.response.replace(/\s+/g, ' ').slice(0, 160)).trim(),
      }
    })
}

function buildQuotes(rawResults: RawPersonaResult[]): MinsimReport['quotes'] {
  return rawResults
    .filter((item) => !item.error && typeof item.response === 'string' && item.response.trim())
    .slice(0, 12)
    .map((item) => {
      const persona = item.persona
      const sex = typeof persona.sex === 'string' ? persona.sex : '미상'
      const metaParts = [
        /남/.test(sex) ? '남' : '여',
        typeof persona.age === 'number' ? `${persona.age}세` : null,
        (typeof persona.district === 'string' && persona.district) || (typeof persona.province === 'string' ? persona.province : null),
        typeof persona.occupation === 'string' ? persona.occupation : null,
      ].filter((part): part is string => Boolean(part))
      const reason = item.parsed && typeof item.parsed.reason === 'string' ? item.parsed.reason : ''
      const body = reason || extractReason(item.response) || item.response.replace(/\s+/g, ' ').slice(0, 160)
      return {
        uuid: item.uuid,
        name: displayName(item.uuid, sex),
        choice: choiceOf(item),
        meta: metaParts.join(' · '),
        q: body.trim(),
      }
    })
}

function extractReason(response: string): string {
  const match = /이유[:：]\s*([^\n]+)/.exec(response)
  return match ? match[1].trim() : ''
}

export function displayName(seed: string, sex: string): string {
  const pool = /남/.test(sex) ? NAMES_M : /여/.test(sex) ? NAMES_F : [...NAMES_F, ...NAMES_M]
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return pool[hash % pool.length]
}

export function choiceOf(item: RawPersonaResult): string {
  const parsed = item.parsed
  if (parsed && typeof parsed.choice === 'string' && parsed.choice.trim()) return parsed.choice.trim().charAt(0)
  const match = /선택[:：]\s*([A-D])/.exec(item.response ?? '')
  return match ? match[1] : ''
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
