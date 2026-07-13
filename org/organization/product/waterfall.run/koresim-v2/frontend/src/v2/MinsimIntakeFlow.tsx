import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { generateIntakeCandidates, linkIntakeSessionRun, saveIntakeSession } from '../api/intake'
import { createProjectRun, getProject } from '../api/projects'
import { advanceIntakeSession, createInitialIntakeSession } from '../intake/planner'
import { buildGenericSimulationPayload, validateCreativeTestingPayload } from '../intake/payloadBuilder'
import type { CreativeCandidate, DynamicFormField, IntakeSession, IntakeSlotValue } from '../intake/types'
import type { JsonObject, ProjectResponse, SimulationType } from '../types/api'
import { getSimulationLabel } from '../simulations/registry'
import { navigateTo } from './navigation'
import { createProjectIntakeSession } from './projectIntake'

export function MinsimIntakeFlow({
  projectId,
  simulationType,
}: {
  projectId: string
  simulationType: SimulationType | null
}) {
  const [project, setProject] = useState<ProjectResponse | null>(null)
  const [session, setSession] = useState<IntakeSession>(() => ({
    ...createInitialIntakeSession(),
    messages: [],
    action: null,
  }))
  const [message, setMessage] = useState('')
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [candidateLoading, setCandidateLoading] = useState(false)
  const [candidateMeta, setCandidateMeta] = useState<string | null>(null)
  const composingRef = useRef(false)
  const type = simulationType ?? 'creative_testing'

  useEffect(() => {
    getProject(projectId)
      .then(setProject)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [projectId])

  useEffect(() => {
    if (!project) return
    setSession(createProjectIntakeSession(project, type))
  }, [project, type])

  useEffect(() => {
    if (!project || session.turnCount === 0) return
    const timeout = window.setTimeout(() => {
      void saveIntakeSession({
        session_id: session.id,
        status: session.status,
        snapshot: session as unknown as JsonObject,
      }).catch(() => {
        // Recovery persistence is retried before run creation and must not interrupt typing.
      })
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [project, session])

  const payload = useMemo(() => buildGenericSimulationPayload(session), [session])
  const creativeErrors = payload.simulation_type === 'creative_testing' ? validateCreativeTestingPayload(payload) : []
  const action = session.action
  const progress = useMemo(() => progressForAction(action?.type ?? null), [action?.type])

  useEffect(() => {
    if (action?.type !== 'candidate_review') return
    if (action.candidates.some((candidate) => candidate.id.startsWith('llm-'))) return
    const productDescription = slotString(session, 'product_description') || stringFromProject(project)
    if (!productDescription) return

    let cancelled = false
    setCandidateLoading(true)
    setCandidateMeta(null)
    generateIntakeCandidates({
      product_description: productDescription,
      target_customers: slotStringArray(session, 'target_customers'),
      main_benefit: slotString(session, 'main_benefit') || null,
      tone: slotString(session, 'tone') || null,
      count: 4,
    })
      .then((response) => {
        if (cancelled) return
        const candidates = response.candidates.map((candidate, index): CreativeCandidate => ({
          id: `llm-${index + 1}-${candidate.id}`,
          text: candidate.text,
          angle: normalizeCandidateAngle(candidate.angle),
          why: candidate.why,
          source: 'generated',
        }))
        const assumptions = response.assumptions.map((assumption): IntakeSlotValue => ({
          slotId: assumption.slot_id,
          value: assumption.value,
          source: 'generated',
          confidence: assumption.confidence,
          evidence: 'llm intake candidate generation',
          needsUserReview: true,
          reviewed: false,
        }))
        setSession((current) => {
          if (current.action?.type !== 'candidate_review') return current
          return {
            ...current,
            action: {
              ...current.action,
              candidates: candidates.length > 0 ? candidates : current.action.candidates,
              assumptions: assumptions.length > 0 ? assumptions : current.action.assumptions,
            },
          }
        })
        setCandidateMeta(`${response.provider_model || response.provider} · trace ${response.trace_id ?? 'n/a'}`)
      })
      .catch((err) => {
        if (!cancelled) {
          setCandidateMeta('기본 후보 사용 중')
          setError(
            err instanceof DOMException && err.name === 'TimeoutError'
              ? 'AI 후보 생성이 지연되어 기본 후보를 표시했습니다. 문구를 검토·수정한 뒤 진행해주세요.'
              : 'AI 후보를 불러오지 못해 기본 후보를 표시했습니다. 문구를 검토·수정한 뒤 진행해주세요.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setCandidateLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [action, project, session])

  const send = () => {
    if (!message.trim()) return
    const next = advanceIntakeSession(session, {
      type: 'user_message',
      content: message,
      selectedSimulationType: type,
    })
    setSession(next)
    setMessage('')
    setFormValues({})
    setError(null)
  }

  const submitForm = (event: FormEvent) => {
    event.preventDefault()
    const next = advanceIntakeSession(session, {
      type: 'form_submit',
      values: normalizeFormValues(action?.type === 'show_form' ? action.form.fields : [], formValues),
    })
    setSession(next)
    setFormValues({})
    setError(null)
  }

  const run = async () => {
    if (action?.type !== 'run_ready') {
      setError('후보 확정과 입력 검토를 먼저 완료해주세요.')
      return
    }
    if (creativeErrors.length > 0) {
      setError(creativeErrors[0].message)
      return
    }
    try {
      await saveIntakeSession({
        session_id: session.id,
        status: session.status,
        snapshot: session as unknown as JsonObject,
      })
      const response = await createProjectRun(projectId, {
        ...payload,
        simulation_type: type,
        run_label: `${project?.name ?? 'Project'} ${new Date().toLocaleDateString('ko-KR')}`,
      })
      try {
        await linkIntakeSessionRun(session.id, { run_id: response.run.run_id })
      } catch {
        // The run is already durable; a failed recovery link must not hide its result.
      }
      navigateTo(`/loading?project_id=${encodeURIComponent(projectId)}&run_id=${encodeURIComponent(response.run.run_id)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const acceptCandidates = (candidates: CreativeCandidate[], assumptions: IntakeSlotValue[]) => {
    const next = advanceIntakeSession(session, {
      type: 'candidate_accept',
      candidates,
      assumptions,
    })
    setSession(next)
    setError(null)
  }

  const confirmAssumptions = () => {
    const next = advanceIntakeSession(session, { type: 'confirm_assumptions' })
    setSession(next)
    setError(null)
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposing(event, composingRef)) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  return (
    <section className="v2-intake minsim-chat-workspace">
      <div className="minsim-chat-header">
        <div className="col">
          <p className="v2-kicker">{project?.name ?? 'Project'}</p>
          <h1>입력값을 대화로 정리합니다</h1>
          <div className="minsim-selected-simulation" aria-label={`선택한 시뮬레이션: ${getSimulationLabel(type)}`}>
            <span>선택한 시뮬레이션</span>
            <strong>{getSimulationLabel(type)}</strong>
            <button type="button" onClick={() => navigateTo(`/projects/${encodeURIComponent(projectId)}/type`)}>
              변경
            </button>
          </div>
        </div>
        <div className="row minsim-chat-header-actions" aria-live="polite">
          {candidateMeta && <span className="badge live">AI {candidateMeta}</span>}
          {action?.type === 'run_ready' && <span className="badge live">실행 준비 완료</span>}
        </div>
      </div>

      <div
        className="bar minsim-chat-progress"
        role="progressbar"
        aria-label="입력 진행률"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <i style={{ width: `${progress}%` }} />
      </div>

      <div className="minsim-chat-grid">
        <div className="v2-chat-panel minsim-chat-thread">
          {session.messages.map((item, index) => (
            <ChatBubble item={item} key={`${item.role}-${index}-${item.content}`} />
          ))}
          <ActionPanel
            action={action}
            candidateLoading={candidateLoading}
            productDescription={slotString(session, 'product_description') || stringFromProject(project)}
            formValues={formValues}
            onAcceptCandidates={acceptCandidates}
            onConfirmAssumptions={confirmAssumptions}
            onFormValues={setFormValues}
            onRun={run}
            onSubmitForm={submitForm}
          />
          {action?.type === 'ask_question' && (
            <div className="v2-chat-input minsim-chat-composer">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onCompositionStart={() => {
                  composingRef.current = true
                }}
                onCompositionEnd={() => {
                  composingRef.current = false
                }}
                onKeyDown={handleComposerKeyDown}
                aria-label="질문에 답변"
                rows={2}
                placeholder="위 질문에 아는 만큼 답해주세요. 예: 최근 3개월간 재구매율이 줄었습니다."
              />
              <button type="button" onClick={send} disabled={!message.trim()}>답변 전송 →</button>
            </div>
          )}
        </div>

        <aside className="minsim-input-summary card">
          <div className="lbl-mono">입력 요약</div>
          <SummaryRow label="제품" value={slotString(session, 'product_description') || stringFromProject(project) || '—'} />
          <SummaryRow label="고객" value={slotStringArray(session, 'target_customers').join(', ') || '—'} />
          <SummaryRow label="장점" value={slotString(session, 'main_benefit') || '—'} />
          <SummaryRow label="후보" value={candidateSummary(session)} />
          <SummaryRow label="패널" value={`${payload.sample_size ?? 200}명`} />
          <SummaryRow label="상태" value={statusLabel(action?.type ?? null)} />
        </aside>
      </div>

      {error && <p className="v2-error">{error}</p>}
    </section>
  )
}

function ChatBubble({ item }: { item: IntakeSession['messages'][number] }) {
  if (item.role === 'assistant') {
    return (
      <div className="minsim-bubble-row assistant">
        <div className="brand minsim-bubble-brand"><span className="dot">m</span></div>
        <p className="v2-chat-line assistant">{item.content}</p>
      </div>
    )
  }
  return (
    <div className="minsim-bubble-row user">
      <p className="v2-chat-line user">{item.content}</p>
    </div>
  )
}

function ActionPanel({
  action,
  candidateLoading,
  productDescription,
  formValues,
  onAcceptCandidates,
  onConfirmAssumptions,
  onFormValues,
  onRun,
  onSubmitForm,
}: {
  action: IntakeSession['action']
  candidateLoading: boolean
  productDescription: string
  formValues: Record<string, string>
  onAcceptCandidates: (candidates: CreativeCandidate[], assumptions: IntakeSlotValue[]) => void
  onConfirmAssumptions: () => void
  onFormValues: (updater: (current: Record<string, string>) => Record<string, string>) => void
  onRun: () => void
  onSubmitForm: (event: FormEvent) => void
}) {
  if (!action) return null

  if (action.type === 'show_form') {
    return (
      <form className="v2-dynamic-form minsim-action-card" onSubmit={onSubmitForm}>
        <div className="minsim-action-head">
          <span className="lbl-mono">필요 정보</span>
          <p>아는 만큼만 채우고 비워둔 항목은 후보 생성 단계에서 보완합니다.</p>
        </div>
        <div className="minsim-form-fields">
          {action.form.fields.map((field, index) => (
            <label className="minsim-form-field" key={field.id}>
              <span className="minsim-form-question">
                <b>질문 {index + 1}</b>
                <strong>{field.label}</strong>
                {!field.required && <em>선택</em>}
              </span>
              <span className="sr-only">답변 입력</span>
              {field.type === 'textarea' || field.type === 'multi_text' ? (
                <textarea
                  value={formValues[field.id] ?? valueToString(field.value)}
                  onChange={(event) => onFormValues((current) => ({ ...current, [field.id]: event.target.value }))}
                  placeholder={field.placeholder || `${field.label}의 예시나 현재 상황을 적어주세요.`}
                  rows={3}
                />
              ) : (
                <input
                  value={formValues[field.id] ?? valueToString(field.value)}
                  onChange={(event) => onFormValues((current) => ({ ...current, [field.id]: event.target.value }))}
                  placeholder={field.placeholder || `${field.label}을 입력해주세요.`}
                />
              )}
              {field.helperText && <small>{field.helperText}</small>}
            </label>
          ))}
        </div>
        <button type="submit">{action.form.primaryAction}</button>
      </form>
    )
  }

  if (action.type === 'candidate_review') {
    return (
      <CandidateReviewPanel
        candidates={action.candidates}
        assumptions={action.assumptions}
        loading={candidateLoading}
        message={action.message}
        productDescription={productDescription}
        onAccept={onAcceptCandidates}
      />
    )
  }

  if (action.type === 'confirm_assumptions') {
    return (
      <div className="minsim-action-card">
        <div className="minsim-action-head">
          <span className="lbl-mono">가정 확인</span>
          <p>{action.message}</p>
        </div>
        <div className="minsim-assumption-list">
          {action.assumptions.map((assumption) => (
            <span className="chip sm on" key={`${assumption.slotId}-${String(assumption.value)}`}>
              {assumption.slotId}: {String(assumption.value)}
            </span>
          ))}
        </div>
        <button type="button" onClick={onConfirmAssumptions}>가정 확인하고 계속 →</button>
      </div>
    )
  }

  if (action.type === 'run_ready') {
    const defaults = action.assumptions.filter((assumption) => assumption.source === 'default')
    return (
      <div className="minsim-action-card run-ready">
        <div className="minsim-action-head">
          <span className="lbl-mono">실행 준비 완료</span>
          <p>{action.message}</p>
        </div>
        {defaults.length > 0 && (
          <div className="minsim-assumption-list" aria-label="실행 기본값">
            {defaults.map((assumption) => (
              <span className="chip sm" key={`default-${assumption.slotId}`}>
                {assumptionLabel(assumption.slotId)}: {formatAssumptionValue(assumption.value)}
              </span>
            ))}
          </div>
        )}
        <button type="button" onClick={onRun}>조건 확인하고 시뮬레이션 시작 →</button>
      </div>
    )
  }

  if (action.type === 'repair_input') {
    return (
      <div className="minsim-action-card">
        <div className="minsim-action-head">
          <span className="lbl-mono">입력 확인</span>
          <p>{action.message}</p>
        </div>
        {action.fieldErrors.map((fieldError) => (
          <p className="v2-error" key={fieldError.fieldId}>{fieldError.message}</p>
        ))}
      </div>
    )
  }

  return null
}

function assumptionLabel(slotId: string): string {
  return ({ sample_size: '패널 크기', seed: '패널 시드', n_segments: '세그먼트 수', budget: '예산' } as Record<string, string>)[slotId] ?? slotId
}

function formatAssumptionValue(value: unknown): string {
  if (typeof value === 'number') return value.toLocaleString('ko-KR')
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

function CandidateReviewPanel({
  candidates,
  assumptions,
  loading,
  message,
  productDescription,
  onAccept,
}: {
  candidates: CreativeCandidate[]
  assumptions: IntakeSlotValue[]
  loading: boolean
  message: string
  productDescription: string
  onAccept: (candidates: CreativeCandidate[], assumptions: IntakeSlotValue[]) => void
}) {
  const [drafts, setDrafts] = useState(candidates)
  const [selectedIds, setSelectedIds] = useState<string[]>(() => candidates.map((candidate) => candidate.id))

  useEffect(() => {
    setDrafts(candidates)
    setSelectedIds(candidates.map((candidate) => candidate.id))
  }, [candidates])

  const issues = drafts.map((candidate) => candidateQualityIssues(candidate.text, productDescription))
  const selectedDrafts = drafts.filter((candidate) => selectedIds.includes(candidate.id))
  const validCount = selectedDrafts.filter((candidate) => candidate.text.trim()).length
  const hasBlockingIssue = issues.some((candidateIssues, index) => (
    selectedIds.includes(drafts[index].id) && candidateIssues.length > 0
  ))

  return (
    <div className="minsim-action-card" aria-busy={loading}>
      <div className="minsim-action-head" aria-live="polite">
        <span className="lbl-mono">{loading ? 'AI 후보 생성 중' : 'AI 후보 검토'}</span>
        <p>{loading ? '제품 맥락에 맞는 문구를 생성하고 있습니다. 완료될 때까지 확정할 수 없습니다.' : message}</p>
      </div>
      <div className="minsim-candidate-grid">
        {drafts.map((candidate, index) => (
          <article className={`card minsim-candidate-card${selectedIds.includes(candidate.id) ? ' selected' : ''}`} key={candidate.id}>
            <div className="spread">
              <span className="badge live">{String.fromCharCode(65 + index)}안</span>
              <label className="minsim-candidate-toggle">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(candidate.id)}
                  disabled={loading}
                  onChange={(event) => setSelectedIds((current) => (
                    event.target.checked ? [...current, candidate.id] : current.filter((id) => id !== candidate.id)
                  ))}
                />
                비교에 포함
              </label>
            </div>
            <label>
              <span className="sr-only">{String.fromCharCode(65 + index)}안 문구</span>
              <textarea
                value={candidate.text}
                rows={3}
                disabled={loading || !selectedIds.includes(candidate.id)}
                onChange={(event) => setDrafts((current) => current.map((item) => (
                  item.id === candidate.id ? { ...item, text: event.target.value } : item
                )))}
              />
            </label>
            <small>{candidate.angle} · {candidate.why}</small>
            {selectedIds.includes(candidate.id) && issues[index].map((issue) => <small className="minsim-quality-warning" key={issue}>{issue}</small>)}
          </article>
        ))}
      </div>
      {hasBlockingIssue && !loading && (
        <p className="minsim-quality-gate" role="alert">제품과 무관하거나 어색한 문구를 수정해야 확정할 수 있습니다.</p>
      )}
      <button
        type="button"
        disabled={loading || validCount < 2 || hasBlockingIssue}
        onClick={() => onAccept(selectedDrafts.filter((candidate) => candidate.text.trim()), assumptions)}
      >
        {loading ? '후보 생성 중…' : '검토한 후보 확정 →'}
      </button>
    </div>
  )
}

function candidateQualityIssues(value: string, productDescription: string): string[] {
  const text = value.trim()
  const issues: string[] = []
  if (text.length < 8) issues.push('문구를 8자 이상 입력해주세요.')
  if (/\b(\d+대|고객|사용자)\s+(을|를|이|가)\s+위한/.test(text)) issues.push('조사가 어색합니다.')
  if (/외로\s|대상.*대상|을 위한.*을 위한/.test(text)) issues.push('문장이 반복되거나 자연스럽게 끝나지 않습니다.')
  const contentTerms = /글감|블로그|글쓰기|콘텐츠|출판/
  if (contentTerms.test(text) && !contentTerms.test(productDescription)) {
    issues.push('제품 설명과 무관한 콘텐츠·글쓰기 표현이 포함되어 있습니다.')
  }
  return issues
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="minsim-summary-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function normalizeFormValues(fields: DynamicFormField[], values: Record<string, string>) {
  return Object.fromEntries(
    fields.map((field) => {
      const value = values[field.id] ?? valueToString(field.value)
      if (field.type === 'multi_text') {
        return [field.id, value.split(/\n|,/).map((item) => item.trim()).filter(Boolean)]
      }
      if (field.type === 'number') {
        return [field.id, Number(value.replace(/[^\d]/g, '')) || value]
      }
      return [field.id, value]
    }),
  )
}

function valueToString(value: DynamicFormField['value']): string {
  if (Array.isArray(value)) return value.join('\n')
  return value === undefined ? '' : String(value)
}

function stringFromProject(project: ProjectResponse | null): string {
  if (!project) return ''
  const description = project.product_context.product_description
  if (typeof description === 'string' && description.trim()) return description
  return [project.description, ...project.features].filter(Boolean).join('\n')
}

function slotString(session: IntakeSession, slotId: string): string {
  const value = session.slots[slotId]?.value
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

function slotStringArray(session: IntakeSession, slotId: string): string[] {
  const value = session.slots[slotId]?.value
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'text' in item) return String((item as { text?: unknown }).text ?? '')
        return String(item)
      })
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

function candidateSummary(session: IntakeSession): string {
  const candidates = slotStringArray(session, 'creative_candidates')
  if (candidates.length > 0) return `${candidates.length}개 후보 확정`
  if (session.action?.type === 'candidate_review') return `${session.action.candidates.length}개 후보 검토 중`
  return '—'
}

function statusLabel(actionType: string | null): string {
  const labels: Record<string, string> = {
    ask_question: '질문 중',
    show_form: '정보 입력',
    candidate_review: '후보 검토',
    confirm_assumptions: '가정 확인',
    run_ready: '실행 가능',
    repair_input: '수정 필요',
  }
  return actionType ? labels[String(actionType)] ?? String(actionType) : '대기'
}

function progressForAction(actionType: string | null): number {
  if (actionType === 'show_form') return 35
  if (actionType === 'candidate_review') return 62
  if (actionType === 'confirm_assumptions') return 78
  if (actionType === 'run_ready') return 100
  if (actionType === 'repair_input') return 72
  return 16
}

function normalizeCandidateAngle(value: string): CreativeCandidate['angle'] {
  if (value === 'pain_relief' || value === 'automation' || value === 'differentiation' || value === 'trust') return value
  return 'outcome'
}

function isComposing(
  event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>,
  composingRef: { current: boolean },
): boolean {
  const nativeEvent = event.nativeEvent as globalThis.KeyboardEvent & { keyCode?: number }
  return composingRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229
}
