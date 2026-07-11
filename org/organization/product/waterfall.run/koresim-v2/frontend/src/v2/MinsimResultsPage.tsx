import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import {
  askProjectRunFollowup,
  askProjectRunInterview,
  getProject,
  getProjectRunExport,
  getProjectRunResult,
  listProjectRuns,
  submitProjectRunFeedback,
} from '../api/projects'
import type { ProjectResponse, ProjectRunItem, RunResultEnvelope } from '../types/api'
import { navigateTo } from './navigation'
import { adaptRunResult } from './resultAdapter'
import { buildMinsimReport, type MinsimReport, type MinsimRegion, type TitleBody } from './minsimReport'
import { InteractiveKoreaMap } from './KoreaReactionMap'
import type { V2EvidenceQuote, V2FollowupLogEntry } from './types'

const OPT: Record<string, string> = {
  A: 'var(--opt-a)',
  B: 'var(--opt-b)',
  C: 'var(--opt-c)',
  D: 'var(--opt-d)',
}

type ResultsState = {
  project: ProjectResponse | null
  run: ProjectRunItem | null
  result: RunResultEnvelope | null
  loading: boolean
  error: string | null
}

export function MinsimResultsPage({ projectId, runId }: { projectId: string | null; runId: string | null }) {
  const [state, setState] = useState<ResultsState>({ project: null, run: null, result: null, loading: true, error: null })
  const [followupQuestion, setFollowupQuestion] = useState('이 결과에서 가장 큰 거절 이유를 더 구체적으로 말해주세요.')
  const [followupCohort, setFollowupCohort] = useState('all')
  const [selectedQuote, setSelectedQuote] = useState<V2EvidenceQuote | null>(null)
  const [interviewQuestion, setInterviewQuestion] = useState('왜 그렇게 답했는지 한 문장 더 설명해주세요.')
  const [logs, setLogs] = useState<V2FollowupLogEntry[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [intendedAction, setIntendedAction] = useState('')
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId || !runId) {
      setState({ project: null, run: null, result: null, loading: false, error: 'project_id와 run_id가 필요합니다.' })
      return
    }
    let cancelled = false
    Promise.all([getProject(projectId), listProjectRuns(projectId), getProjectRunResult(projectId, runId)])
      .then(([project, runs, result]) => {
        if (cancelled) return
        const run = runs.runs.find((item) => item.run.run_id === runId) ?? null
        setState({ project, run, result, loading: false, error: null })
      })
      .catch((err) => {
        if (cancelled) return
        setState({ project: null, run: null, result: null, loading: false, error: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [projectId, runId])

  const view = useMemo(() => (state.result ? adaptRunResult(state.result) : null), [state.result])
  const report = useMemo(
    () => (state.result ? buildMinsimReport(state.result, { completedAt: state.run?.run.completed_at ?? null }) : null),
    [state.result, state.run],
  )

  const downloadExport = async () => {
    if (!projectId || !runId) return
    try {
      setActionError(null)
      const exportReport = await getProjectRunExport(projectId, runId)
      const blob = new Blob([JSON.stringify(exportReport, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `koresim-v2-${runId.slice(0, 8)}-report.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  const submitFollowup = async (event: FormEvent) => {
    event.preventDefault()
    if (!projectId || !runId || !followupQuestion.trim()) return
    try {
      setActionError(null)
      const response = await askProjectRunFollowup(projectId, runId, {
        question: followupQuestion,
        cohort: followupCohort,
        sample_size: 8,
      })
      setLogs((current) => [
        {
          id: `followup-${Date.now()}`,
          kind: 'followup',
          question: response.question,
          cohort: response.cohort,
          summary: response.summary,
          answers: response.answers.map((answer) => `${answer.name}: ${answer.answer}`),
        },
        ...current,
      ])
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  const submitInterview = async (event: FormEvent) => {
    event.preventDefault()
    if (!projectId || !runId || !interviewQuestion.trim()) return
    try {
      setActionError(null)
      const response = await askProjectRunInterview(projectId, runId, {
        subject_uuid: selectedQuote?.uuid ?? null,
        question: interviewQuestion,
        sample_size: 1,
      })
      setLogs((current) => [
        {
          id: `interview-${Date.now()}`,
          kind: 'interview',
          question: response.question,
          cohort: selectedQuote?.label ?? response.subject_uuid ?? 'all',
          summary: response.summary,
          answers: response.answers.map((answer) => `${answer.name}: ${answer.answer}`),
        },
        ...current,
      ])
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  const submitFeedback = async (event: FormEvent) => {
    event.preventDefault()
    if (!projectId || !runId) return
    try {
      setActionError(null)
      await submitProjectRunFeedback(projectId, runId, {
        usefulness_score: 4,
        trust_score: 4,
        actionability_score: 4,
        intended_action: intendedAction,
        free_text: feedbackText,
      })
      setFeedbackNotice('피드백을 저장했습니다.')
      setFeedbackText('')
      setIntendedAction('')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  if (state.loading) return <p className="muted" style={{ padding: '48px 0' }}>결과를 불러오는 중…</p>
  if (state.error) {
    return (
      <div className="wrap" style={{ paddingTop: 48 }}>
        <div className="kicker">Results</div>
        <h1 style={{ fontSize: 28, marginTop: 8 }}>결과를 열 수 없습니다</h1>
        <p className="muted" style={{ marginTop: 8 }}>{state.error}</p>
      </div>
    )
  }
  if (!report || !view) return <p className="muted" style={{ padding: '48px 0' }}>결과가 없습니다.</p>

  const projectName = state.project?.name ?? 'Project'
  const runLabel = state.run?.run_label ?? view.simulationLabel
  const projectPath = state.project ? `/projects/${encodeURIComponent(state.project.project_id)}` : '/projects'
  const intakePath = state.project ? `/projects/${encodeURIComponent(state.project.project_id)}/type` : '/projects'

  const openInterview = (uuid: string, name: string, choice: string, meta: string, body: string) => {
    setSelectedQuote({ uuid, label: `${name} · ${choice}안`, meta, body, tone: 'neutral', cohort: choice || 'all' })
    document.getElementById('interview-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="report">
      {/* toolbar */}
      <div className="results-toolbar">
        <div className="wrap spread" style={{ height: 52 }}>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <button className="btn ghost sm" onClick={() => navigateTo(projectPath)}>
              ← {projectName.split(' ')[0]} 프로젝트
            </button>
            <span style={{ fontWeight: 600 }}>{runLabel}</span>
            <span className="lbl-mono faint">📁 {projectName}</span>
            <span className="badge live">{view.statusLabel}</span>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <button className="btn ghost sm" onClick={() => navigateTo(intakePath)}>
              ＋ 새 시뮬레이션
            </button>
            <button className="btn sm" onClick={downloadExport}>
              ⌁ 내보내기
            </button>
          </div>
        </div>
      </div>

      <div className="wrap">
        <Verdict report={report} onExport={downloadExport} />
        <CoreCase report={report} />
        <DecisionSummary report={report} />
        <hr className="hr" />
        <AiReport report={report} />
        <hr className="hr" />
        <MarketResponse report={report} />
        <hr className="hr" />
        <AgeFullTable report={report} />
        <hr className="hr" />
        <SegmentMatrix report={report} />
        <hr className="hr" />
        <OpportunityRiskMap report={report} />
        <hr className="hr" />
        <EvidenceSection report={report} onOpen={openInterview} />
        <hr className="hr" />
        <Methodology report={report} />
        <hr className="hr" />
        <Crowd report={report} onOpen={openInterview} />
        <hr className="hr" />

        {/* follow-up + interview */}
        <section style={{ padding: '40px 0' }}>
          <SectionHead kicker="후속 분석" title="결과에서 다시 묻기" sub="집계 결과를 바탕으로 코호트에 후속 질문을 던지거나, 특정 응답자와 바로 인터뷰합니다." />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <form className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={submitFollowup}>
              <div className="lbl-mono">후속질문 · 코호트 선택</div>
              <select className="inp" value={followupCohort} onChange={(event) => setFollowupCohort(event.target.value)}>
                <option value="all">전체</option>
                <option value="positive">긍정층</option>
                <option value="negative">부정층</option>
                <option value="confused">혼란층</option>
                {view.ranks.slice(0, 4).map((row) => (
                  <option key={row.label} value={row.label}>{row.label}</option>
                ))}
              </select>
              <textarea className="inp" value={followupQuestion} onChange={(event) => setFollowupQuestion(event.target.value)} rows={3} />
              <button className="btn primary" type="submit">↳ 후속질문 실행</button>
            </form>

            <form id="interview-panel" className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={submitInterview}>
              <div className="lbl-mono">페르소나 인터뷰</div>
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                {selectedQuote ? selectedQuote.label : '발언 카드나 군중 카드를 누르면 그 응답자와, 없으면 전체에서 1명을 샘플링합니다.'}
              </p>
              <textarea className="inp" value={interviewQuestion} onChange={(event) => setInterviewQuestion(event.target.value)} rows={3} />
              <button className="btn" type="submit">🗪 인터뷰</button>
            </form>
          </div>

          {logs.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="spread" style={{ alignItems: 'baseline', marginBottom: 10, gap: 12 }}>
                <div className="lbl-mono">후속 분석 로그</div>
                <div className="row" style={{ gap: 12 }}>
                  <span className="lbl-mono">{logs.length}건 누적</span>
                  <button type="button" className="btn ghost sm" style={{ padding: '2px 8px', fontSize: 11.5 }} onClick={() => setLogs([])}>
                    지우기
                  </button>
                </div>
              </div>
              <div className="v2-followup-log-scroll">
                {logs.map((log) => (
                  <div key={log.id} className="card" style={{ padding: 16 }}>
                    <div className="spread" style={{ marginBottom: 8 }}>
                      <span className="row" style={{ gap: 8 }}>
                        <span className="badge" style={{ border: '1px solid var(--border-strong)', color: 'var(--fg-dim)' }}>
                          {log.kind === 'followup' ? '후속질문' : '인터뷰'}
                        </span>
                        <span className="lbl-mono faint">{log.cohort}</span>
                      </span>
                      <span className="lbl-mono">{log.answers.length}명</span>
                    </div>
                    <div className="row" style={{ gap: 10, alignItems: 'flex-start', marginBottom: 6 }}>
                      <span className="lbl-mono" style={{ color: 'var(--lime)', flex: 'none', marginTop: 1 }}>Q</span>
                      <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>{log.question}</span>
                    </div>
                    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                      <span className="lbl-mono faint" style={{ flex: 'none', marginTop: 1 }}>A</span>
                      <div className="col" style={{ gap: 4, minWidth: 0 }}>
                        <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>{log.summary}</p>
                        {log.answers.slice(0, 3).map((answer) => (
                          <span
                            key={answer}
                            className="lbl"
                            title={answer}
                            style={{ fontSize: 11.5, lineHeight: 1.5, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          >
                            · {answer}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <hr className="hr" />

        {/* feedback */}
        <section style={{ padding: '40px 0 64px' }}>
          <SectionHead kicker="결과 피드백" title="이 결과, 쓸 만했나요?" />
          <form className="card" style={{ padding: 22 }} onSubmit={submitFeedback}>
            <div className="col" style={{ gap: 6, marginBottom: 12 }}>
              <span className="lbl">이 결과로 무엇을 할 예정인가요?</span>
              <input className="inp" value={intendedAction} onChange={(event) => setIntendedAction(event.target.value)} placeholder="예) A안은 폐기, B안 헤드라인으로 상세페이지 제작" />
            </div>
            <div className="col" style={{ gap: 6, marginBottom: 16 }}>
              <span className="lbl">부족했던 점</span>
              <textarea className="inp" value={feedbackText} onChange={(event) => setFeedbackText(event.target.value)} placeholder="결과 해석, 질문 흐름, 보고서에서 아쉬웠던 점을 적어주세요." />
            </div>
            <button className="btn primary block" type="submit">피드백 저장</button>
            {feedbackNotice && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>{feedbackNotice}</p>}
          </form>
        </section>

        {actionError && <p className="muted" style={{ color: 'var(--fg)', paddingBottom: 40 }}>⚠ {actionError}</p>}
      </div>
    </div>
  )
}

/* ---------------------------------- atoms --------------------------------- */

function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="kicker">{children}</div>
}

function SectionHead({ kicker, title, sub, right }: { kicker: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="spread" style={{ alignItems: 'flex-end', marginBottom: 18, gap: 16, flexWrap: 'wrap' }}>
      <div className="col" style={{ gap: 8 }}>
        <Kicker>{kicker}</Kicker>
        <h2 style={{ fontSize: 26 }}>{title}</h2>
        {sub && <p className="muted" style={{ fontSize: 13.5, maxWidth: 560, lineHeight: 1.55 }}>{sub}</p>}
      </div>
      {right}
    </div>
  )
}

function Bar({ pct, cls = '', h = 8 }: { pct: number; cls?: string; h?: number }) {
  return (
    <div className={`bar ${cls}`.trim()} style={{ height: h }}>
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

function StackBar({ parts, h = 18 }: { parts: [string, number][]; h?: number }) {
  return (
    <div className="row" style={{ height: h, borderRadius: 5, overflow: 'hidden', background: '#ECE9E3' }}>
      {parts.map(([id, pct], index) => (
        <div key={`${id}-${index}`} style={{ width: `${pct}%`, height: '100%', background: OPT[id] }} title={`${id} ${pct}%`} />
      ))}
    </div>
  )
}

function ChoicePill({ id, on = false, suffix = '안' }: { id: string; on?: boolean; suffix?: string }) {
  const color = OPT[id] ?? 'var(--opt-d)'
  return (
    <span className="badge" style={{ background: on ? color : 'transparent', color: on ? '#FAFAF9' : color, border: `1px solid ${color}`, fontWeight: 700 }}>
      {id}
      {suffix}
    </span>
  )
}

function RatioBar({ parts }: { parts: [string, number][] }) {
  const total = parts.reduce((sum, part) => sum + (part[1] || 0), 0) || 1
  const inks = ['rgba(15,14,13,.62)', 'rgba(15,14,13,.26)', 'rgba(15,14,13,.10)']
  return (
    <div className="col" style={{ gap: 8 }}>
      <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', border: '1px solid var(--border-soft)' }}>
        {parts.map((part, index) => (
          <div key={index} style={{ width: `${(part[1] / total) * 100}%`, background: inks[index] || inks[2] }} />
        ))}
      </div>
      <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
        {parts.map((part, index) => (
          <span key={index} className="lbl" style={{ fontSize: 11.5 }}>
            <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: inks[index] || inks[2], marginRight: 5, verticalAlign: 'middle' }} />
            {part[0]} <b style={{ color: 'var(--fg)' }}>{part[1]}%</b>
          </span>
        ))}
      </div>
    </div>
  )
}

/* --------------------------------- sections -------------------------------- */

function Verdict({ report, onExport }: { report: MinsimReport; onExport: () => void }) {
  const { run, winner, runnerUp } = report
  if (!winner) return null
  const metrics = [
    { l: '응답 표본', v: `${run.panel.toLocaleString('ko-KR')}명`, s: `요청 표본 ${run.valid.toLocaleString('ko-KR')}명 해석 가능` },
    { l: '선호 격차', v: run.gap, s: runnerUp ? `1위−2위 (${winner.id}−${runnerUp.id})` : '1위 기준' },
    { l: '해석 상태', v: run.status, s: `구조화 성공 ${run.structured}` },
  ]
  return (
    <section style={{ paddingTop: 30, paddingBottom: 34 }}>
      <div className="spread" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <Kicker>{run.gap === '집계 중' ? '분석 보고서' : '크리에이티브 비교 분석 보고서'}</Kicker>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr .9fr', gap: 22 }}>
        <div className="col" style={{ gap: 22 }}>
          <div>
            <span className="badge lime" style={{ marginBottom: 16 }}>먼저 선택 · {winner.label}</span>
            <h1 style={{ fontSize: 'clamp(24px, 6.2vw, 38px)', lineHeight: 1.18, marginTop: 14, letterSpacing: '-.025em', fontWeight: 600 }}>{winner.text}</h1>
            <p className="muted" style={{ fontSize: 15, lineHeight: 1.65, marginTop: 16, maxWidth: 640 }}>
              {run.verdictLine} {run.conclusion}
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'var(--border-soft)', border: '1px solid var(--border-soft)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
            {metrics.map((metric) => (
              <div key={metric.l} style={{ background: 'var(--bg)', padding: '18px' }}>
                <div className="lbl-mono" style={{ marginBottom: 10 }}>{metric.l}</div>
                <div className="num-lg" style={{ fontSize: 24 }}>{metric.v}</div>
                <div className="lbl" style={{ marginTop: 8 }}>{metric.s}</div>
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <button className="btn" onClick={onExport}>⌁ 검토용 보고서 내보내기</button>
            <span className="lbl-mono" style={{ alignSelf: 'center' }}>실행 {run.runId} · n={run.panel}</span>
          </div>
        </div>
        <div className="col" style={{ gap: 12 }}>
          {[
            { t: '최종 판단', v: run.status, d: '전체 방향성은 읽을 수 있고, 큰 세그먼트 차이는 보조 근거로 사용합니다.', accent: false, foot: '' },
            { t: '1위 항목', v: `${winner.pct}% · ${winner.count}명`, d: winner.text, accent: true, foot: '' },
            { t: '비교 기준', v: `격차 ${run.gap}`, d: runnerUp?.text ?? '', accent: false, foot: runnerUp ? `vs ${runnerUp.label}` : '' },
          ].map((card) => (
            <div key={card.t} className="card" style={{ padding: 16, borderColor: card.accent ? 'var(--lime-line)' : 'var(--border)' }}>
              <div className="lbl-mono" style={{ marginBottom: 8 }}>{card.t}</div>
              <div style={{ fontWeight: 600, fontSize: card.accent ? 16 : 15, color: card.accent ? 'var(--lime)' : 'var(--fg)', lineHeight: 1.4 }}>{card.v}</div>
              <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 8 }}>{card.d}</div>
              {card.foot && <div className="lbl-mono" style={{ marginTop: 8 }}>{card.foot}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CoreCase({ report }: { report: MinsimReport }) {
  const { core, sentiment, intent } = report
  return (
    <section style={{ padding: '32px 0 8px' }}>
      <SectionHead kicker="핵심 한눈에" title="코어 케이스" sub="페르소나를 다 펼치기 전에, 의사결정에 필요한 6가지만 먼저 봅니다." />
      <div className="card" style={{ padding: 22, borderColor: 'var(--lime-line)', marginBottom: 12 }}>
        <div className="lbl-mono" style={{ marginBottom: 10, color: 'var(--lime)' }}>한 줄 결론</div>
        <div style={{ fontWeight: 600, fontSize: 17, lineHeight: 1.5 }}>{core.conclusion}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="lbl-mono" style={{ marginBottom: 14 }}>긍정 · 중립 · 부정 비율 <span className="faint">· 보조 추정</span></div>
          <RatioBar parts={[['긍정', sentiment.pos], ['중립', sentiment.neu], ['부정', sentiment.neg]]} />
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="lbl-mono" style={{ marginBottom: 14 }}>구매 의향 <span className="faint">· 보조 추정</span></div>
          <RatioBar parts={[['구매', intent.buy], ['고려', intent.consider], ['거절', intent.no]]} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <ReasonCard mark="▲" title="긍정 이유" items={core.positives} empty="긍정 신호를 해석 중입니다." />
        <ReasonCard mark="▼" title="거절 이유" items={core.rejections} empty="거절 신호를 해석 중입니다." dim />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="card card-2" style={{ padding: 20 }}>
          <div className="lbl-mono" style={{ marginBottom: 12, color: 'var(--lime)' }}>개선 제안</div>
          <div className="col" style={{ gap: 10 }}>
            {core.improvements.map((item, index) => (
              <div key={index} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <span className="lbl-mono" style={{ color: 'var(--lime)', flex: 'none', marginTop: 1 }}>0{index + 1}</span>
                <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                  {item.title ? <b style={{ color: 'var(--fg)' }}>{item.title}</b> : null}
                  {item.title && item.body ? ' — ' : ''}
                  {item.body}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="card card-2" style={{ padding: 20 }}>
          <div className="lbl-mono" style={{ marginBottom: 12, color: 'var(--lime)' }}>다음 실험</div>
          <div className="col" style={{ gap: 10 }}>
            {core.nextExp.map((item, index) => (
              <div key={index} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <span className="lbl-mono" style={{ color: 'var(--lime)', flex: 'none', marginTop: 1 }}>→</span>
                <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                  <b style={{ color: 'var(--fg)' }}>{item.t}</b>
                  {item.d ? ` — ${item.d}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function ReasonCard({ mark, title, items, empty, dim }: { mark: string; title: string; items: TitleBody[]; empty: string; dim?: boolean }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="lbl-mono" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11 }}>{mark}</span>
        {title}
      </div>
      <div className="col" style={{ gap: 10 }}>
        {items.length ? (
          items.map((item, index) => (
            <div key={index} className="col" style={{ gap: 3 }}>
              {item.title && <span style={{ fontSize: 13, fontWeight: 600, color: dim ? 'var(--fg-dim)' : 'var(--fg)' }}>{item.title}</span>}
              {item.body && <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>{item.body}</span>}
            </div>
          ))
        ) : (
          <span className="muted" style={{ fontSize: 12.5 }}>{empty}</span>
        )}
      </div>
    </div>
  )
}

function DecisionSummary({ report }: { report: MinsimReport }) {
  const { winner, run, decision, reco } = report
  if (!winner) return null
  return (
    <section style={{ padding: '40px 0' }}>
      <SectionHead kicker="의사결정" title="핵심 요약" />
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="lbl-mono" style={{ marginBottom: 10 }}>무엇을 선택할까</div>
          <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.45, marginBottom: 10 }}>{winner.text}</div>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>{run.conclusion}</p>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="lbl-mono" style={{ marginBottom: 10 }}>판세 · 신뢰도</div>
          <div className="num-lg" style={{ marginBottom: 4 }}>
            {winner.label} {winner.pct}% <span style={{ fontSize: 14, color: 'var(--fg-faint)', fontWeight: 500 }}>· 1위</span>
          </div>
          {decision.judgeBody.map((line, index) => (
            <p key={index} className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: index < decision.judgeBody.length - 1 ? 10 : 0 }}>{line}</p>
          ))}
        </div>
      </div>
      <div className="card-2 card" style={{ padding: 20 }}>
        <div className="lbl-mono" style={{ marginBottom: 12, color: 'var(--lime)' }}>권장 액션 · {reco.action}</div>
        <div className="col" style={{ gap: 10 }}>
          {reco.bullets.map((bullet, index) => (
            <div key={index} className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
              <span className="lbl-mono" style={{ color: 'var(--lime)' }}>0{index + 1}</span>
              <span className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>{bullet}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function AiReport({ report }: { report: MinsimReport }) {
  const columns: [string, TitleBody[]][] = [
    ['핵심 발견', report.report.findings],
    ['추천 행동', report.report.actions],
    ['주의할 점', report.report.watch],
  ]
  return (
    <section style={{ padding: '40px 0' }}>
      <SectionHead kicker="분석 · 보고" title="AI 해석 보고서" />
      <div className="card" style={{ padding: 22, borderColor: 'var(--lime-line)', marginBottom: 16 }}>
        <div className="lbl-mono" style={{ marginBottom: 10, color: 'var(--lime)' }}>핵심 결론</div>
        <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 10 }}>{report.report.headline}</div>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.7, maxWidth: 840 }}>{report.report.summary}</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, alignItems: 'start' }}>
        {columns.map(([title, items]) => (
          <div key={title} className="col" style={{ gap: 10 }}>
            <div className="spread" style={{ alignItems: 'baseline', marginBottom: 2 }}>
              <span style={{ fontWeight: 700, fontSize: 14.5 }}>{title}</span>
              <span className="lbl-mono">{items.length}건</span>
            </div>
            {items.map((item, index) => (
              <div key={index} className="card" style={{ padding: 16 }}>
                <div className="row" style={{ gap: 11, alignItems: 'flex-start' }}>
                  <span className="lbl-mono" style={{ color: 'var(--fg-faint)', flex: 'none', marginTop: 1 }}>0{index + 1}</span>
                  <div className="col" style={{ gap: 6, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.45 }}>{item.title}</div>
                    {item.body && <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>{item.body}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

function MarketResponse({ report }: { report: MinsimReport }) {
  const { creatives, winner, runnerUp, keywords } = report
  return (
    <section style={{ padding: '40px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 40 }}>
        <div>
          <SectionHead kicker="시장 반응" title="주요 지표 해석" sub="퍼센트 옆 ±는 같은 시드로 재현했을 때의 변동 폭(재현 안정성)입니다." />
          <div className="col" style={{ gap: 18 }}>
            {creatives.map((creative, index) => (
              <div key={creative.id} className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
                <span className="num-lg" style={{ fontSize: 18, color: 'var(--fg-faint)', width: 18 }}>{index + 1}</span>
                <div className="col" style={{ flex: 1, gap: 8, minWidth: 0 }}>
                  <div className="spread" style={{ gap: 12 }}>
                    <span style={{ fontSize: 14, lineHeight: 1.45 }}>{creative.text}</span>
                    <span className="row" style={{ gap: 6, alignItems: 'baseline', flex: 'none' }}>
                      <span className="metric" style={{ fontWeight: 700, fontSize: 17, color: creative.color }}>{creative.pct}%</span>
                      <span className="lbl-mono" style={{ fontSize: 11 }}>±{creative.band}</span>
                    </span>
                  </div>
                  <div className="lbl-mono">선호도 분포 · {creative.label} · {creative.count}명 · 재현 변동 ±{creative.band}%p</div>
                  <Bar pct={creative.pct} cls={creative.id.toLowerCase()} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SectionHead kicker="인사이트" title="자동 추출" />
          {winner && (
            <div className="card" style={{ padding: 18, marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{winner.label}이 가장 많이 선택됐습니다</div>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
                {winner.label}이 {winner.count}명({winner.pct}%)에게 선택돼 가장 강한 반응을 얻었습니다.
                {runnerUp ? ` 2위 ${runnerUp.label}(${runnerUp.count}명·${runnerUp.pct}%)보다 ${report.run.gap} 더 많이 선택됐습니다.` : ''}
              </p>
            </div>
          )}
          {keywords.length > 0 && (
            <div className="card" style={{ padding: 18 }}>
              <div className="lbl-mono" style={{ marginBottom: 14 }}>한국 문화·정서 키워드 자동 추출</div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {keywords.map((keyword) => (
                  <span key={keyword.w} className="chip sm" style={{ fontSize: 11 + Math.min(7, keyword.n / 4) }}>
                    {keyword.w} <span className="faint">{keyword.n}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function AgeFullTable({ report }: { report: MinsimReport }) {
  const { ageFull, creatives } = report
  if (ageFull.length === 0) return null
  const legend = [...creatives].sort((a, b) => a.id.localeCompare(b.id))
  const gridTemplate = `80px repeat(${legend.length},46px) 1fr`
  return (
    <section style={{ padding: '40px 0' }}>
      <SectionHead kicker="연령 분포" title="연령대별 선호 — 전체" sub="각 연령대가 후보를 고른 비율입니다. 굵은 숫자가 해당 연령대의 1위." />
      <div className="row" style={{ gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        {legend.map((creative) => (
          <span key={creative.id} className="row lbl" style={{ gap: 6, fontSize: 12, whiteSpace: 'nowrap' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: OPT[creative.id], flex: 'none' }} />
            {creative.label}
          </span>
        ))}
      </div>
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: 12, alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <span className="lbl-mono">연령</span>
          {legend.map((creative) => (
            <span key={creative.id} className="lbl-mono" style={{ textAlign: 'right' }}>{creative.label}</span>
          ))}
          <span className="lbl-mono" style={{ paddingLeft: 10 }}>분포</span>
        </div>
        {ageFull.map((row) => (
          <div key={row.label} style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: 12, alignItems: 'center', padding: '13px 0', borderTop: '1px solid var(--border-soft)' }}>
            <span className="col" style={{ gap: 2 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{row.label}</span>
              <span className="lbl" style={{ fontSize: 11 }}>{row.n}명</span>
            </span>
            {row.pct ? (
              legend.map((creative) => (
                <span
                  key={creative.id}
                  className="metric"
                  style={{ textAlign: 'right', fontSize: 14, fontWeight: row.lead === creative.id ? 700 : 500, color: row.lead === creative.id ? 'var(--fg)' : 'var(--fg-faint)' }}
                >
                  {row.pct?.[creative.id] ?? 0}%
                </span>
              ))
            ) : (
              <span style={{ gridColumn: `2 / ${legend.length + 2}`, textAlign: 'center' }} className="lbl">응답 없음</span>
            )}
            {row.pct ? (
              <div style={{ paddingLeft: 10 }}>
                <StackBar parts={legend.map((creative) => [creative.id, row.pct?.[creative.id] ?? 0])} h={14} />
              </div>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function SegmentMatrix({ report }: { report: MinsimReport }) {
  const { ageRows, gender, regions, creatives } = report
  const [region, setRegion] = useState<MinsimRegion | null>(null)
  const legend = [...creatives].sort((a, b) => a.id.localeCompare(b.id))
  const totalRegionN = regions.reduce((sum, item) => sum + item.n, 0)
  return (
    <section style={{ padding: '40px 0' }}>
      <SectionHead kicker="세그먼트 표" title="세그먼트 반응 매트릭스" />
      <div className="row" style={{ gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {legend.map((creative) => (
          <span key={creative.id} className="row lbl" style={{ gap: 6, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: OPT[creative.id] }} />
            {creative.label}
          </span>
        ))}
      </div>

      {ageRows.length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 12 }}>
          <div className="lbl-mono" style={{ marginBottom: 16 }}>연령대별 반응</div>
          <div className="col" style={{ gap: 12 }}>
            {ageRows.map((row) => (
              <div key={row.label} className="row" style={{ gap: 14 }}>
                <span className="lbl" style={{ width: 48, fontSize: 12.5 }}>
                  {row.label}
                  <br />
                  <span className="faint">{row.n}명</span>
                </span>
                <div style={{ flex: 1 }}>
                  <StackBar parts={row.parts} />
                </div>
                <span className="lbl-mono" style={{ width: 130, textAlign: 'right' }}>{row.parts.map(([id, pct]) => `${id} ${pct}`).join(' · ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {regions.length > 0 && (
        <div className="region-map-layout">
          <div className="card region-map-card">
            <div className="spread" style={{ marginBottom: 14, gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="col" style={{ gap: 3, minWidth: 0 }}>
                <div className="lbl-mono">지역별 반응 지도 · 지역을 누르면 상세</div>
                <span className="muted" style={{ fontSize: 12.5 }}>행정경계 SVG를 안별 색상과 반응 강도로 다시 그린 시도 지도</span>
              </div>
              <span className="region-confidence">{regions.length}개 시도</span>
            </div>
            <InteractiveKoreaMap regions={regions} selectedRegion={region} onSelect={setRegion} />
          </div>
          <div className="card region-side-card">
            <RegionDetailPanel region={region} onClear={() => setRegion(null)} />
            <div className="region-list-head">
              <span className="lbl-mono">지역 반응 순위</span>
              <span className="lbl">총 {totalRegionN}명</span>
            </div>
            <div className="region-list-scroll">
              {regions.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className={`region-list-button spread${region && region.name === item.name ? ' on' : ''}`}
                  onClick={() => setRegion(item)}
                >
                  <div className="col" style={{ gap: 3 }}>
                    <span className="row" style={{ gap: 7 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</span>
                      <ChoicePill id={item.lead.charAt(0)} on={Boolean(region && region.name === item.name)} />
                    </span>
                    <span className="lbl-mono">{item.lead} {item.pct} · 신뢰 {item.reliability}</span>
                  </div>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="muted" style={{ fontSize: 12.5 }}>{item.n}명</span>
                    <span style={{ color: 'var(--lime)' }}>→</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {gender.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          {gender.map((item) => (
            <div key={item.g} className="card" style={{ padding: 18 }}>
              <div className="row" style={{ gap: 12, marginBottom: 12 }}>
                <div className="av" style={{ width: 34, height: 34, fontSize: 16 }}>{item.icon}</div>
                <div className="col">
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{item.g}</span>
                  <span className="lbl">{item.n}명 · {item.lead} {item.pct}</span>
                </div>
              </div>
              <StackBar parts={item.parts} h={14} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function OpportunityRiskMap({ report }: { report: MinsimReport }) {
  const { oppRisk, objections } = report
  if (!oppRisk) return null
  const cols = oppRisk.cols
  const grid = '92px repeat(5,1fr) 1.6fr'
  const topObjection = objections.find((item) => item.pct > 0) ?? null
  return (
    <section style={{ padding: '40px 0' }}>
      <SectionHead
        kicker="기회 · 리스크"
        title="기회 / 리스크 통합 맵"
        sub="세그먼트별로 어디에 기회가 크고 어디에 리스크가 숨어 있는지를 한 표로 봅니다."
      />

      <div className="card" style={{ padding: 20, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 6, alignItems: 'end', marginBottom: 10 }}>
          <span />
          {cols.map((col) => (
            <span key={col.k} className="lbl-mono" style={{ textAlign: 'center', fontSize: 10.5, lineHeight: 1.3 }}>
              <span style={{ display: 'block', fontSize: 11 }}>{col.dir === 'up' ? '▲' : '▼'}</span>
              {col.k}
            </span>
          ))}
          <span className="lbl-mono" style={{ paddingLeft: 12 }}>해석</span>
        </div>

        {oppRisk.rows.map((row) => (
          <div key={row.seg} style={{ display: 'grid', gridTemplateColumns: grid, gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <span className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
              {row.seg}
              {row.sweet && <span style={{ color: 'var(--lime)' }}>★</span>}
            </span>
            {row.v.map((val, ci) => {
              const isRisk = cols[ci].dir === 'down'
              const t = val / 100
              const ink = `rgba(15,14,13,${0.05 + t * 0.42})`
              return (
                <div
                  key={ci}
                  style={{
                    height: 44,
                    borderRadius: 5,
                    background: isRisk ? 'transparent' : ink,
                    border: isRisk
                      ? `${1 + Math.round(t * 2)}px solid rgba(15,14,13,${0.18 + t * 0.5})`
                      : '1px solid var(--border-soft)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span className="metric" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg)' }}>{Math.round(val)}</span>
                </div>
              )
            })}
            <span className="muted" style={{ fontSize: 12, lineHeight: 1.45, paddingLeft: 12 }}>{row.note}</span>
          </div>
        ))}
        <div className="lbl" style={{ marginTop: 12 }}>
          {oppRisk.note} <span className="faint">· 기회=채움, 리스크=테두리 강조</span>
        </div>
      </div>

      {objections.length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <div className="lbl-mono" style={{ marginBottom: 16 }}>주요 거부 요인 · 왜 안 사는가</div>
          <div className="col" style={{ gap: 12 }}>
            {objections.map((o) => (
              <div key={o.rank} className="row" style={{ gap: 14 }}>
                <span className="lbl-mono" style={{ width: 18, color: 'var(--fg-faint)' }}>0{o.rank}</span>
                <span style={{ fontSize: 13.5, width: 230, flex: 'none' }}>{o.reason}</span>
                {o.pct > 0 ? (
                  <>
                    <div style={{ flex: 1 }}><Bar pct={o.pct} cls="a" /></div>
                    <span className="metric" style={{ fontWeight: 700, fontSize: 14, width: 42, textAlign: 'right' }}>{o.pct}%</span>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1 }} />
                    <span className="lbl" style={{ fontSize: 11.5, width: 42, textAlign: 'right' }}>정성</span>
                  </>
                )}
              </div>
            ))}
          </div>
          {topObjection && (
            <div className="card card-2" style={{ padding: '12px 15px', marginTop: 16, fontSize: 12.5, lineHeight: 1.6, color: 'var(--fg-dim)' }}>
              1순위 리스크가 <b style={{ color: 'var(--fg)' }}>{topObjection.reason}</b>입니다. 아래 후속 질문에서 이 거절 이유를 코호트별로 더 파고들 수 있습니다.
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function RegionDetailPanel({ region, onClear }: { region: MinsimRegion | null; onClear: () => void }) {
  if (!region) {
    return (
      <div className="region-detail-panel region-detail-empty">
        <div className="col" style={{ gap: 8, alignItems: 'center' }}>
          <span className="lbl-mono">지역 상세</span>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, maxWidth: 240 }}>지도에서 행정구역을 누르면 반응 이유와 실행 액션이 여기에 열립니다.</p>
        </div>
      </div>
    )
  }
  return (
    <div className="region-detail-panel">
      <div className="spread" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="col" style={{ gap: 8 }}>
          <span className="lbl-mono">지역 상세</span>
          <div className="row" style={{ gap: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 19, fontWeight: 700 }}>{region.name}</span>
            <ChoicePill id={region.lead.charAt(0)} on />
          </div>
        </div>
        <div className="row" style={{ gap: 7 }}>
          <span className="region-confidence">신뢰 {region.reliability}</span>
          <button type="button" className="btn ghost sm" onClick={onClear}>초기화</button>
        </div>
      </div>
      <div className="region-metrics">
        <span><span className="lbl-mono">1위안</span><b>{region.lead}</b></span>
        <span><span className="lbl-mono">선호</span><b>{region.pct}</b></span>
        <span><span className="lbl-mono">표본</span><b>{region.n}명</b></span>
      </div>
      <div style={{ marginBottom: 15 }}>
        <div className="lbl-mono" style={{ marginBottom: 7, color: 'var(--lime)' }}>왜 이 지역에서 반응이 높은가</div>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.65 }}>{region.why}</p>
      </div>
      <div>
        <div className="lbl-mono" style={{ marginBottom: 9, color: 'var(--lime)' }}>여기서 시도할 수 있는 실행 액션</div>
        <div className="col" style={{ gap: 7 }}>
          {region.actions.map((action, index) => (
            <div key={index} className="row" style={{ gap: 10, padding: '9px 0', borderTop: index ? '1px solid var(--border-soft)' : 0 }}>
              <span className="lbl-mono" style={{ color: 'var(--lime)', width: 22 }}>0{index + 1}</span>
              <span style={{ fontSize: 13, lineHeight: 1.5 }}>{action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EvidenceSection({ report, onOpen }: { report: MinsimReport; onOpen: (uuid: string, name: string, choice: string, meta: string, body: string) => void }) {
  if (report.quotes.length === 0) return null
  return (
    <section style={{ padding: '40px 0' }}>
      <SectionHead kicker="응답 근거" title="해석 근거 발언" sub="발언 카드를 누르면 그 응답자와 바로 인터뷰를 시작합니다." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {report.quotes.map((quote) => {
          const color = OPT[quote.choice] ?? 'var(--opt-d)'
          return (
            <button
              key={quote.uuid}
              className="card"
              onClick={() => onOpen(quote.uuid, quote.name, quote.choice, quote.meta, quote.q)}
              style={{ padding: 18, textAlign: 'left', cursor: 'pointer', borderLeft: `3px solid ${color}` }}
            >
              <div className="spread" style={{ marginBottom: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{quote.name}</span>
                {quote.choice && <ChoicePill id={quote.choice} on />}
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.65, marginBottom: 12 }}>“{quote.q}”</p>
              <div className="spread">
                <span className="lbl-mono">{quote.meta}</span>
                <span className="lbl" style={{ color: 'var(--lime)' }}>인터뷰 →</span>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function Methodology({ report }: { report: MinsimReport }) {
  const { sampleAge, sampleRegion, run, disclaimer } = report
  const maxAge = Math.max(1, ...sampleAge.map(([, n]) => n))
  const maxReg = Math.max(1, ...sampleRegion.map(([, n]) => n))
  return (
    <section style={{ padding: '40px 0' }}>
      <SectionHead kicker="검증 정보" title="방법론과 신뢰 정보" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="lbl-mono" style={{ marginBottom: 16 }}>표본 구성 · 연령대</div>
          <div className="col" style={{ gap: 9 }}>
            {sampleAge.map(([label, n]) => (
              <div key={label} className="row" style={{ gap: 12 }}>
                <span className="lbl" style={{ width: 52, fontSize: 12 }}>{label}</span>
                <div style={{ flex: 1 }}><Bar pct={(n / maxAge) * 100} /></div>
                <span className="lbl-mono" style={{ width: 40, textAlign: 'right' }}>{n}명</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="lbl-mono" style={{ marginBottom: 16 }}>표본 구성 · 지역 상위</div>
          <div className="col" style={{ gap: 9, marginBottom: 18 }}>
            {sampleRegion.map(([label, n]) => (
              <div key={label} className="row" style={{ gap: 12 }}>
                <span className="lbl" style={{ width: 52, fontSize: 12 }}>{label}</span>
                <div style={{ flex: 1 }}><Bar pct={(n / maxReg) * 100} /></div>
                <span className="lbl-mono" style={{ width: 40, textAlign: 'right' }}>{n}명</span>
              </div>
            ))}
          </div>
          <hr className="hr-d" style={{ margin: '4px 0 14px' }} />
          <div className="lbl-mono" style={{ marginBottom: 8 }}>재현 정보</div>
          <div className="muted" style={{ fontSize: 13 }}>seed {run.seed}{run.ts ? ` · ${run.ts}` : ''}</div>
          <div className="lbl" style={{ marginTop: 8 }}>타깃 조건 · 무직 제외 <span style={{ color: 'var(--fg)' }}>{run.excludeUnemployed ? '예' : '아니오'}</span></div>
        </div>
      </div>
      <div className="card card-2" style={{ padding: '14px 18px', marginTop: 12, fontSize: 12.5, lineHeight: 1.6, color: 'var(--fg-faint)' }}>{disclaimer}</div>
    </section>
  )
}

function Crowd({ report, onOpen }: { report: MinsimReport; onOpen: (uuid: string, name: string, choice: string, meta: string, body: string) => void }) {
  const [filter, setFilter] = useState('all')
  const { crowd, winner } = report
  const winId = winner?.id ?? 'B'
  const filtered = crowd.filter((person) => {
    if (filter === 'all') return true
    if (filter === 'miss') return person.choice !== winId
    return person.choice === filter
  })
  const filters: [string, string][] = [
    ['all', '전체'],
    [winId, `${winId} 선택`],
    ['miss', `${winId} 미선택`],
  ]
  return (
    <section style={{ padding: '40px 0' }}>
      <SectionHead
        kicker="응답자 패널"
        title="군중감"
        right={
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {filters.map(([key, label]) => (
              <span key={key} className={`chip sm${filter === key ? ' on' : ''}`} onClick={() => setFilter(key)} style={{ cursor: 'pointer' }}>
                {label}
              </span>
            ))}
          </div>
        }
      />
      <div className="lbl" style={{ marginBottom: 14 }}>
        대표 {Math.min(21, filtered.length)}명 표시 · 해당 코호트 {filtered.length}명 · 전체 응답 {report.run.panel}명 · <span className="faint">카드를 누르면 인터뷰</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 }}>
        {filtered.slice(0, 21).map((person, index) => {
          const color = OPT[person.choice] ?? 'var(--opt-d)'
          return (
            <button
              key={`${person.name}-${index}`}
              className="card"
              onClick={() => onOpen(`crowd-${index}`, person.name, person.choice, `${person.sex} · ${person.age}세 · ${person.region}`, `${person.occ} · ${person.choice}안 선택`)}
              style={{ padding: 9, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 7, borderLeft: `2px solid ${color}` } as CSSProperties}
            >
              <div className="row" style={{ gap: 7 }}>
                <img src={portraitUrl(person.name + index)} alt={person.name} width={26} height={26} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)', flex: 'none' }} />
                <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.name}</span>
              </div>
              <span className="lbl" style={{ fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.age}세 · {person.choice}안</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function portraitUrl(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  const n = String((hash % 31) + 1).padStart(2, '0')
  return `/landing/portraits/portrait-${n}.png`
}
