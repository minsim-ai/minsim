import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, Download, Folder, Plus } from 'lucide-react'
import { APIError } from '../api/client'
import {
  getProject,
  getProjectRunExport,
  getProjectRunResult,
  listProjectRuns,
  submitProjectRunFeedback,
} from '../api/projects'
import { getRunPartials } from '../api/runs'
import type {
  CampusPolicyMetrics,
  CampusPriorityMetrics,
  OpenSurveyMetrics,
  ProjectResponse,
  ProjectRunItem,
  RunPartialResultsResponse,
  RunResultEnvelope,
} from '../types/api'
import { navigateTo } from './navigation'
import { adaptRunResult } from './resultAdapter'
import { openMinsimReportPdf } from './exportReportPdf'
import { buildMinsimReport, formatShare, type MinsimReport, type MinsimRegion, type TitleBody } from './minsimReport'
import { isFemaleLabel, isMaleLabel, normalizeGenderDisplayLabel } from './personaDisplay'
import { columnExtremes, heatCellStyle } from './heatScale'
import { InteractiveCountryMap } from './KoreaReactionMap'
import { SampleBadge } from './reportPrimitives'
import { ResearchWorkspace } from './ResearchWorkspace'
import { SectionBoundary } from './SectionBoundary'
import { CampusPolicyResult } from './CampusPolicyResult'
import { CampusPriorityResult } from './CampusPriorityResult'
import { OpenSurveyResult } from './OpenSurveyResult'
import { hasDedicatedRenderer } from '../simulations/registry'

const OPT: Record<string, string> = {
  A: 'var(--opt-a)',
  B: 'var(--opt-b)',
  C: 'var(--opt-c)',
  D: 'var(--opt-d)',
  유지: 'var(--segment-retain)',
  관망: 'var(--segment-watch)',
  이탈: 'var(--segment-churn)',
  // startup / price / launch intents — without these StackBar fill is transparent
  구매: 'var(--segment-retain)',
  수용: 'var(--segment-retain)',
  거부: 'var(--segment-churn)',
  거절: 'var(--segment-churn)',
}

const OPT_INK: Record<string, string> = {
  A: 'var(--opt-a-ink)',
  B: 'var(--opt-b-ink)',
  C: 'var(--opt-c-ink)',
  D: 'var(--opt-d-ink)',
  유지: 'var(--segment-retain)',
  관망: 'var(--segment-watch)',
  이탈: 'var(--segment-churn)',
  구매: 'var(--segment-retain)',
  수용: 'var(--segment-retain)',
  거부: 'var(--segment-churn)',
  거절: 'var(--segment-churn)',
}

/** Fallback when outcome id is not in OPT (prevents invisible zero-contrast bars). */
const STACK_FALLBACK = ['#0066FF', '#4D91FF', '#7FB3FF', '#A8C8FF', '#3385FF', '#005EEB']

type ResultsState = {
  project: ProjectResponse | null
  run: ProjectRunItem | null
  result: RunResultEnvelope | null
  loading: boolean
  error: string | null
}

