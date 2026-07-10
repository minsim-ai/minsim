import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createProjectRun, getProject } from '../api/projects'
import { advanceIntakeSession, createInitialIntakeSession } from '../intake/planner'
import { buildGenericSimulationPayload, validateCreativeTestingPayload } from '../intake/payloadBuilder'
import { createSlot, upsertSlot } from '../intake/slotUtils'
import type { DynamicFormField, IntakeSession } from '../intake/types'
import type { ProjectResponse, SimulationType } from '../types/api'
import { navigateTo } from './navigation'

export function MinsimIntakeFlow({
  projectId,
  simulationType,
}: {
  projectId: string
  simulationType: SimulationType | null
}) {
  const [project, setProject] = useState<ProjectResponse | null>(null)
  const [session, setSession] = useState<IntakeSession>(() => createInitialIntakeSession())
  const [message, setMessage] = useState('')
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const type = simulationType ?? 'creative_testing'

  useEffect(() => {
    getProject(projectId)
      .then(setProject)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [projectId])

  useEffect(() => {
    if (!project) return
    setSession((current) => withProjectDefaults(current, project, type))
  }, [project, type])

  const payload = useMemo(() => buildGenericSimulationPayload(session), [session])
  const creativeErrors = payload.simulation_type === 'creative_testing' ? validateCreativeTestingPayload(payload) : []
  const action = session.action

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
    if (creativeErrors.length > 0) {
      setError(creativeErrors[0].message)
      return
    }
    try {
      const response = await createProjectRun(projectId, {
        ...payload,
        simulation_type: type,
        run_label: `${project?.name ?? 'Project'} ${new Date().toLocaleDateString('ko-KR')}`,
      })
      navigateTo(`/loading?project_id=${encodeURIComponent(projectId)}&run_id=${encodeURIComponent(response.run.run_id)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className="v2-intake">
      <div className="v2-page-head">
        <div>
          <p className="v2-kicker">{project?.name ?? 'Project'}</p>
          <h1>입력값을 정리합니다</h1>
        </div>
        <button type="button" onClick={run}>실행</button>
      </div>

      <div className="v2-chat-panel">
        {session.messages.map((item, index) => (
          <p className={`v2-chat-line ${item.role}`} key={`${item.role}-${index}`}>
            {item.content}
          </p>
        ))}
        {action?.type === 'show_form' && (
          <form className="v2-dynamic-form" onSubmit={submitForm}>
            {action.form.fields.map((field) => (
              <label key={field.id}>
                <span>{field.label}</span>
                {field.type === 'textarea' || field.type === 'multi_text' ? (
                  <textarea
                    value={formValues[field.id] ?? valueToString(field.value)}
                    onChange={(event) => setFormValues((current) => ({ ...current, [field.id]: event.target.value }))}
                    rows={4}
                  />
                ) : (
                  <input
                    value={formValues[field.id] ?? valueToString(field.value)}
                    onChange={(event) => setFormValues((current) => ({ ...current, [field.id]: event.target.value }))}
                  />
                )}
              </label>
            ))}
            <button type="submit">반영</button>
          </form>
        )}
        <div className="v2-chat-input">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') send()
            }}
            aria-label="입력 메시지"
          />
          <button type="button" onClick={send}>보내기</button>
        </div>
      </div>
      {error && <p className="v2-error">{error}</p>}
    </section>
  )
}

function withProjectDefaults(session: IntakeSession, project: ProjectResponse, type: SimulationType): IntakeSession {
  const projectText = stringFromProject(project)
  let slots = session.slots
  if (projectText) {
    slots = upsertSlot(slots, createSlot('product_description', projectText, 'default', 0.9, 'project', false))
    slots = upsertSlot(slots, createSlot('product_context', projectText, 'default', 0.9, 'project', false))
  }
  if (project.features.length > 0) {
    slots = upsertSlot(slots, createSlot('key_features', project.features, 'default', 0.9, 'project', false))
  }
  if (project.prices.length > 0) {
    slots = upsertSlot(slots, createSlot('price_points', project.prices, 'default', 0.9, 'project', false))
  }
  if (project.alternatives.length > 0) {
    slots = upsertSlot(slots, createSlot('products', project.alternatives, 'default', 0.72, 'project', false))
  }
  return {
    ...session,
    slots,
    taskFrame: {
      taskId: session.taskFrame?.taskId ?? `v2-${type}`,
      userGoal: session.taskFrame?.userGoal ?? project.description ?? '',
      decisionQuestion: session.taskFrame?.decisionQuestion ?? '어떤 선택지가 더 설득력 있는가?',
      likelySimulationTypes: session.taskFrame?.likelySimulationTypes ?? [type],
      primarySimulationType: type,
      preSimulationActions: type === 'creative_testing' ? ['generate_creative_candidates'] : [],
      confidence: 0.8,
      evidence: session.taskFrame?.evidence ?? ['project context'],
    },
  }
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

function stringFromProject(project: ProjectResponse): string {
  const description = project.product_context.product_description
  if (typeof description === 'string' && description.trim()) return description
  return [project.description, ...project.features].filter(Boolean).join('\n')
}
