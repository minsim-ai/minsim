import { useEffect, useState } from 'react'
import { ArrowRight, History } from 'lucide-react'
import { autofillProject } from '../api/intake'
import { archiveProject, getProject, listProjectRuns, updateProject } from '../api/projects'
import type { ProjectAutofillMeta, ProjectResponse, ProjectRunItem } from '../types/api'
import { getSimulationLabel } from '../simulations/registry'
import { AutofillPanel } from './AutofillPanel'
import { navigateTo } from './navigation'
import { AUTOFILL_ALL_FIELDS, autofillMetaOf } from './projectAutofill'

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectResponse | null>(null)
  const [runs, setRuns] = useState<ProjectRunItem[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [productContext, setProductContext] = useState('')
  const [features, setFeatures] = useState('')
  const [prices, setPrices] = useState('')
  const [targetNotes, setTargetNotes] = useState('')
  const [alternatives, setAlternatives] = useState('')
  const [autofillMeta, setAutofillMeta] = useState<ProjectAutofillMeta | null>(null)
  const [aiFilled, setAiFilled] = useState<Set<string>>(new Set())
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([getProject(projectId), listProjectRuns(projectId)])
      .then(([projectResponse, runsResponse]) => {
        if (cancelled) return
        setProject(projectResponse)
        setRuns(runsResponse.runs)
        setName(projectResponse.name)
        setDescription(projectResponse.description)
        setProductContext(stringFromContext(projectResponse.product_context))
        setFeatures(projectResponse.features.join('\n'))
        setPrices(projectResponse.prices.join('\n'))
        setTargetNotes(projectResponse.target_notes)
        setAlternatives(projectResponse.alternatives.join('\n'))
        const meta = autofillMetaOf(projectResponse)
        setAutofillMeta(meta)
        setAiFilled(new Set(meta?.filled_fields ?? []))
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [projectId])

  const markEdited = (field: string) => {
    setAiFilled((current) => {
      if (!current.has(field)) return current
      const next = new Set(current)
      next.delete(field)
      return next
    })
  }

  const applyAutofill = async (prompt: string) => {
    setAiBusy(true)
    setAiError(null)
    try {
      const draft = await autofillProject({ prompt })
      const fields = draft.project_fields
      setName(fields.name || name)
      setDescription(fields.description || description)
      setProductContext(fields.product_context || productContext)
      setFeatures(fields.features.join('\n'))
      setPrices(fields.prices.join('\n'))
      setTargetNotes(fields.target_notes)
      setAlternatives(fields.alternatives.join('\n'))
      setAutofillMeta({
        source: 'generated',
        prompt,
        recommended_simulation_type: draft.recommended_simulation_type,
        simulation_input: draft.simulation_input,
        assumptions: draft.assumptions,
        notes: draft.notes,
        filled_fields: [...AUTOFILL_ALL_FIELDS],
      })
      setAiFilled(new Set(AUTOFILL_ALL_FIELDS))
      setNotice('AI가 전체 항목을 채웠습니다. 확인 후 원하는 부분만 수정하고 저장하세요.')
    } catch {
      setAiError('AI 채움에 실패했습니다. 직접 입력하거나 잠시 후 다시 시도해주세요.')
    } finally {
      setAiBusy(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateProject(projectId, {
        name,
        description,
        product_context: {
          product_description: productContext,
          ...(autofillMeta
            ? { autofill: { ...autofillMeta, filled_fields: [...aiFilled] } }
            : {}),
        },
        features: splitLines(features),
        prices: splitLines(prices, { splitCommas: false }),
        target_notes: targetNotes,
        alternatives: splitLines(alternatives),
      })
      setProject(updated)
      setNotice('저장했습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    if (!window.confirm('이 프로젝트를 보관하시겠습니까? 프로젝트 목록에서 숨겨집니다.')) return
    try {
      await archiveProject(projectId)
      navigateTo('/projects')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (error) return <p className="v2-error">{error}</p>
  if (!project) return <p className="v2-muted">프로젝트를 불러오는 중</p>

  return (
    <section className="v2-project-detail">
      <div className="v2-page-head">
        <div>
          <p className="v2-kicker">Project</p>
          <h1>{project.name}</h1>
        </div>
        <div className="v2-action-row">
          <button
            type="button"
            onClick={() => {
              const recommended = autofillMeta?.recommended_simulation_type
              const path = recommended
                ? `/projects/${encodeURIComponent(projectId)}/type?recommended=${encodeURIComponent(recommended)}`
                : `/projects/${encodeURIComponent(projectId)}/type`
              navigateTo(path)
            }}
          >
            새 시뮬레이션
          </button>
          <button type="button" disabled={saving} onClick={save}>{saving ? '저장 중…' : '저장'}</button>
          <button className="v2-danger-action" type="button" onClick={archive}>프로젝트 보관</button>
        </div>
      </div>

      {notice && <p className="v2-muted">{notice}</p>}

      <div className="minsim-autofill-layout">
      <div className="v2-editor-grid">
        <label>
          <span>이름</span>
          <input
            value={name}
            onChange={(event) => {
              markEdited('name')
              setName(event.target.value)
            }}
            placeholder="예: 사주·점성술 AI 채팅 앱"
          />
        </label>
        <label className="v2-wide-field">
          <span>설명</span>
          <textarea
            className="minsim-description-field"
            value={description}
            onChange={(event) => {
              markEdited('description')
              setDescription(event.target.value)
            }}
            placeholder="예: 사주와 별자리 해석을 대화형으로 제공하는 AI 앱"
            rows={3}
          />
        </label>
        <label className="v2-wide-field">
          <span>제품 컨텍스트</span>
          <textarea
            value={productContext}
            onChange={(event) => {
              markEdited('product_context')
              setProductContext(event.target.value)
            }}
            placeholder="예: 생년월일과 고민을 바탕으로 사주·점성술 상담을 제공하는 AI 채팅 앱"
            rows={5}
          />
        </label>
        <label>
          <span>기능</span>
          <textarea
            value={features}
            onChange={(event) => {
              markEdited('features')
              setFeatures(event.target.value)
            }}
            placeholder={'예: 사주 풀이\n별자리 운세\nAI 고민 상담'}
            rows={5}
          />
        </label>
        <label>
          <span>가격</span>
          <textarea
            value={prices}
            onChange={(event) => {
              markEdited('prices')
              setPrices(event.target.value)
            }}
            placeholder="예: 무료 3회 상담 · 프리미엄 월 9,900원"
            rows={5}
          />
        </label>
        <label className="v2-wide-field">
          <span>타겟 메모</span>
          <textarea
            value={targetNotes}
            onChange={(event) => {
              markEdited('target_notes')
              setTargetNotes(event.target.value)
            }}
            placeholder="예: 사주·별자리에 관심 있고 연애·진로 고민을 나누고 싶은 20~30대"
            rows={4}
          />
        </label>
        <label className="v2-wide-field">
          <span>대안/경쟁재</span>
          <textarea
            value={alternatives}
            onChange={(event) => {
              markEdited('alternatives')
              setAlternatives(event.target.value)
            }}
            placeholder="예: 점신, 포스텔러, 운세의 신"
            rows={4}
          />
        </label>
      </div>

      <AutofillPanel
        initialPrompt={autofillMeta?.prompt || description || ''}
        busy={aiBusy}
        error={aiError}
        notes={autofillMeta?.notes ?? []}
        onGenerate={(prompt) => void applyAutofill(prompt)}
        generateLabel="AI 생성 (전체 다시 채우기)"
        footer={
          autofillMeta ? (
            <button
              className="btn"
              type="button"
              onClick={() =>
                navigateTo(
                  `/projects/${encodeURIComponent(projectId)}/type?recommended=${encodeURIComponent(
                    autofillMeta.recommended_simulation_type,
                  )}`,
                )
              }
            >
              추천 유형({getSimulationLabel(autofillMeta.recommended_simulation_type)})으로 시작 →
            </button>
          ) : undefined
        }
      />
      </div>

      <section className="v2-report-section">
        <div className="v2-run-history-head">
          <div>
            <p className="v2-kicker">Run history</p>
            <h2>실행 이력</h2>
          </div>
          <span>{runs.length.toLocaleString('ko-KR')}개</span>
        </div>
        <div className="v2-run-list">
          {runs.map((item) => <RunHistoryRow item={item} projectId={projectId} key={item.run.run_id} />)}
          {runs.length === 0 && (
            <div className="v2-run-empty">
              <History size={24} aria-hidden="true" />
              <strong>아직 실행한 시뮬레이션이 없습니다</strong>
              <span>새 시뮬레이션을 시작하면 상태와 결과가 시간순으로 쌓입니다.</span>
            </div>
          )}
        </div>
      </section>
    </section>
  )
}

function RunHistoryRow({ item, projectId }: { item: ProjectRunItem; projectId: string }) {
  const { run } = item
  const active = run.status === 'queued' || run.status === 'running'
  const completed = run.status === 'completed' && run.result_available
  const terminal = run.status === 'failed' || run.status === 'canceled' || run.status === 'interrupted'
  const navigable = active || completed || terminal
  const href = active || terminal
    ? `/loading?project_id=${encodeURIComponent(projectId)}&run_id=${encodeURIComponent(run.run_id)}`
    : `/results?project_id=${encodeURIComponent(projectId)}&run_id=${encodeURIComponent(run.run_id)}`
  const pct = Math.round(run.progress_pct)

  return (
    <button
      className={`v2-run-history-row status-${run.status}`}
      type="button"
      disabled={!navigable}
      onClick={() => navigable && navigateTo(href)}
    >
      <span className={`v2-run-status status-${run.status}`}>{runStatusLabel(run.status)}</span>
      <span className="v2-run-history-copy">
        <strong>{getSimulationLabel(run.simulation_type)}</strong>
        <small>{item.run_label || `${getSimulationLabel(run.simulation_type)} 실행`}</small>
      </span>
      <span className="v2-run-history-progress">
        <span>{run.done_count.toLocaleString('ko-KR')} / {run.total_count.toLocaleString('ko-KR')}명</span>
        <i aria-hidden="true"><b style={{ width: `${pct}%` }} /></i>
      </span>
      <time dateTime={item.created_at}>{formatRunDate(item.created_at)}</time>
      {navigable && <ArrowRight size={18} aria-hidden="true" />}
    </button>
  )
}

function runStatusLabel(status: ProjectRunItem['run']['status']): string {
  return ({
    queued: '대기 중',
    running: '진행 중',
    completed: '완료',
    failed: '실패',
    canceled: '취소됨',
    interrupted: '중단됨',
  } as const)[status]
}

function formatRunDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function splitLines(value: string, options: { splitCommas?: boolean } = {}): string[] {
  const separator = options.splitCommas === false ? /\n/ : /\n|,/
  return value.split(separator).map((item) => item.trim()).filter(Boolean)
}

function stringFromContext(value: ProjectResponse['product_context']): string {
  const description = value.product_description
  if (typeof description === 'string') return description
  return Object.entries(value)
    .filter(([key]) => key !== 'autofill')
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join('\n')
}
