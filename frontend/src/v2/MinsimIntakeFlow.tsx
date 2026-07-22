import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { generateIntakeCandidates, linkIntakeSessionRun, saveIntakeSession } from '../api/intake'
import { createProjectRun, getProject } from '../api/projects'
import { getProjectKindSpec } from '../modes/projectKinds'
import { SAMPLE_SIZE_PRESETS, estimatedRunSeconds } from '../config/limits'
import { advanceIntakeSession, createInitialIntakeSession } from '../intake/planner'
import { buildGenericSimulationPayload, validateCreativeTestingPayload } from '../intake/payloadBuilder'
import { createSlot, upsertSlot } from '../intake/slotUtils'
import type { CreativeCandidate, DynamicFormField, IntakeSession, IntakeSlotValue } from '../intake/types'
import type { JsonObject, PersonaCountryOption, ProjectResponse, SimulationType } from '../types/api'
import { getSimulationLabel } from '../simulations/registry'
import { AssumptionReviewPanel } from '../components/intake/AssumptionReviewPanel'
import { BrandMark } from '../components/BrandMark'
import { navigateTo } from './navigation'
import { createProjectIntakeSession } from './projectIntake'

const FALLBACK_COUNTRIES: PersonaCountryOption[] = [
  {
    country_id: 'kr',
    country_name: 'South Korea',
    country_name_ko: '대한민국',
    hf_id: 'nvidia/Nemotron-Personas-Korea',
    language: 'Korean',
    supports_region_filter: true,
    supports_korea_map: true,
    available: true,
    path: '',
  },
]

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
  const [countries, setCountries] = useState<PersonaCountryOption[]>(FALLBACK_COUNTRIES)
  const [countryId, setCountryId] = useState('kr')
  const composingRef = useRef(false)
  const type = simulationType ?? 'creative_testing'

  useEffect(() => {
    fetch('/api/config')
      .then((response) => (response.ok ? response.json() : null))
      .then((config: {
        available_countries?: PersonaCountryOption[]
        default_country_id?: string
        event_mode?: { enabled?: boolean; banner?: string | null; default_sample_size?: number; max_sample_size?: number }
        sample_size_presets?: number[]
        max_sample_size?: number
        default_sample_size?: number
      } | null) => {
        if (!config) return
        // Side-effect: update shared sample-size limits for event mode.
        void import('../config/limits').then(({ applyPublicConfig }) => applyPublicConfig(config))
        if (!config.available_countries?.length) return
        setCountries(config.available_countries)
        const preferred = config.default_country_id || 'kr'
        const firstAvailable =
          config.available_countries.find((item) => item.country_id === preferred && item.available) ||
          config.available_countries.find((item) => item.available) ||
          config.available_countries[0]
        if (firstAvailable) setCountryId(firstAvailable.country_id)
      })
      .catch(() => {
        // Keep Korea fallback when config is unavailable.
      })
  }, [])

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
        const provider = (response.provider || '').trim()
        const model = (response.provider_model || '').trim()
        // Prefer "upstage-solar-pro2"; never surface internal trace ids.
        const label =
          provider && model && !model.toLowerCase().startsWith(`${provider.toLowerCase()}-`)
            ? `${provider}-${model}`
            : model || provider || 'model'
        setCandidateMeta(label)
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

  const skipForm = () => {
    if (action?.type !== 'show_form') return
    const emptyValues = Object.fromEntries(action.form.fields.map((field) => [field.id, field.type === 'multi_text' ? [] : '']))
    const next = advanceIntakeSession(session, {
      type: 'form_submit',
      values: emptyValues,
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
        country_id: countryId,
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

  const typeLabel = getSimulationLabel(type, project?.kind)
  const projectDescription = project?.description?.trim() || ''
  const projectBackground = stringFromProject(project)
  const surveyQuestion = slotString(session, 'question').trim()
  const hasContextPreview = Boolean(projectDescription || projectBackground || typeLabel || surveyQuestion)

  return (
    <section className="v2-intake minsim-chat-workspace">
      <div className="minsim-chat-header">
        <div className="col">
          <p className="v2-kicker">{project?.name ?? 'Project'}</p>
          <h1>입력값을 대화로 정리합니다</h1>
          {hasContextPreview && (
            <details className="minsim-intake-context" open>
              <summary>
                <span className="minsim-intake-context-summary">
                  <span className="minsim-intake-context-kicker">이전 입력</span>
                  <strong>{typeLabel}</strong>
                  <span className="minsim-intake-context-hint">설명 · 유형 접기</span>
                </span>
              </summary>
              <div className="minsim-intake-context-body">
                <dl className="minsim-intake-context-list">
                  <div>
                    <dt>프로젝트</dt>
                    <dd>{project?.name?.trim() || '—'}</dd>
                  </div>
                  <div>
                    <dt>설명</dt>
                    <dd className="minsim-intake-context-pre">
                      {projectDescription || '작성된 설명이 없습니다.'}
                    </dd>
                  </div>
                  {projectBackground && projectBackground !== projectDescription && (
                    <div>
                      <dt>{project?.kind === 'poll' ? '배경 정보' : '제품 컨텍스트'}</dt>
                      <dd className="minsim-intake-context-pre">{projectBackground}</dd>
                    </div>
                  )}
                  {type === 'open_survey' && surveyQuestion && (
                    <div>
                      <dt>설문 질문</dt>
                      <dd className="minsim-intake-context-pre">{surveyQuestion}</dd>
                    </div>
                  )}
                  <div>
                    <dt>선택한 유형</dt>
                    <dd>
                      <strong>{typeLabel}</strong>
                    </dd>
                  </div>
                </dl>
              </div>
            </details>
          )}
          <div className="minsim-selected-simulation" aria-label={`선택한 시뮬레이션: ${typeLabel}`}>
            <span>선택한 시뮬레이션</span>
            <strong>{typeLabel}</strong>
            <button type="button" onClick={() => navigateTo(`/projects/${encodeURIComponent(projectId)}/type`)}>
              변경
            </button>
          </div>
        </div>
        <div className="row minsim-chat-header-actions" aria-live="polite">
          {candidateMeta && <span className="badge live">{candidateMeta}</span>}
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

      <div className="minsim-chat-grid minsim-chat-grid--single">
        <div className="v2-chat-panel minsim-chat-thread">
          {session.messages.map((item, index) => (
            <ChatBubble item={item} key={`${item.role}-${index}-${item.content}`} />
          ))}
          <ActionPanel
            action={action}
            simulationType={type}
            candidateLoading={candidateLoading}
            productDescription={slotString(session, 'product_description') || stringFromProject(project)}
            formValues={formValues}
            countries={countries}
            countryId={countryId}
            onCountryChange={setCountryId}
            sampleSize={payload.sample_size ?? 200}
            onSampleSizeChange={(size) =>
              setSession((current) => ({
                ...current,
                slots: upsertSlot(
                  current.slots,
                  createSlot('sample_size', size, 'user', 1, 'panel-size-picker', false),
                ),
              }))
            }
            personaPool={
              typeof session.slots.persona_pool?.value === 'string' && session.slots.persona_pool.value
                ? session.slots.persona_pool.value
                : payload.persona_pool ?? preselectedPersonaPool(project?.kind)
            }
            projectKind={project?.kind}
            onPersonaPoolChange={(pool) =>
              setSession((current) => ({
                ...current,
                slots: upsertSlot(
                  current.slots,
                  createSlot('persona_pool', pool, 'user', 1, 'persona-pool-picker', false),
                ),
              }))
            }
            summary={{
              product: slotString(session, 'product_description') || stringFromProject(project) || '—',
              customers: slotStringArray(session, 'target_customers').join(', ') || '—',
              benefit: slotString(session, 'main_benefit') || '—',
              candidates: candidateSummary(session),
            }}
            onAcceptCandidates={acceptCandidates}
            onConfirmAssumptions={confirmAssumptions}
            onFormValues={setFormValues}
            onRun={run}
            onSubmitForm={submitForm}
            onSkipForm={skipForm}
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
                rows={3}
                placeholder={composerPlaceholder(action.slotIds, type)}
              />
              <button type="button" onClick={send} disabled={!message.trim()}>답변 전송 →</button>
            </div>
          )}
        </div>
      </div>

      {error && <p className="v2-error">{error}</p>}
    </section>
  )
}

