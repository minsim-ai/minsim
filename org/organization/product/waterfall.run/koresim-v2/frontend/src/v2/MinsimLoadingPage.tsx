import { useEffect, useState } from 'react'
import { CheckCircle, Flask, FolderSimple, SpinnerGap } from '@phosphor-icons/react'
import { getProject, listProjectRuns } from '../api/projects'
import { SimulationProgress } from '../components/SimulationProgress'
import { getSimulationLabel } from '../simulations/registry'
import type { ProjectResponse, RunSnapshot } from '../types/api'
import { navigateTo } from './navigation'

const PHASES: [string, number][] = [
  ['페르소나 샘플링', 12],
  ['프롬프트 구성', 26],
  ['응답 생성', 88],
  ['파싱·구조화', 96],
  ['리포트 초안', 100],
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
  const phaseLabel =
    status === 'failed' ? '실행 실패' : status === 'completed' ? '완료' : status === 'queued' && !run ? '대기 중' : phase[0]
  const eta = run?.eta_seconds != null ? Math.max(1, Math.round(run.eta_seconds)) : null
  const projectName = project?.name ?? '합성 패널'
  const processSteps = [
    { label: '표본 준비', description: `${total.toLocaleString('ko-KR')}명 조건 구성`, done: pct >= 12 },
    { label: '응답 수집', description: `${done.toLocaleString('ko-KR')}명 응답 완료`, done: pct >= 88 },
    { label: '보고서 구성', description: '근거와 세그먼트 정리', done: pct >= 100 },
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

  if (!prefersReducedMotion && status !== 'failed' && status !== 'canceled' && status !== 'interrupted') {
    return (
      <SimulationProgress
        snapshot={run}
        resultAvailable={Boolean(run?.status === 'completed' && run.result_available)}
        runLabel={`${projectName} · ${run ? getSimulationLabel(run.simulation_type) : '시뮬레이션 준비'}`}
        stageTitle={`${total.toLocaleString('ko-KR')}명의 합성 페르소나가 응답하는 중`}
        stageBody={`${phaseLabel} · ${done.toLocaleString('ko-KR')} / ${total.toLocaleString('ko-KR')}명 응답 완료${eta === null ? '' : ` · 예상 잔여 약 ${eta}초`}`}
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
          <h1 style={{ fontSize: 28 }}>{total.toLocaleString('ko-KR')}명의 합성 페르소나가 응답하는 중…</h1>
        </div>
        <span className="badge live" aria-live="polite">{phaseLabel}</span>
      </div>

      {project && (
        <div style={{ marginBottom: 16 }}>
          <ProjectBanner project={project} />
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
          <span>{eta === null ? '완료 시간 계산 중' : `예상 잔여 약 ${eta}초`}</span>
        </div>
      </div>

      <div className="minsim-loading-steps" aria-label="처리 단계">
        {processSteps.map((step, index) => {
          const active = !step.done && (index === 0 || processSteps[index - 1].done)
          return (
          <div key={step.label} className={`card minsim-loading-step ${step.done ? 'done' : active ? 'active' : ''}`}>
            {step.done ? <CheckCircle size={22} weight="fill" /> : <SpinnerGap size={22} className={active ? 'minsim-spin' : ''} />}
            <div>
              <strong>{step.label}</strong>
              <span>{step.description}</span>
            </div>
          </div>
          )
        })}
      </div>

      <div className="ph" style={{ minHeight: 120 }} aria-live="polite">
        <div className="col" style={{ gap: 4 }}>
          <span className="ph-tag">실행 상태 보존 중</span>
          <span className="ph-sub">확정되지 않은 선택 비율은 표시하지 않습니다. 완료 후 근거와 함께 결과를 제공합니다.</span>
        </div>
      </div>
      <div className="lbl" style={{ marginTop: 16, textAlign: 'center' }}>
        새로고침해도 run_id로 마지막 상태가 복원됩니다.
      </div>
    </div>
  )
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ))

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return reduced
}

function ProjectBanner({ project }: { project: ProjectResponse }) {
  const shortName = project.name.split(' ')[0]
  const chips = [`제품 · ${shortName}`, `기능 ${project.features.length}`, `가격 ${project.prices.length}`, '타깃 등록됨']
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div className="spread" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 11, minWidth: 0 }}>
          <Flask size={22} weight="duotone" aria-hidden="true" />
          <div className="col" style={{ gap: 5, minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <span className="lbl-mono" style={{ color: 'var(--lime)' }}>
                <FolderSimple size={14} aria-hidden="true" /> 프로젝트
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