export function MinsimResultsPage({ projectId, runId }: { projectId: string | null; runId: string | null }) {
  const [state, setState] = useState<ResultsState>({ project: null, run: null, result: null, loading: true, error: null })
  const [actionError, setActionError] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState<'feedback' | null>(null)

  /**
   * 제보 폼은 화면 맨 아래에 있고 '제보 보내기'로만 서버에 간다.
   * 상단 툴바 버튼으로 나가면 적던 글이 경고 없이 사라진다.
   */
  const leaveGuard = (path: string) => {
    const unsaved = !feedbackNotice && Boolean(feedbackText.trim())
    if (unsaved && !window.confirm('작성 중인 제보가 저장되지 않았습니다. 저장하지 않고 나갈까요?')) return
    navigateTo(path)
  }

  const [partials, setPartials] = useState<RunPartialResultsResponse | null>(null)

  useEffect(() => {
    if (!projectId || !runId) {
      setState({ project: null, run: null, result: null, loading: false, error: 'project_id와 run_id가 필요합니다.' })
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const [project, runs] = await Promise.all([getProject(projectId), listProjectRuns(projectId)])
        if (cancelled) return
        const run = runs.runs.find((item) => item.run.run_id === runId) ?? null
        try {
          const result = await getProjectRunResult(projectId, runId)
          if (!cancelled) setState({ project, run, result, loading: false, error: null })
        } catch (err) {
          const notReady =
            err instanceof APIError &&
            (err.status === 409 || err.payload?.code === 'RESULT_NOT_READY')
          if (!notReady) throw err
          if (run && (run.run.status === 'queued' || run.run.status === 'running')) {
            navigateTo(
              `/loading?project_id=${encodeURIComponent(projectId)}&run_id=${encodeURIComponent(runId)}`,
            )
            return
          }
          // Terminal run without a stored envelope (legacy failure): recover partials.
          let recovered: RunPartialResultsResponse | null = null
          try {
            recovered = await getRunPartials(runId)
          } catch {
            recovered = null
          }
          if (!cancelled) {
            setPartials(recovered)
            setState({ project, run, result: null, loading: false, error: null })
          }
        }
      } catch (err) {
        if (cancelled) return
        setState({
          project: null,
          run: null,
          result: null,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [projectId, runId])

  const built = useMemo(() => {
    if (!state.result) {
      return { view: null, report: null, buildError: null as string | null }
    }
    try {
      return {
        view: adaptRunResult(state.result),
        report: buildMinsimReport(state.result, { completedAt: state.run?.run.completed_at ?? null }),
        buildError: null as string | null,
      }
    } catch (err) {
      return {
        view: null,
        report: null,
        buildError: err instanceof Error ? err.message : String(err),
      }
    }
  }, [state.result, state.run])
  const { view, report, buildError } = built

  const downloadExport = async () => {
    if (!projectId || !runId) return
    try {
      setActionError(null)
      if (report) {
        openMinsimReportPdf(report, {
          projectName: state.project?.name ?? '프로젝트',
          runLabel: state.run?.run_label ?? report.winner?.text ?? view?.simulationLabel ?? '결과 보고서',
        })
        return
      }
      // Report renderer failed — fall back to structured data export for recovery.
      const exportReport = await getProjectRunExport(projectId, runId)
      const blob = new Blob([JSON.stringify(exportReport, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `minsim-${runId.slice(0, 8)}-report.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  const submitFeedback = async (event: FormEvent) => {
    event.preventDefault()
    if (!projectId || !runId) return
    try {
      setActionError(null)
      setActionPending('feedback')
      await submitProjectRunFeedback(projectId, runId, {
        free_text: feedbackText || null,
        result_expectation: 'bug_or_issue',
      })
      setFeedbackNotice('제보 감사합니다. 확인 후 개선할게요.')
      setFeedbackText('')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setActionPending(null)
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
  if (!projectId || !runId) return <p className="muted" style={{ padding: '48px 0' }}>결과 식별자가 없습니다.</p>

  const projectName = state.project?.name ?? 'Project'
  const projectPath = state.project ? `/projects/${encodeURIComponent(state.project.project_id)}` : '/projects'
  const intakePath = state.project ? `/projects/${encodeURIComponent(state.project.project_id)}/type` : '/projects'

  if (state.result && buildError) {
    return (
      <MinimalReportView
        envelope={state.result}
        buildError={buildError}
        projectPath={projectPath}
        onExport={downloadExport}
      />
    )
  }
  if (!state.result) {
    return (
      <FailedRunView
        run={state.run}
        partials={partials}
        runId={runId}
        projectPath={projectPath}
        intakePath={intakePath}
      />
    )
  }
  if (!report || !view) return <p className="muted" style={{ padding: '48px 0' }}>결과가 없습니다.</p>

  const runLabel = state.run?.run_label ?? view.simulationLabel

  return (
    <div className="report">
      {/* toolbar */}
      <div className="results-toolbar">
        <div className="wrap spread result-toolbar-inner">
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <button className="btn ghost sm" onClick={() => leaveGuard(projectPath)}>
              <ArrowLeft size={15} /> {projectName.split(' ')[0]} 프로젝트
            </button>
            <span style={{ fontWeight: 600 }}>{runLabel}</span>
            <span className="lbl-mono faint"><Folder size={14} /> {projectName}</span>
            <span className="badge live">{view.statusLabel}</span>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <button className="btn ghost sm" onClick={() => leaveGuard(intakePath)}>
              <Plus size={15} /> 새 시뮬레이션
            </button>
            <button className="btn sm" onClick={downloadExport}>
              <Download size={15} /> PDF로 저장
            </button>
          </div>
        </div>
      </div>

      <div className="wrap">
        <nav className="result-section-nav" aria-label="결과 보고서 섹션">
          <a href="#result-summary">요약</a>
          <a href="#result-segments">세그먼트</a>
          <a href="#result-evidence">응답·대화</a>
          <a href="#result-method">방법론</a>
          <a href="#result-final">최종 요약</a>
        </nav>
        <div id="result-summary" />
        <ResultWarnings metrics={state.result?.metrics} />
        <SectionBoundary title="결과 요약"><Verdict report={report} onExport={downloadExport} /></SectionBoundary>
        <SectionBoundary title="핵심 근거"><CoreCase report={report} /></SectionBoundary>
        <SectionBoundary title="핵심 요약"><DecisionSummary report={report} /></SectionBoundary>
        <div id="result-segments" className="result-anchor" />
        {/*
          Dedicated poll renderers already show ranking/stance/options.
          A/B-style radar + metric boards stay empty for those sims — hide them.
        */}
        {!hasDedicatedRenderer(state.result?.simulation_type ?? '') && (
          <SectionBoundary title="세그먼트 반응 레이더"><SegmentRadar report={report} countryId={state.result?.country_id ?? 'kr'} /></SectionBoundary>
        )}
        {state.result?.simulation_type === 'campus_policy' && (
          <SectionBoundary title="정책 찬반 분해">
            <CampusPolicyResult
              metrics={state.result.metrics as unknown as CampusPolicyMetrics}
              runId={runId}
            />
          </SectionBoundary>
        )}
        {state.result?.simulation_type === 'open_survey' && (
          <SectionBoundary title="설문 응답 분해">
            <OpenSurveyResult metrics={state.result.metrics as unknown as OpenSurveyMetrics} />
          </SectionBoundary>
        )}
        {state.result?.simulation_type === 'campus_priority' && (
          <SectionBoundary title="우선순위 분해">
            <CampusPriorityResult
              metrics={state.result.metrics as unknown as CampusPriorityMetrics}
            />
          </SectionBoundary>
        )}
        <SectionBoundary title="AI 해석 보고서"><ResultDisclosure title="AI 해석 보고서"><AiReport report={report} /></ResultDisclosure></SectionBoundary>
        {report.creatives.length > 0 && (
          <SectionBoundary title="주요 지표 해석"><ResultDisclosure title="주요 지표 해석"><MarketResponse report={report} /></ResultDisclosure></SectionBoundary>
        )}
        {report.creatives.length > 0 && report.ageFull.length > 0 && (
          <SectionBoundary title="연령대별 반응 전체표"><ResultDisclosure title="연령대별 반응 전체표"><AgeFullTable report={report} /></ResultDisclosure></SectionBoundary>
        )}
        {!hasDedicatedRenderer(state.result?.simulation_type ?? '') && (
          <SectionBoundary title="기회·리스크 통합 맵"><ResultDisclosure title="기회·리스크 통합 맵"><OpportunityRiskMap report={report} /></ResultDisclosure></SectionBoundary>
        )}
        <SectionBoundary title="응답·대화"><ResearchWorkspace projectId={projectId} runId={runId} report={report} /></SectionBoundary>
        <div id="result-method" />
        <SectionBoundary title="방법론과 신뢰 정보"><ResultDisclosure title="방법론과 신뢰 정보"><Methodology report={report} /></ResultDisclosure></SectionBoundary>
        <div id="result-final" />
        {/* 전용 렌더러가 정확한 표를 그리는데 winner가 없으면 이 카드는 N/A만 겹쳐 보인다. */}
        {!(hasDedicatedRenderer(state.result?.simulation_type ?? '') && !report.winner) && (
          <SectionBoundary title="최종 요약"><FinalSummaryCard report={report} /></SectionBoundary>
        )}

        <hr className="hr" />

        {/* feedback / bug report — reuses existing run feedback API */}
        <section style={{ padding: '40px 0 64px' }}>
          <SectionHead
            kicker="제보"
            title="버그·오류 제보"
            sub="짧게 알려주시면 바로 확인해요."
          />
          <form className="card" style={{ padding: 22 }} onSubmit={submitFeedback}>
            <label className="col" style={{ gap: 6, marginBottom: 16 }}>
              <span className="lbl">어디가 이상했나요?</span>
              <textarea
                className="inp"
                value={feedbackText}
                onChange={(event) => setFeedbackText(event.target.value)}
                rows={4}
                required
                minLength={5}
                placeholder="예) 연령대 표가 비어 보여요 / 지도 숫자가 안 맞아요 / 로딩이 끝나지 않아요 / 버튼이 안 눌려요"
              />
            </label>
            <button className="btn primary block" type="submit" disabled={actionPending !== null || !feedbackText.trim()}>
              {actionPending === 'feedback' ? '보내는 중…' : '제보 보내기'}
            </button>
            {feedbackNotice && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>{feedbackNotice}</p>}
          </form>
        </section>

        {actionError && <p className="muted" style={{ color: 'var(--fg)', paddingBottom: 40 }}>⚠ {actionError}</p>}
      </div>
    </div>
  )
}

function FinalSummaryCard({ report }: { report: MinsimReport }) {
  const summary = report.finalSummary
  if (!summary) return null
  return (
    <section style={{ padding: '40px 0' }}>
      <SectionHead
        kicker="최종 요약"
        title="한 장으로 보는 결론"
        sub="이 카드 한 장이 전체 결과를 대신합니다. 화면 캡처로 공유하세요."
      />
      <div className="card minsim-final-summary-grid" style={{ padding: 24, display: 'grid', gridTemplateColumns: 'minmax(180px, .8fr) 1.2fr', gap: 24 }}>
        <div className="col minsim-final-summary-lead" style={{ gap: 10, borderRight: '1px solid var(--border-soft)', paddingRight: 20 }}>
          <span className="lbl-mono">1위 {report.segment.mode === 'segment' ? '세그먼트' : report.segment.mode === 'price' ? '선호 가격' : '반응'}</span>
          {summary.winner ? (
            <>
              <span style={{ fontSize: 30, fontWeight: 700, color: 'var(--lime)', lineHeight: 1.1 }}>
                {summary.winner.pct}%
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{summary.winner.label}</span>
              <span className="lbl">{formatShare(summary.winner.pct, summary.winner.count, report.run.valid)}</span>
            </>
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>대표 반응 집계 중</span>
          )}
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, marginTop: 6 }}>{summary.verdictLine}</p>
          {report.interest && (
            <div className="col" style={{ gap: 4, marginTop: 4 }}>
              {report.interest.map((row) => (
                <span key={row.label} className="lbl" style={{ fontSize: 11 }}>
                  {row.label} {row.pct}% · {row.count}명
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="col" style={{ gap: 14 }}>
          <div className="col" style={{ gap: 6 }}>
            <span className="lbl-mono">핵심 페인포인트</span>
            {summary.pains.map((item) => (
              <span key={item.title} style={{ fontSize: 13, lineHeight: 1.5 }}>
                · {item.title}{item.body ? <span className="muted"> — {item.body}</span> : null}
              </span>
            ))}
          </div>
          <div className="col" style={{ gap: 6 }}>
            <span className="lbl-mono">추천 액션</span>
            {summary.actions.map((item) => (
              <span key={item.title} style={{ fontSize: 13, lineHeight: 1.5 }}>· {item.title}</span>
            ))}
          </div>
          <div className="col" style={{ gap: 6 }}>
            <span className="lbl-mono">주의할 점</span>
            <span style={{ fontSize: 13, lineHeight: 1.5 }}>· {summary.caution}</span>
          </div>
          <span className="lbl-mono faint" style={{ marginTop: 4 }}>
            minsim · 응답 {report.run.valid}명{report.run.ts ? ` · ${report.run.ts}` : ''}
          </span>
        </div>
      </div>
    </section>
  )
}

function MinimalReportView({
  envelope,
  buildError,
  projectPath,
  onExport,
}: {
  envelope: RunResultEnvelope
  buildError: string
  projectPath: string
  onExport: () => void
}) {
  const metrics = envelope.metrics ?? {}
  return (
    <div className="wrap" style={{ paddingTop: 48, paddingBottom: 64 }}>
      <div className="kicker">Results</div>
      <h1 style={{ fontSize: 26, marginTop: 8 }}>보고서 렌더링에 실패해 원자료 요약을 표시합니다</h1>
      <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
        수치 결과는 안전하게 저장되어 있습니다. 내보내기로 전체 데이터를 확인할 수 있습니다.
      </p>
      <div className="card" style={{ padding: 20, marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="lbl-mono">상태 {envelope.status} · 유효 응답 {envelope.total_responses}명 · 파싱 실패 {envelope.parse_failed}건</span>
        {(envelope.warnings ?? [])
          .filter((warning) => !/합성\s*페르소나|실제\s*시장조사를\s*대체|Nemotron-Personas/i.test(warning))
          .map((warning) => (
            <p key={warning} className="muted" style={{ fontSize: 12.5, margin: 0 }}>· {warning}</p>
          ))}
        <details>
          <summary className="lbl">집계 지표 원본 ({Object.keys(metrics).length}개)</summary>
          <pre style={{ fontSize: 11, overflowX: 'auto', maxHeight: 320 }}>{JSON.stringify(metrics, null, 2)}</pre>
        </details>
        <p className="lbl" style={{ fontSize: 11, margin: 0 }}>렌더링 오류: {buildError}</p>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <button className="btn sm" type="button" onClick={onExport}><Download size={15} /> 데이터 내보내기</button>
          <button className="btn ghost sm" type="button" onClick={() => navigateTo(projectPath)}><ArrowLeft size={15} /> 프로젝트로</button>
        </div>
      </div>
    </div>
  )
}

function FailedRunView({
  run,
  partials,
  runId,
  projectPath,
  intakePath,
}: {
  run: ProjectRunItem | null
  partials: RunPartialResultsResponse | null
  runId: string
  projectPath: string
  intakePath: string
}) {
  const status = run?.run.status ?? 'failed'
  const statusLabel = ({
    queued: '대기 중',
    running: '진행 중',
    completed: '완료',
    failed: '실패',
    canceled: '취소됨',
    interrupted: '중단됨',
  } as Record<string, string>)[status] ?? status
  const done = run?.run.done_count ?? partials?.done_count ?? 0
  const total = run?.run.total_count ?? partials?.total_count ?? 0
  const partialCount = partials?.partial_count ?? partials?.raw_results.length ?? 0

  const downloadPartials = () => {
    if (!partials) return
    const blob = new Blob([JSON.stringify(partials, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `koresim-partials-${runId.slice(0, 8)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="wrap" style={{ paddingTop: 48, paddingBottom: 64 }}>
      <div className="kicker">Results</div>
      <h1 style={{ fontSize: 26, marginTop: 8 }}>이 실행은 결과 보고서를 만들지 못했습니다</h1>
      <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
        상태 {statusLabel} · 진행 {done.toLocaleString('ko-KR')}/{total.toLocaleString('ko-KR')}명
        {partialCount > 0 && ` · 부분 응답 ${partialCount.toLocaleString('ko-KR')}건 복구 가능`}
      </p>
      <div className="card" style={{ padding: 20, marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          {partialCount > 0
            ? '완료된 페르소나 응답은 보존되어 있습니다. 아래에서 내려받거나, 같은 설정으로 다시 실행할 수 있습니다.'
            : '보존된 부분 응답이 없습니다. 같은 설정으로 다시 실행해 주세요.'}
        </p>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          {partialCount > 0 && (
            <button className="btn sm" type="button" onClick={downloadPartials}>
              <Download size={15} /> 부분 응답 JSON
            </button>
          )}
          <button className="btn primary sm" type="button" onClick={() => navigateTo(intakePath)}>
            <Plus size={15} /> 다시 실행
          </button>
          <button className="btn ghost sm" type="button" onClick={() => navigateTo(projectPath)}>
            <ArrowLeft size={15} /> 프로젝트로
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------- atoms --------------------------------- */

function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="kicker">{children}</div>
}

function ResultDisclosure({ title, children }: { title: string; children: React.ReactNode }) {
  const defaultOpen = typeof window === 'undefined' || !window.matchMedia('(max-width: 920px)').matches
  return (
    <details className="result-disclosure" open={defaultOpen || undefined}>
      <summary>{title}<span aria-hidden="true">＋</span></summary>
      <div className="result-disclosure-content">{children}</div>
    </details>
  )
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

function Bar({ pct, cls = '', h = 8, color }: { pct: number; cls?: string; h?: number; color?: string }) {
  return (
    <div className={`bar ${cls}`.trim()} style={{ height: h }}>
      <i style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

function stackColor(id: string, index: number): string {
  return OPT[id] ?? STACK_FALLBACK[index % STACK_FALLBACK.length]
}

function StackBar({ parts, h = 18 }: { parts: [string, number][]; h?: number }) {
  return (
    <div
      className="row minsim-stack-bar"
      style={{ height: h, borderRadius: 5, overflow: 'hidden', background: 'var(--surface-3)', border: '1px solid var(--border-soft)' }}
    >
      {parts.map(([id, pct], index) => (
        <div
          key={`${id}-${index}`}
          style={{
            width: `${Math.max(pct, 0)}%`,
            minWidth: pct > 0 ? 3 : 0,
            height: '100%',
            background: stackColor(id, index),
          }}
          title={`${id} ${pct}%`}
        />
      ))}
    </div>
  )
}

function ChoicePill({ id, label, on = false, suffix = '안' }: { id: string; label?: string; on?: boolean; suffix?: string }) {
  const color = OPT[id] ?? 'var(--opt-d)'
  const ink = OPT_INK[id] ?? '#383A3F'
  return (
    <span className="badge" style={{ background: on ? color : 'transparent', color: on ? 'var(--choice-selected-ink)' : ink, border: `1px solid ${color}`, fontWeight: 700 }}>
      {label ?? `${id}${suffix}`}
    </span>
  )
}

/**
 * 백엔드가 집계 중 발견한 신뢰도 경고를 결과 최상단에 띄운다.
 *
 * 조용히 넘기면 소수 표본으로 만들어진 추천값이 정상 결과처럼 읽힌다.
 * (프로덕션 run 7a6184c8: 200명 중 170명이 후보에 없는 가격을 골랐는데
 *  화면에는 '구매 반응률 77.5%'만 표시됐다.)
 */
function ResultWarnings({ metrics }: { metrics?: Record<string, unknown> | null }) {
  const raw = metrics?.warnings
  const warnings = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []
  if (warnings.length === 0) return null

  return (
    <div className="card" style={{ padding: 18, borderColor: 'var(--danger-line, var(--border-strong))' }}>
      <div className="lbl-mono" style={{ marginBottom: 8 }}>결과 해석 주의</div>
      {warnings.map((warning) => (
        <p key={warning} style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>{warning}</p>
      ))}
    </div>
  )
}

function RatioBar({ parts }: { parts: [string, number][] }) {
  const total = parts.reduce((sum, part) => sum + (part[1] || 0), 0) || 1
  const inks = ['#4A7FE8', '#7FB3FF', '#B8D4F5']
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
  const { run, winner, runnerUp, segment } = report
  if (!winner) return null
  const isIntentReport = segment.mode === 'intent'
  const isPriceReport = segment.mode === 'price'
  const metrics = [
    { l: '응답 표본', v: `${run.panel.toLocaleString('ko-KR')}명`, s: `유효 응답 ${run.valid.toLocaleString('ko-KR')}명` },
    isIntentReport || isPriceReport
      ? { l: segment.metricLabel, v: `${segment.overallPct}%`, s: `전체 합성 패널 중 ${segment.focusLabel}` }
      : { l: '선호 격차', v: run.gap, s: runnerUp ? `1위−2위 (${winner.id}−${runnerUp.id})` : '1위 기준' },
    { l: '해석 상태', v: run.status, s: `응답 정리 성공 ${run.structured}` },
  ]
  const reportKicker = isPriceReport
    ? '가격 수용도 보고서'
    : isIntentReport
      ? '행동 의향 예측 보고서'
      : run.gap === '집계 중'
        ? '분석 보고서'
        : '크리에이티브 비교 분석 보고서'
  return (
    <section style={{ paddingTop: 30, paddingBottom: 34 }}>
      <div className="spread" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <Kicker>{reportKicker}</Kicker>
      </div>
      <div className="result-verdict-grid">
        <div className="col" style={{ gap: 22 }}>
          <div>
            <span className="badge lime" style={{ marginBottom: 16 }}>{isIntentReport || isPriceReport ? '핵심 관측' : '먼저 선택'} · {winner.label}</span>
            <h1 style={{ fontSize: 'clamp(24px, 6.2vw, 38px)', lineHeight: 1.18, marginTop: 14, letterSpacing: '-.025em', fontWeight: 600 }}>{winner.text}</h1>
            <p className="muted" style={{ fontSize: 15, lineHeight: 1.65, marginTop: 16, maxWidth: 640 }}>
              {run.verdictLine} {run.conclusion}
            </p>
          </div>
          <div className="result-metrics-grid" style={{ background: 'var(--border-soft)', border: '1px solid var(--border-soft)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
            {metrics.map((metric) => (
              <div key={metric.l} style={{ background: 'var(--bg)', padding: '18px' }}>
                <div className="lbl-mono" style={{ marginBottom: 10 }}>{metric.l}</div>
                <div className="num-lg" style={{ fontSize: 24 }}>{metric.v}</div>
                <div className="lbl" style={{ marginTop: 8 }}>{metric.s}</div>
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <button className="btn" onClick={onExport}>보고서 PDF로 저장</button>
          </div>
        </div>
        <div className="col" style={{ gap: 12 }}>
          {[
            { t: '최종 판단', v: run.status, d: '전체 방향성은 읽을 수 있고, 큰 세그먼트 차이는 보조 근거로 사용합니다.', accent: false, foot: '' },
            { t: '1위 항목', v: formatShare(winner.pct, winner.count, report.run.valid), d: winner.text, accent: true, foot: '' },
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
  const showObservedRatios = Boolean(sentiment || intent)
  return (
    <section style={{ padding: '32px 0 8px' }}>
      <SectionHead kicker="핵심 한눈에" title="코어 케이스" sub="페르소나를 다 펼치기 전에, 의사결정에 필요한 6가지만 먼저 봅니다." />
      <div className="card" style={{ padding: 22, borderColor: 'var(--lime-line)', marginBottom: 12 }}>
        <div className="lbl-mono" style={{ marginBottom: 10, color: 'var(--lime)' }}>한 줄 결론</div>
        <div style={{ fontWeight: 600, fontSize: 17, lineHeight: 1.5 }}>{core.conclusion}</div>
      </div>
      {showObservedRatios ? (
      <div style={{ display: 'grid', gridTemplateColumns: sentiment && intent ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 12 }}>
        {sentiment ? (
        <div className="card" style={{ padding: 20 }}>
          <div className="lbl-mono" style={{ marginBottom: 14 }}>긍정 · 중립 · 부정 비율 <span className="faint">· 직접 관측</span></div>
          <RatioBar parts={[['긍정', sentiment.pos], ['중립', sentiment.neu], ['부정', sentiment.neg]]} />
        </div>
        ) : null}
        {intent ? (
        <div className="card" style={{ padding: 20 }}>
          <div className="lbl-mono" style={{ marginBottom: 14 }}>
            {intent.title} <span className="faint">· 직접 관측</span>
          </div>
          <RatioBar parts={intent.parts} />
          {intent.counted < intent.total && (
            <p className="lbl faint" style={{ marginTop: 8, fontSize: 11 }}>
              분류 가능한 응답 {intent.counted}건 기준 (전체 {intent.total}건)
            </p>
          )}
        </div>
        ) : null}
      </div>
      ) : null}
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
      <div className="minsim-ai-report-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, alignItems: 'start' }}>
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
  const mode = report.segment.mode
  const distributionLabel = mode === 'intent'
    ? '행동 의향'
    : mode === 'segment'
      ? '세그먼트 점유'
      : mode === 'price'
        ? '선호 가격'
        : '선호도'
  // A/B preference board — not applicable when there are no creatives/choices.
  if (creatives.length === 0) return null
  return (
    <section style={{ padding: '40px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 40 }}>
        <div>
          <SectionHead kicker="시장 반응" title="주요 지표 해석" sub="퍼센트 옆 ±는 같은 조건으로 다시 실행했을 때의 변동 폭입니다." />
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
                  <div className="lbl-mono">{distributionLabel} 분포 · {creative.label} · {creative.count}명 · 변동 폭 ±{creative.band}%p</div>
                  <Bar pct={creative.pct} cls={creative.id.toLowerCase()} color={creative.color} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SectionHead kicker="인사이트" title="자동 추출" />
          {winner && (
            <div className="card" style={{ padding: 18, marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
                {mode === 'segment'
                  ? `이름 있는 세그먼트 1위: ${winner.label}`
                  : mode === 'price'
                    ? `선호 가격 1위: ${winner.label}`
                    : `${winner.label}이 가장 많이 ${mode === 'intent' ? '관측됐습니다' : '선택됐습니다'}`}
              </div>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
                {mode === 'segment'
                  ? `${winner.label} 세그먼트가 ${winner.count}명(${winner.pct}%)으로 1순위 타깃 후보입니다.`
                  : mode === 'price'
                    ? `${winner.label}을 ${winner.count}명(${winner.pct}%)이 가장 선호했습니다. 가격대별 누적 수요 곡선과 함께 해석하세요.`
                    : `${winner.label}이 ${winner.count}명(${winner.pct}%)에게서 ${mode === 'intent' ? '나타나 가장 큰 행동 의향 집단입니다.' : '선택돼 가장 강한 반응을 얻었습니다.'}`}
                {runnerUp ? ` 다음 ${runnerUp.label}(${runnerUp.count}명·${runnerUp.pct}%)보다 ${report.run.gap} 높습니다.` : ''}
                {mode === 'segment' && report.creatives.some((item) => item.id === '기타')
                  ? ' ‘기타 롱테일(잔여)’은 상위 세그먼트 밖 라벨 합이며 타깃으로 해석하지 않습니다.'
                  : ''}
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
  if (ageFull.length === 0 || creatives.length === 0) return null
  const sortedLegend = [...creatives].sort((a, b) => a.id.localeCompare(b.id))
  const legend = sortedLegend.slice(0, 9)
  const hiddenColumns = sortedLegend.length - legend.length
  const mode = report.segment.mode
  const titleNoun = mode === 'intent' ? '반응' : mode === 'segment' ? '세그먼트 점유' : mode === 'price' ? '선호 가격' : '선호'
  const cellNoun = mode === 'intent' ? '행동 의향' : mode === 'segment' ? '세그먼트 점유' : mode === 'price' ? '선호 가격' : '후보의 선택'
  const gridTemplate = `minmax(72px, 1.2fr) repeat(${legend.length}, minmax(54px, .85fr)) minmax(52px, .75fr)`
  return (
    <section style={{ padding: '40px 0' }}>
      <SectionHead
        kicker="연령 분포"
        title={`연령대별 ${titleNoun} — 전체`}
        sub={`색이 진할수록 해당 ${cellNoun} 비율이 높습니다. 굵은 숫자가 연령대별 1위이며, n이 작은 집단은 참고용으로만 해석합니다.`}
      />
      <div className="row" style={{ gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        {legend.map((creative) => (
          <span key={creative.id} className="row lbl" style={{ gap: 6, fontSize: 12, whiteSpace: 'nowrap' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: creative.color, flex: 'none' }} />
            <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{creative.label}</span>
          </span>
        ))}
        {hiddenColumns > 0 && <span className="lbl faint" style={{ fontSize: 11 }}>+{hiddenColumns}개 더 (표에서 생략)</span>}
      </div>
      <div className="card result-table-scroll" style={{ padding: 20 }}>
        <div className="result-age-table" style={{ minWidth: Math.max(520, 120 + legend.length * 88) }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: 12, alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <span className="lbl-mono">연령</span>
          {legend.map((creative) => (
            <span
              key={creative.id}
              className="lbl-mono"
              style={{ textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={creative.label}
            >
              {creative.label}
            </span>
          ))}
          <span className="lbl-mono" style={{ textAlign: 'right' }}>표본</span>
        </div>
        {ageFull.map((row) => (
          <div key={row.label} style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: 12, alignItems: 'center', padding: '13px 0', borderTop: '1px solid var(--border-soft)' }}>
            <span className="col" style={{ gap: 2 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{row.label}</span>
              <SampleBadge n={row.n} />
            </span>
            {row.pct ? (
              legend.map((creative) => (
                <span
                  key={creative.id}
                  className="metric"
                  style={{
                    textAlign: 'right',
                    padding: '8px 6px',
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: row.lead === creative.id ? 700 : 500,
                    color: row.lead === creative.id ? 'var(--fg)' : 'var(--fg-faint)',
                    ...heatCellStyle(row.pct?.[creative.id] ?? 0, { colorVar: creative.color }),
                  }}
                  aria-label={`${row.label} ${creative.label} ${row.pct?.[creative.id] ?? 0}% (${row.n}명 중 ${Math.round(((row.pct?.[creative.id] ?? 0) / 100) * row.n)}명)`}
                  title={`${row.n}명 중 ${Math.round(((row.pct?.[creative.id] ?? 0) / 100) * row.n)}명`}
                >
                  {row.pct?.[creative.id] ?? 0}%
                </span>
              ))
            ) : (
              <span style={{ gridColumn: `2 / ${legend.length + 2}`, textAlign: 'center' }} className="lbl">응답 없음</span>
            )}
            <span className="lbl-mono" style={{ textAlign: 'right', fontSize: 11 }}>{row.n}명</span>
          </div>
        ))}
        </div>
      </div>
    </section>
  )
}

function SegmentRadar({ report, countryId = 'kr' }: { report: MinsimReport; countryId?: string }) {
  const { gender, regions, creatives, segment } = report
  const [region, setRegion] = useState<MinsimRegion | null>(() => pickReliableRegion(regions))
  const [sortBy, setSortBy] = useState<'confidence' | 'rate' | 'sample'>('confidence')
  const legend = [...creatives].sort((a, b) => a.id.localeCompare(b.id))
  const totalRegionN = regions.reduce((sum, item) => sum + item.n, 0)
  const sortedRegions = [...regions].sort((a, b) => {
    if (sortBy === 'rate') return b.focusPct - a.focusPct || b.n - a.n
    if (sortBy === 'sample') return b.n - a.n || b.focusPct - a.focusPct
    return b.reliabilityRank - a.reliabilityRank || b.n - a.n || b.focusPct - a.focusPct
  })
  const observedHighest = [...regions].sort((a, b) => b.focusPct - a.focusPct || b.n - a.n)[0] ?? null
  const reliableHighest = pickReliableRegion(regions)
  const female = gender.find((item) => isFemaleLabel(item.g)) ?? null
  const male = gender.find((item) => isMaleLabel(item.g)) ?? null
  const genderTotal = gender.reduce((sum, item) => sum + item.n, 0)
  const genderCoverage = female && male
    ? `여성 ${female.n}명 · 남성 ${male.n}명`
    : female
      ? `여성 ${female.n}명 · 남성 0명`
      : male
        ? `여성 0명 · 남성 ${male.n}명`
        : '성별 정보 없음'
  const kpiLabel = segment.focusId === '이탈' ? '전체 이탈률' : `전체 ${segment.metricLabel}`
  const mapLegend = legend.map((item) => ({ id: item.id, label: item.label, color: item.color }))

  if (regions.length === 0 && gender.length === 0) return null

  return (
    <section className="segment-radar" aria-label="세그먼트 반응 레이더">
      <SectionHead
        kicker="세그먼트 분석"
        title="세그먼트 반응 레이더"
        sub="높은 비율과 높은 신뢰도를 분리해, 어디를 먼저 확인해야 하는지 보여줍니다."
        right={regions.length > 0 ? (
          <label className="segment-sort">
            <span>지역 정렬</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}>
              <option value="confidence">신뢰 우선</option>
              <option value="rate">{segment.metricLabel} 순</option>
              <option value="sample">표본 순</option>
            </select>
          </label>
        ) : null}
      />

      <div className="segment-kpi-strip" aria-label="세그먼트 핵심 지표">
        <article>
          <span>{kpiLabel}</span>
          <strong>{segment.overallPct}%</strong>
          <small>합성 패널 전체</small>
        </article>
        <article>
          <span>신뢰 가능한 주의 지역</span>
          <strong>{reliableHighest ? `${reliableHighest.name} ${reliableHighest.focusPct}%` : '표본 보완 필요'}</strong>
          <small>{reliableHighest ? `${reliableHighest.n}명 · 신뢰 ${reliableHighest.reliability}` : '30명 이상 지역 없음'}</small>
        </article>
        <article className={observedHighest && observedHighest.n < 10 ? 'is-reference' : ''}>
          <span>관측 최고</span>
          <strong>{observedHighest ? `${observedHighest.name} ${observedHighest.focusPct}%` : '—'}</strong>
          <small>{observedHighest ? `${observedHighest.n}명 · ${observedHighest.n < 10 ? '소표본 참고' : `신뢰 ${observedHighest.reliability}`}` : '지역 정보 없음'}</small>
        </article>
        <article className={!female || !male ? 'is-reference' : ''}>
          <span>성별 표본 범위</span>
          <strong>{genderTotal.toLocaleString('ko-KR')}명</strong>
          <small>{genderCoverage}{!female || !male ? ' · 성별 비교 불가' : ''}</small>
        </article>
      </div>

      {regions.length > 0 && (
        <div className="region-map-layout">
          <div className="card region-map-card">
            <div className="spread" style={{ marginBottom: 14, gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="col" style={{ gap: 3, minWidth: 0 }}>
                <div className="lbl-mono">지역 반응 지도 · 지역을 누르면 상세</div>
                <span className="muted" style={{ fontSize: 12.5 }}>색은 대표 반응, 진하기는 {segment.metricLabel}, 배지는 표본 신뢰도를 뜻합니다.</span>
              </div>
              <span className="region-confidence">{regions.length}개 행정구역</span>
            </div>
            <InteractiveCountryMap
              regions={regions}
              selectedRegion={region}
              onSelect={setRegion}
              legend={mapLegend}
              metricLabel={segment.metricLabel}
              countryId={countryId}
            />
          </div>
          <div className="card region-side-card">
            <RegionDetailPanel region={region} metricLabel={segment.metricLabel} onClear={() => setRegion(null)} />
            <div className="region-list-head">
              <span className="lbl-mono">지역 반응 순위</span>
              <span className="lbl">총 {totalRegionN}명</span>
            </div>
            <div className="region-list-scroll" role="list" aria-label={`지역별 ${segment.metricLabel} 순위`}>
              {sortedRegions.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className={`region-list-button spread${region && region.name === item.name ? ' on' : ''}`}
                  onClick={() => setRegion(item)}
                  role="listitem"
                >
                  <div className="col" style={{ gap: 3 }}>
                    <span className="row" style={{ gap: 7 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</span>
                      <ChoicePill id={item.leadId} label={item.lead} on={Boolean(region && region.name === item.name)} />
                    </span>
                    <span className="lbl-mono">{segment.metricLabel} {item.focusPct}% · 신뢰 {item.reliability}</span>
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
        <div className="segment-gender-block">
          <div className="spread segment-subhead">
            <div>
              <span className="lbl-mono">성별 반응</span>
              <p>지역과 별도로 집계된 성별 분포입니다.</p>
            </div>
            {(!female || !male) && <span className="segment-coverage-warning">한쪽 표본 없음 · 비교 불가</span>}
          </div>
          <div className="segment-gender-grid">
            {gender.map((item) => (
              <article key={item.g} className="card segment-gender-card">
                <div className="spread" style={{ gap: 12, marginBottom: 12 }}>
                  <div className="col">
                    <span style={{ fontWeight: 650, fontSize: 15 }}>{normalizeGenderLabel(item.g)}</span>
                    <span className="lbl">{item.n}명 · 대표 반응 {item.lead} {item.pct}</span>
                    <SampleBadge n={item.n} />
                  </div>
                  <ChoicePill id={item.leadId} label={item.lead} />
                </div>
                <StackBar parts={item.parts} h={14} />
              </article>
            ))}
            {!female && <GenderEmpty label="여성" />}
            {!male && <GenderEmpty label="남성" />}
          </div>
        </div>
      )}
    </section>
  )
}

function GenderEmpty({ label }: { label: string }) {
  return (
    <article className="card segment-gender-card is-empty">
      <div className="col" style={{ gap: 5 }}>
        <span style={{ fontWeight: 650, fontSize: 15 }}>{label}</span>
        <span className="lbl">0명 · 이번 표본에서 관측되지 않음</span>
      </div>
      <div className="segment-empty-bar" aria-hidden="true" />
    </article>
  )
}

function pickReliableRegion(regions: MinsimRegion[]): MinsimRegion | null {
  return [...regions]
    .filter((item) => item.n >= 30)
    .sort((a, b) => b.focusPct - a.focusPct || b.n - a.n)[0] ?? null
}

function normalizeGenderLabel(label: string): string {
  return normalizeGenderDisplayLabel(label)
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

      <div
        aria-label="기회와 리스크 세부 데이터"
        className="minsim-wide-data-region minsim-opportunity-scroll"
        role="region"
        tabIndex={0}
      >
        <p className="minsim-wide-data-cue">표를 좌우로 밀어 세부 값을 확인하세요.</p>
        <div className="card minsim-opportunity-card" style={{ padding: 20, marginBottom: 12 }}>
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

        {(() => {
          const extremes = columnExtremes(oppRisk.rows.map((row) => row.v))
          const multiRow = oppRisk.rows.length > 1
          return oppRisk.rows.map((row) => (
            <div key={row.seg} style={{ display: 'grid', gridTemplateColumns: grid, gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <span className="col" style={{ gap: 2 }}>
                <span className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
                  {row.seg}
                  {row.sweet && <span style={{ color: 'var(--lime)' }}>★</span>}
                </span>
                <span className="lbl-mono faint" style={{ fontSize: 10 }}>n={row.n}</span>
                <SampleBadge n={row.n} />
              </span>
              {row.v.map((val, ci) => {
                const isRisk = cols[ci].dir === 'down'
                const isExtreme =
                  multiRow &&
                  (Math.round(val) === Math.round(extremes.max[ci]) ||
                    Math.round(val) === Math.round(extremes.min[ci]))
                return (
                  <div
                    key={ci}
                    style={{
                      height: 44,
                      borderRadius: 5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      ...heatCellStyle(val, { kind: isRisk ? 'risk' : 'opportunity' }),
                    }}
                  >
                    <span
                      className="metric"
                      style={{ fontSize: 14.5, fontWeight: isExtreme ? 700 : 500, color: 'var(--fg)' }}
                    >
                      {Math.round(val)}
                    </span>
                  </div>
                )
              })}
              <span className="col" style={{ paddingLeft: 12, gap: 3 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg)' }}>
                  {row.verdict.label}
                  <span className="lbl-mono faint" style={{ marginLeft: 6, fontSize: 9.5 }}>
                    {row.verdict.source === 'agent' ? 'AI 판정' : '휴리스틱'}
                  </span>
                </span>
                <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.4 }}>{row.verdict.rationale}</span>
              </span>
            </div>
          ))
        })()}
        <div className="lbl" style={{ marginTop: 12 }}>
          {oppRisk.note} <span className="faint">· 색이 진할수록 값이 큽니다 · 굵은 숫자 = 열별 최고/최저</span>
        </div>
        </div>
      </div>

      {objections.length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <div className="lbl-mono" style={{ marginBottom: 16 }}>주요 거부 요인 · 왜 안 사는가</div>
          <div className="col" style={{ gap: 12 }}>
            {objections.map((o) => (
              <div key={o.rank} className="row minsim-objection-row" style={{ gap: 14 }}>
                <span className="lbl-mono" style={{ width: 18, color: 'var(--fg-faint)' }}>0{o.rank}</span>
                <span className="minsim-objection-label" style={{ fontSize: 13.5, width: 230, flex: 'none' }}>{o.reason}</span>
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

function RegionDetailPanel({
  region,
  metricLabel,
  onClear,
}: {
  region: MinsimRegion | null
  metricLabel: string
  onClear: () => void
}) {
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
            <ChoicePill id={region.leadId} label={region.lead} on />
          </div>
        </div>
        <div className="row" style={{ gap: 7 }}>
          <span className="region-confidence">신뢰 {region.reliability}</span>
          <button type="button" className="btn ghost sm" onClick={onClear}>초기화</button>
        </div>
      </div>
      <div className="region-metrics">
        <span><span className="lbl-mono">대표 반응</span><b>{region.lead}</b></span>
        <span><span className="lbl-mono">{metricLabel}</span><b>{region.focusPct}%</b></span>
        <span><span className="lbl-mono">전체 대비</span><b>{region.deltaPoint >= 0 ? '+' : ''}{region.deltaPoint}pt</b></span>
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

function Methodology({ report }: { report: MinsimReport }) {
  const { sampleAge, sampleRegion, run } = report
  const maxReg = Math.max(1, ...sampleRegion.map(([, n]) => n))
  const totalAge = sampleAge.reduce((sum, [, n]) => sum + n, 0)
  // Stack segments need explicit height — `.row` uses align-items:center so
  // empty width-only spans collapse to 0px and leave a blank white track.
  const ageParts: [string, number][] = sampleAge.map(([label, n]) => [
    label,
    totalAge > 0 ? (n / totalAge) * 100 : 0,
  ])
  const ageAria = sampleAge
    .map(([label, n]) => {
      const pct = totalAge > 0 ? Math.round((n / totalAge) * 100) : 0
      return `${label} ${pct}% (${n}명)`
    })
    .join(', ')
  return (
    <section style={{ padding: '40px 0' }}>
      <SectionHead kicker="검증 정보" title="방법론과 신뢰 정보" />
      <div className="result-method-grid">
        <div className="card" style={{ padding: 20 }}>
          <div className="lbl-mono" style={{ marginBottom: 16 }}>표본 구성 · 연령대</div>
          <div
            className="minsim-sample-age-track"
            role="img"
            aria-label={`연령대별 표본 구성: ${ageAria}`}
          >
            {ageParts.map(([label, pct], index) => (
              <div
                key={label}
                className="minsim-sample-age-seg"
                title={`${label} ${Math.round(pct)}%`}
                style={{
                  width: `${Math.max(pct, 0)}%`,
                  minWidth: pct > 0 ? 3 : 0,
                  background: STACK_FALLBACK[index % STACK_FALLBACK.length],
                }}
              />
            ))}
          </div>
          <div className="minsim-sample-age-legend" role="list">
            {sampleAge.map(([label, n], index) => {
              const pct = totalAge > 0 ? Math.round((n / totalAge) * 100) : 0
              return (
                <span key={label} className="minsim-sample-age-legend-item" role="listitem">
                  <i
                    aria-hidden="true"
                    style={{ background: STACK_FALLBACK[index % STACK_FALLBACK.length] }}
                  />
                  <span>
                    {label}{' '}
                    <b>{pct}%</b>
                    <span className="faint"> · {n}명{n < 10 ? ' · 참고' : ''}</span>
                  </span>
                </span>
              )
            })}
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
          {run.ts ? (
            <>
              <div className="lbl-mono" style={{ marginBottom: 8 }}>실행 일시</div>
              <div className="muted" style={{ fontSize: 13 }}>{run.ts}</div>
            </>
          ) : null}
          <div className="lbl" style={{ marginTop: run.ts ? 8 : 0 }}>타깃 조건 · 무직 제외 <span style={{ color: 'var(--fg)' }}>{run.excludeUnemployed ? '예' : '아니오'}</span></div>
        </div>
      </div>
    </section>
  )
}
