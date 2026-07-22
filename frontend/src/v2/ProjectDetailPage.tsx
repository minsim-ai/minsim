import { useEffect, useState } from 'react'
import { ArrowRight, History } from 'lucide-react'
import { userFacingErrorMessage } from '../api/client'
import { autofillProject } from '../api/intake'
import { archiveProject, getProject, listProjectRuns, updateProject } from '../api/projects'
import type { ProjectAutofillMeta, ProjectResponse, ProjectRunItem } from '../types/api'
import { getSimulationLabel } from '../simulations/registry'
import { AutofillPanel } from './AutofillPanel'
import { navigateTo } from './navigation'
import { AUTOFILL_ALL_FIELDS, AUTOFILL_POLL_FIELDS, autofillMetaOf } from './projectAutofill'

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
  // 여론조사 프로젝트에는 기능·가격·대안이 없다. 창업 검증 폼을 그대로 보여주면 안 된다.
  const isPoll = project?.kind === 'poll'

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
      // Pass on-screen draft fields so regenerate can refine with LLM context,
      // not rewrite from the one-line prompt alone.
      const draft = await autofillProject({
        prompt,
        kind: project?.kind,
        current_fields: {
          name,
          description,
          product_context: productContext,
          features: isPoll ? [] : splitLines(features),
          prices: isPoll ? [] : splitLines(prices, { splitCommas: false }),
          target_notes: targetNotes,
          alternatives: isPoll ? [] : splitLines(alternatives),
        },
      })
      const fields = draft.project_fields
      setName(fields.name || name)
      setDescription(fields.description || description)
      setProductContext(fields.product_context || productContext)
      setTargetNotes(fields.target_notes)
      if (!isPoll) {
        setFeatures(fields.features.join('\n'))
        setPrices(fields.prices.join('\n'))
        setAlternatives(fields.alternatives.join('\n'))
      }
      const filled = isPoll ? AUTOFILL_POLL_FIELDS : AUTOFILL_ALL_FIELDS
      const meta: ProjectAutofillMeta = {
        source: 'generated',
        prompt,
        recommended_simulation_type: draft.recommended_simulation_type,
        simulation_input: draft.simulation_input,
        assumptions: draft.assumptions,
        notes: draft.notes,
        filled_fields: [...filled],
      }
      setAutofillMeta(meta)
      setAiFilled(new Set(filled))
      // 저장하지 않으면 인테이크가 서버의 옛 값을 읽는다. 채우자마자 저장한다.
      const saved = await persist({
        name: fields.name || name,
        description: fields.description || description,
        productContext: fields.product_context || productContext,
        targetNotes: fields.target_notes,
        features: isPoll ? features : fields.features.join('\n'),
        prices: isPoll ? prices : fields.prices.join('\n'),
        alternatives: isPoll ? alternatives : fields.alternatives.join('\n'),
        autofillMeta: meta,
        aiFilled: [...filled],
      })
      setProject(saved)
      setNotice('AI가 전체 항목을 채우고 저장했습니다. 원하는 부분을 고친 뒤 다시 저장하세요.')
    } catch (err) {
      setAiError(
        userFacingErrorMessage(
          err,
          'AI 채움에 실패했습니다. 직접 입력하거나 잠시 후 다시 시도해주세요.',
        ),
      )
    } finally {
      setAiBusy(false)
    }
  }

  /**
   * 화면의 값을 서버에 저장한다.
   *
   * `fields`를 넘기면 React state 갱신을 기다리지 않고 그 값으로 저장한다.
   * 자동채움 직후처럼 state가 아직 반영되지 않은 시점에 필요하다.
   */
  const persist = async (
    fields?: Partial<{
      name: string
      description: string
      productContext: string
      features: string
      prices: string
      targetNotes: string
      alternatives: string
      autofillMeta: ProjectAutofillMeta | null
      aiFilled: string[]
    }>,
  ) => {
    const meta = fields?.autofillMeta !== undefined ? fields.autofillMeta : autofillMeta
    const filled = fields?.aiFilled ?? [...aiFilled]
    return updateProject(projectId, {
      name: fields?.name ?? name,
      description: fields?.description ?? description,
      product_context: {
        product_description: fields?.productContext ?? productContext,
        ...(meta ? { autofill: { ...meta, filled_fields: filled } } : {}),
      },
      features: splitLines(fields?.features ?? features),
      prices: splitLines(fields?.prices ?? prices, { splitCommas: false }),
      target_notes: fields?.targetNotes ?? targetNotes,
      alternatives: splitLines(fields?.alternatives ?? alternatives),
    })
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      setProject(await persist())
      setNotice('저장했습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  /**
   * 저장하지 않은 편집을 남긴 채 시뮬레이션으로 넘어가면, 인테이크는 서버의 옛 값을
   * 읽는다. 프로덕션 run 7a6184c8에서 지운 줄 알았던 "3천원"이 프롬프트에 그대로
   * 들어가 200명 중 170명이 후보 밖 가격을 답했다.
   */
  const startSimulation = async (recommendedType?: string) => {
    setSaving(true)
    setError(null)
    try {
      await persist()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
      return
    }
    setSaving(false)
    const recommended = recommendedType ?? autofillMeta?.recommended_simulation_type
    navigateTo(
      recommended
        ? `/projects/${encodeURIComponent(projectId)}/type?recommended=${encodeURIComponent(recommended)}`
        : `/projects/${encodeURIComponent(projectId)}/type`,
    )
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
      {/* Title stays first. Actions sit after the form in DOM so mobile reads
          content before CTAs; desktop CSS lifts the action row beside the title. */}
      <div className="v2-page-head">
        <div>
          <p className="v2-kicker">Project</p>
          <h1>{project.name}</h1>
        </div>
      </div>

      {notice && <p className="v2-muted v2-project-notice">{notice}</p>}

      <div className="minsim-autofill-layout">
      <div className="v2-editor-grid">
        <label className="v2-wide-field">
          <span>이름</span>
          <input
            value={name}
            onChange={(event) => {
              markEdited('name')
              setName(event.target.value)
            }}
            placeholder={isPoll ? '예: 중앙도서관 24시간 개방' : '예: 교내 포토부스'}
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
            placeholder={
              isPoll
                ? '예: 시험기간 열람실 부족 민원이 반복돼서, 24시간 개방 여론을 확인하려는 프로젝트'
                : '예: 도서관 1층 로비에 3장 1,000원 즉석 인화 포토부스를 운영'
            }
            rows={3}
          />
        </label>
        <label className="v2-wide-field">
          <span>{isPoll ? '배경 정보' : '제품 컨텍스트'}</span>
          <textarea
            value={productContext}
            onChange={(event) => {
              markEdited('product_context')
              setProductContext(event.target.value)
            }}
            placeholder={
              isPoll
                ? '예: 현재 평일 09-23시, 주말 10-18시 운영. 연간 추가 운영비 약 1.2억 추정.'
                : '예: 학생이 오가는 도서관 1층 로비에 소형 포토부스를 두고 즉석 촬영·인화를 제공'
            }
            rows={5}
          />
        </label>
        {!isPoll && (
          <>
        <label>
          <span>기능</span>
          <textarea
            value={features}
            onChange={(event) => {
              markEdited('features')
              setFeatures(event.target.value)
            }}
            placeholder={'예: 즉석 인화 3장\n프레임 템플릿 선택\n학생증 할인'}
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
            placeholder="예: 3장 1,000원 · 학생증 제시 시 800원"
            rows={5}
          />
        </label>
          </>
        )}
        <label className="v2-wide-field">
          <span>{isPoll ? '응답자 메모' : '타겟 메모'}</span>
          <textarea
            value={targetNotes}
            onChange={(event) => {
              markEdited('target_notes')
              setTargetNotes(event.target.value)
            }}
            placeholder={
              isPoll
                ? '예: 학부생 위주로 보고 싶음. 통학생 의견도 따로 확인 필요.'
                : '예: 기숙사 거주 학부생, 동아리·행사 사진을 남기고 싶은 재학생'
            }
            rows={4}
          />
        </label>
        {!isPoll && (
        <label className="v2-wide-field">
          <span>대안/경쟁재</span>
          <textarea
            value={alternatives}
            onChange={(event) => {
              markEdited('alternatives')
              setAlternatives(event.target.value)
            }}
            placeholder="예: 휴대폰 카메라, 현풍 시내 인생네컷, 학교 앞 인화점"
            rows={4}
          />
        </label>
        )}
      </div>

      <AutofillPanel
        initialPrompt={autofillMeta?.prompt || description || ''}
        busy={aiBusy}
        error={aiError}
        notes={autofillMeta?.notes ?? []}
        onGenerate={(prompt) => void applyAutofill(prompt)}
        generateLabel="AI 생성 (전체 다시 채우기)"
        blurb={
          isPoll
            ? '한 문장을 적고 생성하면, 아래 이름·설명·배경·응답자 메모 등 현재 화면 값도 함께 참고해 전체 초안을 다시 만듭니다. 원하는 부분만 고친 뒤 저장하세요.'
            : '한 문장을 적고 생성하면, 아래 이름·설명·제품 컨텍스트·기능·가격 등 현재 화면 값도 함께 참고해 전체 초안을 다시 만듭니다. 원하는 부분만 고친 뒤 저장하세요.'
        }
        promptPlaceholder={isPoll ? '예: 중앙도서관을 24시간 열면 학생들이 찬성할까?' : undefined}
      />
      </div>

      <div className="v2-action-row">
        <button
          className="v2-action-primary"
          type="button"
          disabled={saving || aiBusy}
          onClick={() => void startSimulation()}
        >
          시뮬레이션 시작하기
        </button>
        <button type="button" disabled={saving} onClick={save}>{saving ? '저장 중…' : '저장'}</button>
        <button className="v2-danger-action" type="button" onClick={archive}>프로젝트 보관</button>
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
          {runs.map((item) => <RunHistoryRow item={item} projectId={projectId} kind={project.kind} key={item.run.run_id} />)}
          {runs.length === 0 && (
            <div className="v2-run-empty">
              <History size={24} aria-hidden="true" />
              <strong>아직 실행한 시뮬레이션이 없습니다</strong>
              <span>시뮬레이션을 시작하면 상태와 결과가 시간순으로 쌓입니다.</span>
            </div>
          )}
        </div>
      </section>
    </section>
  )
}

function RunHistoryRow({ item, projectId, kind }: { item: ProjectRunItem; projectId: string; kind?: string | null }) {
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
        <strong>{getSimulationLabel(run.simulation_type, kind)}</strong>
        <small>{item.run_label || `${getSimulationLabel(run.simulation_type, kind)} 실행`}</small>
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