function PanelSizePicker({ value, onSelect }: { value: number; onSelect: (size: number) => void }) {
  const estimatedMinutes = Math.ceil(estimatedRunSeconds(value) / 60)
  return (
    <div className="minsim-run-control">
      <div className="minsim-run-control-head">
        <span className="minsim-run-control-label">패널 크기</span>
        <span className="minsim-run-control-hint">선택하세요</span>
      </div>
      <div className="minsim-run-option-row" role="group" aria-label="패널 크기 선택">
        {SAMPLE_SIZE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`minsim-run-option${value === preset ? ' is-on' : ''}`}
            aria-pressed={value === preset}
            onClick={() => onSelect(preset)}
          >
            {preset.toLocaleString()}명
          </button>
        ))}
      </div>
      {value >= 1000 && (
        <p className="minsim-run-control-note">
          대규모 패널은 약 {estimatedMinutes}분이 걸리고 토큰 비용이 비례해 늘어납니다.
        </p>
      )}
    </div>
  )
}

type PersonaPoolOption = { id: string; label: string; available: boolean }

const DEFAULT_POOL_OPTIONS: PersonaPoolOption[] = [
  { id: 'nationwide', label: '전 국민', available: true },
  { id: 'dgist', label: 'DGIST 구성원', available: false },
]

