import { useEffect, useState } from 'react'
import { CircleCheck, FlaskConical, Folder, LoaderCircle } from 'lucide-react'
import { getProject, listProjectRuns } from '../api/projects'
import { GitHubStarCta } from '../components/GitHubStarCta'
import { SimulationProgress } from '../components/SimulationProgress'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { getSimulationLabel } from '../simulations/registry'
import type { ProjectResponse, RunSnapshot } from '../types/api'
import { navigateTo } from './navigation'
import { terminalRunCopy } from './runTerminalCopy'

const PHASES: [string, number][] = [
  ['페르소나 샘플링', 12],
  ['프롬프트 구성', 26],
  ['응답 생성', 88],
  ['파싱·구조화', 96],
  ['리포트 생성 중', 100],
]

type LoadingState = {
  project: ProjectResponse | null
  run: RunSnapshot | null
  error: string | null
}

export function MinsimLoadingPage({
  projectId,
  runId,
}: {
  projectId: string | null
  runId: string | null
}) {
  const [state, setState] = useState<LoadingState>({ project: null, run: null, error: null })
  const prefersReducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (!projectId || !runId) {
      setState({ project: null, run: null, error: 'project_id와 run_id가 필요합니다.' })
      return
    }

    let active = true
    let timer: number | null = null

    const poll = async () => {
      try {
        const [project, runs] = await Promise.all([getProject(projectId), listProjectRuns(projectId)])
        if (!active) return
        const run = runs.runs.find((item) => item.run.run_id === runId)?.run ?? null
        setState({ project, run, error: run ? null : '프로젝트에서 실행을 찾지 못했습니다.' })
        if (run?.status === 'completed' && run.result_available) {
          window.setTimeout(() => {
            navigateTo(`/results?project_id=${encodeURIComponent(projectId)}&run_id=${encodeURIComponent(runId)}`)
          }, 500)
          return
        }
        if (run?.status === 'failed' || run?.status === 'canceled' || run?.status === 'interrupted') return
        timer = window.setTimeout(poll, 1300)
      } catch (err) {
        if (!active) return
        setState((current) => ({ ...current, error: err instanceof Error ? err.message : String(err) }))
        timer = window.setTimeout(poll, 2200)
      }
    }

    void poll()
    return () => {
      active = false
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [projectId, runId])

  const { project, run } = state
  const status = run?.status ?? 'queued'
  const pct = run ? Math.max(4, Math.min(100, run.progress_pct)) : 4
  const total = run?.total_count || 200
  const done = run ? run.done_count : Math.round((pct / 100) * total)
  const phase = PHASES.find(([, threshold]) => pct < threshold) ?? PHASES[PHASES.length - 1]
  const isReportGenerating = Boolean(run && pct >= 100 && !run.result_available && status !== 'failed' && status !== 'canceled' && status !== 'interrupted')
  const phaseLabel =
    status === 'failed' ? '실행 실패' : isReportGenerating ? '리포트 생성 중' : status === 'completed' ? '완료' : status === 'queued' && !run ? '대기 중' : phase[0]
  const projectName = project?.name ?? '합성 패널'
  const processSteps = [
    { label: '표본 준비', description: `${total.toLocaleString('ko-KR')}명 조건 구성`, done: pct >= 12 },
    { label: '응답 수집', description: `${done.toLocaleString('ko-KR')}명 응답 완료`, done: pct >= 88 },
    { label: '보고서 구성', description: isReportGenerating ? '근거와 세그먼트를 정리하고 있습니다.' : '근거와 세그먼트 정리', done: Boolean(run?.result_available) },
  ]

  if (state.error && !run) {
    return (
      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 80, maxWidth: 860, margin: '0 auto' }}>
        <div className="col" style={{ gap: 8 }}>
          <div className="kicker">실행 준비</div>
          <h1 style={{ fontSize: 28 }}>진행 상태를 불러오지 못했습니다</h1>
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>{state.error}</p>
        </div>
        {projectId && (
          <button
            className="btn ghost sm"
            style={{ marginTop: 16 }}
            onClick={() => navigateTo(`/projects/${encodeURIComponent(projectId)}`)}
          >
            ← 프로젝트
          </button>
        )}
      </div>
    )
  }

  const terminal = status === 'failed' || status === 'canceled' || status === 'interrupted'
  if (run && terminal) {
    const copy = terminalRunCopy(status, run.error)
    return (
      <div className="wrap" style={{ paddingTop: 40, paddingBottom: 80, maxWidth: 860, margin: '0 auto' }}>
        <div className="col" style={{ gap: 8, marginBottom: 24 }}>
          <div className="kicker">실행 상태 · {projectName}</div>
          <h1 style={{ fontSize: 28 }}>{copy.title}</h1>
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            {done.toLocaleString('ko-KR')} / {total.toLocaleString('ko-KR')}명 응답을 수집한 시점의 상태입니다.
          </p>
        </div>

        {project && (
          <div style={{ marginBottom: 16 }}>
            <ProjectBanner project={project} personaPool={run.persona_pool} />
          </div>
        )}

        <section className="card" role="alert" style={{ padding: 24, borderColor: 'var(--lime-line)', marginBottom: 16 }}>
          <div className="lbl-mono" style={{ color: 'var(--lime)', marginBottom: 10 }}>{copy.reasonLabel}</div>
          <p style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.55 }}>{copy.reason}</p>
          {copy.code && <div className="lbl-mono" style={{ marginTop: 12 }}>오류 코드 · {copy.code}</div>}
          {copy.detail && (
            <details style={{ marginTop: 14 }}>
              <summary className="lbl" style={{ cursor: 'pointer' }}>기술 상세 보기</summary>
              <p className="muted" style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.55, overflowWrap: 'anywhere' }}>{copy.detail}</p>
            </details>
          )}
          <p className="muted" style={{ marginTop: 14, fontSize: 13, lineHeight: 1.6 }}>{copy.nextStep}</p>
        </section>

        <div className="card" style={{ padding: 18, marginBottom: 18 }}>
          <div className="spread" style={{ gap: 12, flexWrap: 'wrap' }}>
            <span><span className="lbl-mono">진행률</span> <b>{Math.round(pct)}%</b></span>
            <span><span className="lbl-mono">수집 완료</span> <b>{done.toLocaleString('ko-KR')} / {total.toLocaleString('ko-KR')}명</b></span>
            <span><span className="lbl-mono">실행 ID</span> <b>{run.run_id.slice(0, 8)}</b></span>
          </div>
        </div>

        {projectId && (
          <button className="btn" onClick={() => navigateTo(`/projects/${encodeURIComponent(projectId)}`)}>
            프로젝트로 돌아가기
          </button>
        )}
      </div>
    )
  }

  if (!prefersReducedMotion) {
    return (
      <SimulationProgress
        snapshot={run}
        resultAvailable={Boolean(run?.status === 'completed' && run.result_available)}
        runLabel={`${projectName} · ${run ? getSimulationLabel(run.simulation_type) : '시뮬레이션 준비'}`}
        stageTitle={isReportGenerating ? '리포트를 생성 중입니다.' : `${total.toLocaleString('ko-KR')}명의 합성 페르소나가 응답하는 중`}
        stageBody={isReportGenerating ? '응답을 검토하고 근거와 세그먼트를 정리하고 있습니다.' : `${phaseLabel} · ${done.toLocaleString('ko-KR')} / ${total.toLocaleString('ko-KR')}명 응답 완료`}
        pendingLabel="분석 중"
        completeLabel="결과 보기"
        onComplete={() => {
          if (projectId && runId) {
            navigateTo(`/results?project_id=${encodeURIComponent(projectId)}&run_id=${encodeURIComponent(runId)}`)
          }
        }}
      />
    )
  }

  return (
    <div className="wrap" style={{ paddingTop: 40, paddingBottom: 80, maxWidth: 860, margin: '0 auto' }}>
      <div className="spread" style={{ marginBottom: 26, gap: 12, flexWrap: 'wrap' }}>
        <div className="col" style={{ gap: 8 }}>
          <div className="kicker">실행 중 · {projectName}</div>
          <h1 style={{ fontSize: 28 }}>{isReportGenerating ? '리포트를 생성 중입니다.' : `${total.toLocaleString('ko-KR')}명의 합성 페르소나가 응답하는 중…`}</h1>
        </div>
        <span className="badge live" aria-live="polite">{phaseLabel}</span>
      </div>

      {project && (
        <div style={{ marginBottom: 16 }}>
          <ProjectBanner project={project} personaPool={run?.persona_pool} />
        </div>
      )}

      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <span className="lbl-mono">진행률</span>
          <span className="num-lg" style={{ fontSize: 22, color: 'var(--lime)' }}>
            {Math.round(pct)}%
          </span>
        </div>
        <div
          className="bar"
          style={{ height: 10 }}
          role="progressbar"
          aria-label="시뮬레이션 진행률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-valuetext={`${done} / ${total}명 응답 완료`}
        >
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="spread lbl" style={{ marginTop: 12 }}>
          <span>
            {done} / {total}명 응답 완료
          </span>
        </div>
      </div>

      <div className="minsim-loading-steps" aria-label="처리 단계">
        {processSteps.map((step, index) => {
          const active = !step.done && (index === 0 || processSteps[index - 1].done)
          return (
          <div key={step.label} className={`card minsim-loading-step ${step.done ? 'done' : active ? 'active' : ''}`}>
            {step.done ? <CircleCheck size={22} /> : <LoaderCircle size={22} className={active ? 'minsim-spin' : ''} />}
            <div>
              <strong>{step.label}</strong>
              <span>{step.description}</span>
            </div>
          </div>
          )
        })}
      </div>

      <div className="minsim-loading-github-star">
        <GitHubStarCta variant="card" />
      </div>

      <div className="ph" style={{ minHeight: 120 }} aria-live="polite">
        <div className="col" style={{ gap: 4 }}>
          <span className="ph-tag">리포트를 생성 중입니다.</span>
          <span className="ph-sub">응답을 검토하고 근거와 세그먼트를 정리하고 있습니다.</span>
        </div>
      </div>
    </div>
  )
}

