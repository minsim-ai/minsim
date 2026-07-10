import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Download, FolderOpen, MessageSquareText, RefreshCw, Send } from 'lucide-react'
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
import type { V2EvidenceQuote, V2FollowupLogEntry, V2ResultView, V2SegmentMatrix } from './types'

type ResultsState = {
  project: ProjectResponse | null
  run: ProjectRunItem | null
  result: RunResultEnvelope | null
  loading: boolean
  error: string | null
}

export function MinsimResultsPage({
  projectId,
  runId,
}: {
  projectId: string | null
  runId: string | null
}) {
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

  const downloadExport = async () => {
    if (!projectId || !runId) return
    try {
      setActionError(null)
      const report = await getProjectRunExport(projectId, runId)
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
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

  if (state.loading) return <p className="v2-muted">결과를 불러오는 중</p>
  if (state.error) {
    return (
      <section className="v2-empty-state">
        <p className="v2-kicker">Results</p>
        <h1>결과를 열 수 없습니다</h1>
        <p>{state.error}</p>
      </section>
    )
  }
  if (!view) return <p className="v2-muted">결과가 없습니다.</p>

  const projectPath = state.project ? `/projects/${encodeURIComponent(state.project.project_id)}` : '/projects'
  const intakePath = state.project ? `/projects/${encodeURIComponent(state.project.project_id)}/type` : '/projects'

  return (
    <section className="v2-results-page">
      <div className="v2-results-toolbar">
        <button type="button" onClick={() => navigateTo(projectPath)}>
          <FolderOpen size={16} />
          프로젝트
        </button>
        <span>{state.run?.run_label ?? view.simulationLabel}</span>
        <button type="button" onClick={() => navigateTo(intakePath)}>
          <RefreshCw size={16} />
          새 실행
        </button>
        <button type="button" onClick={downloadExport}>
          <Download size={16} />
          내보내기
        </button>
      </div>

      <ResultHero view={view} projectName={state.project?.name ?? 'Project'} />

      <div className="v2-results-grid">
        <CoreCase view={view} />
        <RankPanel view={view} />
      </div>

      <SignalGrid view={view} />
      <SegmentSection matrices={view.segmentMatrices} />
      <EvidenceSection quotes={view.evidenceQuotes} selectedQuote={selectedQuote} onSelect={setSelectedQuote} />

      <div className="v2-results-grid">
        <section className="v2-result-panel">
          <div className="v2-section-title">
            <p className="v2-kicker">Follow-up</p>
            <h2>결과에서 다시 묻기</h2>
          </div>
          <form className="v2-followup-form" onSubmit={submitFollowup}>
            <select value={followupCohort} onChange={(event) => setFollowupCohort(event.target.value)}>
              <option value="all">전체</option>
              <option value="positive">긍정층</option>
              <option value="negative">부정층</option>
              <option value="confused">혼란층</option>
              {view.ranks.slice(0, 4).map((row) => (
                <option key={row.label} value={row.label}>{row.label}</option>
              ))}
            </select>
            <textarea value={followupQuestion} onChange={(event) => setFollowupQuestion(event.target.value)} rows={4} />
            <button type="submit">
              <Send size={16} />
              후속질문
            </button>
          </form>
        </section>

        <section className="v2-result-panel">
          <div className="v2-section-title">
            <p className="v2-kicker">Interview</p>
            <h2>페르소나 인터뷰</h2>
          </div>
          <form className="v2-followup-form" onSubmit={submitInterview}>
            <p className="v2-muted">{selectedQuote ? selectedQuote.label : '발언 카드를 선택하거나 전체에서 1명을 샘플링합니다.'}</p>
            <textarea value={interviewQuestion} onChange={(event) => setInterviewQuestion(event.target.value)} rows={4} />
            <button type="submit">
              <MessageSquareText size={16} />
              인터뷰
            </button>
          </form>
        </section>
      </div>

      {logs.length > 0 && (
        <section className="v2-result-panel">
          <div className="v2-section-title">
            <p className="v2-kicker">Log</p>
            <h2>후속 분석 로그</h2>
          </div>
          <div className="v2-followup-log">
            {logs.map((log) => (
              <article key={log.id}>
                <strong>{log.kind === 'followup' ? '후속질문' : '인터뷰'} · {log.cohort}</strong>
                <p>{log.question}</p>
                <span>{log.summary}</span>
                {log.answers.slice(0, 3).map((answer) => <small key={answer}>{answer}</small>)}
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="v2-results-grid">
        <Methodology view={view} />
        <FeedbackPanel
          feedbackText={feedbackText}
          intendedAction={intendedAction}
          notice={feedbackNotice}
          onFeedbackText={setFeedbackText}
          onIntendedAction={setIntendedAction}
          onSubmit={submitFeedback}
        />
      </div>

      {actionError && <p className="v2-error">{actionError}</p>}
    </section>
  )
}

function ResultHero({ view, projectName }: { view: V2ResultView; projectName: string }) {
  return (
    <section className="v2-result-hero">
      <div>
        <p className="v2-kicker">{projectName} · {view.simulationLabel}</p>
        <h1>{view.headline}</h1>
        <p>{view.conclusion}</p>
      </div>
      <div className="v2-verdict-meter">
        <span>{view.winnerLabel}</span>
        <strong>{view.winnerPct === null ? 'N/A' : `${view.winnerPct}%`}</strong>
        <small>{view.runnerUpLabel ? `${view.runnerUpLabel} 대비 ${view.marginPct ?? 'N/A'}%p` : view.confidenceLabel}</small>
      </div>
    </section>
  )
}

function CoreCase({ view }: { view: V2ResultView }) {
  return (
    <section className="v2-result-panel">
      <div className="v2-section-title">
        <p className="v2-kicker">Core Case</p>
        <h2>핵심 한눈에</h2>
      </div>
      <div className="v2-metric-card-grid">
        {view.cards.map((card) => (
          <article key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
          </article>
        ))}
      </div>
      <div className="v2-confidence-note">
        <strong>{view.confidenceLabel}</strong>
        <p>{view.confidenceBody}</p>
      </div>
    </section>
  )
}

function RankPanel({ view }: { view: V2ResultView }) {
  return (
    <section className="v2-result-panel">
      <div className="v2-section-title">
        <p className="v2-kicker">Ranking</p>
        <h2>반응 순위</h2>
      </div>
      <div className="v2-rank-list">
        {view.ranks.slice(0, 8).map((row, index) => (
          <article key={row.id}>
            <span>{index + 1}</span>
            <div>
              <strong>{row.name}</strong>
              <small>{row.label} · {row.count !== null ? `${row.count}명` : '집계값'} </small>
              <div className="v2-stack-track">
                <b style={{ width: `${Math.max(4, Math.min(100, row.pct ?? row.count ?? 0))}%`, background: row.color }} />
              </div>
            </div>
            <em>{row.pct !== null ? `${row.pct}%` : row.count ?? '-'}</em>
          </article>
        ))}
      </div>
    </section>
  )
}

function SignalGrid({ view }: { view: V2ResultView }) {
  return (
    <div className="v2-signal-grid">
      <SignalPanel kicker="Positive" title="긍정 이유" items={view.positiveSignals} />
      <SignalPanel kicker="Risk" title="거절/주의 신호" items={view.objections} />
      <SignalPanel kicker="Action" title="권장 액션" items={view.recommendations} />
    </div>
  )
}

function SignalPanel({ kicker, title, items }: { kicker: string; title: string; items: string[] }) {
  return (
    <section className="v2-result-panel">
      <div className="v2-section-title">
        <p className="v2-kicker">{kicker}</p>
        <h2>{title}</h2>
      </div>
      <div className="v2-signal-list">
        {(items.length ? items : ['표시할 신호가 아직 없습니다.']).map((item, index) => (
          <p key={`${item}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span>{item}</p>
        ))}
      </div>
    </section>
  )
}

function SegmentSection({ matrices }: { matrices: V2SegmentMatrix[] }) {
  return (
    <section className="v2-result-panel">
      <div className="v2-section-title">
        <p className="v2-kicker">Segments</p>
        <h2>세그먼트 반응 매트릭스</h2>
      </div>
      {matrices.length === 0 ? (
        <p className="v2-muted">시각화 가능한 세그먼트 breakdown이 없습니다.</p>
      ) : (
        <div className="v2-segment-stack">
          {matrices.map((matrix) => (
            <article key={matrix.id} className="v2-segment-card">
              <div className="v2-segment-head">
                <strong>{matrix.label}</strong>
                <span>{matrix.columns.join(' · ')}</span>
              </div>
              {matrix.rows.slice(0, 8).map((row) => (
                <div className="v2-segment-row" key={row.segment}>
                  <span>{row.segment}<small>{row.total}명</small></span>
                  <div className="v2-stack-track">
                    {row.cells.filter((cell) => cell.count > 0).map((cell, index) => (
                      <b
                        key={cell.label}
                        style={{ width: `${Math.max(4, cell.pct)}%`, background: `var(--v2-chart-${(index % 6) + 1})` }}
                        title={`${cell.label}: ${cell.count}명 · ${cell.pct}%`}
                      />
                    ))}
                  </div>
                  <em>{row.cells.filter((cell) => cell.count > 0).map((cell) => `${cell.label} ${cell.pct}%`).join(' · ')}</em>
                </div>
              ))}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function EvidenceSection({
  quotes,
  selectedQuote,
  onSelect,
}: {
  quotes: V2EvidenceQuote[]
  selectedQuote: V2EvidenceQuote | null
  onSelect: (quote: V2EvidenceQuote) => void
}) {
  return (
    <section className="v2-result-panel">
      <div className="v2-section-title">
        <p className="v2-kicker">Evidence</p>
        <h2>해석 근거 발언</h2>
      </div>
      {quotes.length === 0 ? (
        <p className="v2-muted">표시할 발언이 없습니다.</p>
      ) : (
        <div className="v2-evidence-grid">
          {quotes.map((quote) => (
            <button
              className={`v2-evidence-card ${quote.tone}${selectedQuote?.uuid === quote.uuid ? ' selected' : ''}`}
              key={quote.uuid}
              type="button"
              onClick={() => onSelect(quote)}
            >
              <strong>{quote.label}</strong>
              <span>{quote.body}</span>
              <small>{quote.meta}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function Methodology({ view }: { view: V2ResultView }) {
  return (
    <section className="v2-result-panel">
      <div className="v2-section-title">
        <p className="v2-kicker">Trust</p>
        <h2>방법론과 신뢰 정보</h2>
      </div>
      <div className="v2-signal-list">
        {view.methodology.map((item, index) => (
          <p key={item}><span>{String(index + 1).padStart(2, '0')}</span>{item}</p>
        ))}
      </div>
      {view.warnings.length > 0 && <p className="v2-error">{view.warnings.join(' ')}</p>}
    </section>
  )
}

function FeedbackPanel({
  feedbackText,
  intendedAction,
  notice,
  onFeedbackText,
  onIntendedAction,
  onSubmit,
}: {
  feedbackText: string
  intendedAction: string
  notice: string | null
  onFeedbackText: (value: string) => void
  onIntendedAction: (value: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <section className="v2-result-panel">
      <div className="v2-section-title">
        <p className="v2-kicker">Feedback</p>
        <h2>이 결과를 어떻게 쓸 건가요?</h2>
      </div>
      <form className="v2-followup-form" onSubmit={onSubmit}>
        <input value={intendedAction} onChange={(event) => onIntendedAction(event.target.value)} placeholder="예: B안을 기준으로 랜딩페이지 제작" />
        <textarea value={feedbackText} onChange={(event) => onFeedbackText(event.target.value)} rows={4} placeholder="부족했던 점이나 팀 공유 메모" />
        <button type="submit">
          <Send size={16} />
          피드백 저장
        </button>
      </form>
      {notice && <p className="v2-muted">{notice}</p>}
    </section>
  )
}
