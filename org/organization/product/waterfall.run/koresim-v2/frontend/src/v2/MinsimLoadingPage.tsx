import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { listProjectRuns, getProject } from '../api/projects'
import type { ProjectResponse, ProjectRunItem } from '../types/api'
import { navigateTo } from './navigation'

type LoadingState = {
  project: ProjectResponse | null
  run: ProjectRunItem | null
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
        const run = runs.runs.find((item) => item.run.run_id === runId) ?? null
        setState({ project, run, error: run ? null : '프로젝트에서 실행을 찾지 못했습니다.' })
        if (run?.run.status === 'completed' && run.run.result_available) {
          window.setTimeout(() => {
            navigateTo(`/results?project_id=${encodeURIComponent(projectId)}&run_id=${encodeURIComponent(runId)}`)
          }, 450)
          return
        }
        if (run?.run.status === 'failed' || run?.run.status === 'canceled' || run?.run.status === 'interrupted') return
        timer = window.setTimeout(poll, 1400)
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

  const progress = state.run?.run.progress_pct ?? 0
  const status = state.run?.run.status ?? 'queued'
  const stageText = useMemo(() => loadingStage(status, progress), [status, progress])

  return (
    <section className="v2-loading-page">
      <div className="v2-page-head">
        <div>
          <p className="v2-kicker">{state.project?.name ?? 'Simulation'}</p>
          <h1>{stageText.title}</h1>
        </div>
        <button type="button" onClick={() => projectId && navigateTo(`/projects/${encodeURIComponent(projectId)}`)}>
          프로젝트
        </button>
      </div>

      <div className="v2-loading-hero">
        <div className="v2-loading-orbit" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => (
            <span key={index} style={{ '--i': index } as CSSProperties} />
          ))}
        </div>
        <div>
          <p className="v2-kicker">Synthetic Panel</p>
          <h2>{stageText.body}</h2>
          <div className="v2-progress-track" aria-label="실행 진행률">
            <span style={{ width: `${Math.max(3, Math.min(100, progress))}%` }} />
          </div>
          <div className="v2-loading-meta">
            <span>{Math.round(progress)}%</span>
            <span>{state.run ? `${state.run.run.done_count}/${state.run.run.total_count}명` : '대기 중'}</span>
            <span>{statusLabel(status)}</span>
          </div>
        </div>
      </div>

      <div className="v2-loading-steps">
        {[
          ['입력 검증', progress > 0 || status !== 'queued'],
          ['패널 응답 수집', status === 'running' || progress >= 20],
          ['결과 구조화', progress >= 80 || status === 'completed'],
          ['보고서 준비', status === 'completed'],
        ].map(([label, active]) => (
          <span className={active ? 'active' : ''} key={String(label)}>{label}</span>
        ))}
      </div>

      {state.error && <p className="v2-error">{state.error}</p>}
    </section>
  )
}

function loadingStage(status: string, progress: number): { title: string; body: string } {
  if (status === 'completed') return { title: '결과가 준비됐습니다', body: '보고서 화면으로 이동합니다.' }
  if (status === 'failed') return { title: '실행이 실패했습니다', body: '프로젝트에서 입력값과 로그를 확인하세요.' }
  if (progress >= 80) return { title: '응답을 구조화합니다', body: '페르소나 응답을 집계 지표와 근거 발언으로 정리하는 중입니다.' }
  if (status === 'running') return { title: '합성 패널이 응답 중입니다', body: '타겟 조건에 맞춘 페르소나가 선택 이유와 점수를 생성합니다.' }
  return { title: '실행을 준비합니다', body: '작업 큐에 시뮬레이션을 등록하고 있습니다.' }
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: '대기',
    running: '실행 중',
    completed: '완료',
    failed: '실패',
    canceled: '취소',
    interrupted: '중단',
  }
  return labels[status] ?? status
}