function personaPoolLabel(pool?: string | null): string {
  return pool === 'dgist' ? 'DGIST 구성원' : '전 국민'
}

function ProjectBanner({
  project,
  personaPool,
}: {
  project: ProjectResponse
  personaPool?: string | null
}) {
  const shortName = project.name.split(' ')[0]
  // 여론조사에는 제품·기능·가격 개념이 없다. 0을 나열하면 미완성처럼 보인다.
  // 응답자 라벨은 실제 run.persona_pool을 따른다 (전국민 선택 시 DGIST 고정 금지).
  const chips = project.kind === 'poll'
    ? [`안건 · ${shortName}`, `응답자 ${personaPoolLabel(personaPool)}`]
    : [`제품 · ${shortName}`, `기능 ${project.features.length}`, `가격 ${project.prices.length}`, '타깃 등록됨']
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div className="spread" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 11, minWidth: 0 }}>
          <FlaskConical size={22} aria-hidden="true" />
          <div className="col" style={{ gap: 5, minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <span className="lbl-mono" style={{ color: 'var(--lime)' }}>
                <Folder size={14} aria-hidden="true" /> 프로젝트
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{project.name}</span>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {chips.map((chip) => (
                <span key={chip} className="chip sm" style={{ cursor: 'default', fontSize: 11 }}>
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