/** 프로젝트 갈래의 기본 풀을 쓴다. 사용자가 선택기로 바꿀 수 있다. */
function preselectedPersonaPool(projectKind?: string | null): string {
  try {
    const stored = window.sessionStorage.getItem('minsim.personaPool')
    if (stored) return stored
  } catch {
    // sessionStorage 접근 불가 시 갈래 기본값으로 떨어진다.
  }
  return getProjectKindSpec(projectKind).defaultPersonaPool
}


function PersonaPoolPicker({ value, onSelect }: { value: string; onSelect: (pool: string) => void }) {
  const [pools, setPools] = useState<PersonaPoolOption[]>(DEFAULT_POOL_OPTIONS)

  useEffect(() => {
    let cancelled = false
    fetch('/api/config')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.persona_pools)) return
        const parsed = data.persona_pools
          .filter((item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
          .map((item: Record<string, unknown>) => ({
            id: String(item.id ?? ''),
            label: String(item.label ?? item.id ?? ''),
            available: item.available === true,
          }))
          .filter((item: PersonaPoolOption) => item.id)
        if (parsed.length > 0) setPools(parsed)
      })
      .catch(() => {
        // Static defaults keep the picker functional when config is unreachable.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="minsim-run-control">
      <div className="minsim-run-control-head">
        <span className="minsim-run-control-label">페르소나 풀</span>
        <span className="minsim-run-control-hint">선택하세요</span>
      </div>
      <div className="minsim-run-option-row" role="group" aria-label="페르소나 풀 선택">
        {pools.map((pool) => (
          <button
            key={pool.id}
            type="button"
            className={`minsim-run-option${value === pool.id ? ' is-on' : ''}`}
            aria-pressed={value === pool.id}
            disabled={!pool.available}
            title={pool.available ? undefined : '데이터셋 준비 중'}
            onClick={() => pool.available && onSelect(pool.id)}
          >
            {pool.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function CountryPicker({
  countries,
  value,
  onChange,
}: {
  countries: PersonaCountryOption[]
  value: string
  onChange: (countryId: string) => void
}) {
  const selected = countries.find((item) => item.country_id === value)
  return (
    <div className="minsim-run-control">
      <div className="minsim-run-control-head">
        <label className="minsim-run-control-label" htmlFor="minsim-country-select" id="minsim-country-label">
          페르소나 국가
        </label>
        <span className="minsim-run-control-hint">선택하세요</span>
      </div>
      <select
        id="minsim-country-select"
        className="minsim-run-select minsim-country-select-desktop"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="페르소나 국가 선택"
      >
        {countries.map((country) => (
          <option key={country.country_id} value={country.country_id} disabled={!country.available}>
            {country.country_name_ko} ({country.country_name})
            {country.available ? '' : ' · 미설치'}
          </option>
        ))}
      </select>
      <div className="minsim-country-options" role="radiogroup" aria-labelledby="minsim-country-label">
        {countries.map((country) => {
          const checked = country.country_id === value
          return (
            <label
              className={`minsim-country-option${checked ? ' minsim-country-option--active' : ''}`}
              key={`mobile-${country.country_id}`}
              title={
                country.available
                  ? `${country.country_name_ko} (${country.country_name})`
                  : `${country.country_name_ko} · 미설치`
              }
            >
              <input
                checked={checked}
                disabled={!country.available}
                name="minsim-country-mobile"
                onChange={() => onChange(country.country_id)}
                type="radio"
                value={country.country_id}
                aria-label={`${country.country_name_ko}${country.available ? '' : ' 미설치'}`}
              />
              <span className="minsim-country-option-copy">
                <strong className="minsim-country-option-name">{country.country_name_ko}</strong>
                <small>{country.country_name}</small>
              </span>
              {/* Selected chips use the lime active style; only surface unavailability. */}
              <span className="minsim-country-option-status">
                {country.available ? '' : '미설치'}
              </span>
            </label>
          )
        })}
      </div>
      <p className="minsim-run-control-note">
        {selected?.language ?? '—'} · 시뮬레이션 시작 전에 선택
      </p>
    </div>
  )
}

function ChatBubble({ item }: { item: IntakeSession['messages'][number] }) {
  if (item.role === 'assistant') {
    return (
      <div className="minsim-bubble-row assistant">
        <div className="brand minsim-bubble-brand"><BrandMark /></div>
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

function composerPlaceholder(slotIds: string[], simulationType: SimulationType): string {
  if (slotIds.includes('options')) {
    return simulationType === 'open_survey'
      ? '위 설문 질문에 맞는 선택지를 적어주세요. 예: OO당 / OO의힘 / 무당층'
      : '선택지 2~6개를 줄바꿈·쉼표·/ 로 적어주세요.'
  }
  if (slotIds.includes('items')) {
    return '후보 항목을 적어주세요. 예: 학식 질 개선 / 심야 셔틀 / 스터디룸 증설'
  }
  if (slotIds.includes('question')) {
    return '응답자에게 그대로 보여줄 질문 한 줄을 적어주세요.'
  }
  return '위 질문에 아는 만큼 답해주세요. 예: 최근 3개월간 재구매율이 줄었어요.'
}

function ActionPanel({
  action,
  simulationType,
  candidateLoading,
  productDescription,
  formValues,
  countries,
  countryId,
  onCountryChange,
  sampleSize,
  onSampleSizeChange,
  personaPool,
  onPersonaPoolChange,
  projectKind,
  summary,
  onAcceptCandidates,
  onConfirmAssumptions,
  onFormValues,
  onRun,
  onSubmitForm,
  onSkipForm,
}: {
  action: IntakeSession['action']
  simulationType: SimulationType
  candidateLoading: boolean
  productDescription: string
  formValues: Record<string, string>
  countries: PersonaCountryOption[]
  countryId: string
  onCountryChange: (countryId: string) => void
  sampleSize: number
  onSampleSizeChange: (size: number) => void
  personaPool: string
  onPersonaPoolChange: (pool: string) => void
  projectKind?: string | null
  summary: { product: string; customers: string; benefit: string; candidates: string }
  onAcceptCandidates: (candidates: CreativeCandidate[], assumptions: IntakeSlotValue[]) => void
  onConfirmAssumptions: () => void
  onFormValues: (updater: (current: Record<string, string>) => Record<string, string>) => void
  onRun: () => void
  onSubmitForm: (event: FormEvent) => void
  onSkipForm: () => void
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
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <button className="minsim-form-next-button" type="submit">{action.form.primaryAction}</button>
          {action.form.secondaryAction && (
            <button className="btn ghost" type="button" onClick={onSkipForm}>
              {action.form.secondaryAction}
            </button>
          )}
        </div>
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
      <AssumptionReviewPanel
        assumptions={action.assumptions}
        message={action.message}
        simulationType={simulationType}
        onConfirm={onConfirmAssumptions}
      />
    )
  }

  if (action.type === 'run_ready') {
    // sample_size/seed are controlled (or fixed) below — don't also chip them as "defaults".
    const defaults = action.assumptions.filter(
      (assumption) =>
        assumption.source === 'default' &&
        assumption.slotId !== 'sample_size' &&
        assumption.slotId !== 'seed',
    )
    // Skip empty "—" rows (poll packs don't fill product/customers/candidates).
    const summaryRows = (
      projectKind === 'poll'
        ? []
        : [
            { label: '제품', value: summary.product },
            { label: '고객', value: summary.customers },
            { label: '장점', value: summary.benefit },
            { label: '후보', value: summary.candidates },
          ]
    ).filter((row) => {
      const value = row.value.trim()
      return Boolean(value) && value !== '—'
    })

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

        <div className="minsim-run-setup" aria-label="실행 조건 선택">
          <div className="minsim-run-setup-head">
            <strong>실행 조건</strong>
            <span>시작 전에 아래 항목을 확인·선택하세요</span>
          </div>
          {summaryRows.length > 0 && (
            <div className="minsim-run-summary-grid" aria-label="입력 요약">
              {summaryRows.map((row) => (
                <SummaryRow key={row.label} label={row.label} value={row.value} />
              ))}
            </div>
          )}
          {projectKind !== 'poll' && (
            <CountryPicker countries={countries} value={countryId} onChange={onCountryChange} />
          )}
          <PanelSizePicker value={sampleSize} onSelect={onSampleSizeChange} />
          {countryId === 'kr' && (
            <PersonaPoolPicker value={personaPool} onSelect={onPersonaPoolChange} />
          )}
        </div>

        <button className="minsim-run-start-btn" type="button" onClick={onRun}>
          조건 확인하고 시뮬레이션 시작 →
        </button>
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
