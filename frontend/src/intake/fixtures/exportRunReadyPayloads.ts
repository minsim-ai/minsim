/**
 * Executes the REAL intake planner to run_ready for every simulation type and
 * exports the payloads it would POST to /api/runs.
 *
 * Contract (closed after the 2026-07-16 booth 422): whenever the planner says
 * run_ready, the backend MUST accept the payload. Scenarios per type:
 *  - "full": replay the type's `complete` fixture event stream verbatim.
 *  - "blank": goal message, then vague chat answers and EMPTY structured-form
 *    submits — the booth failure mode. If the planner still reaches
 *    run_ready, that payload must ALSO be accepted by the backend.
 *
 * tests/test_intake_payload_contract.py consumes the exported JSON.
 */
import { advanceIntakeSession, createInitialIntakeSession } from '../planner'
import type { IntakeSession } from '../types'
import type { ProjectResponse, SimulationType } from '../../types/api'
import { createProjectIntakeSession } from '../../v2/projectIntake'
import { simulationIntakeV2Fixtures } from './simulationIntakeV2Fixtures'

export type ExportedPayload = {
  simulation_type: string
  scenario: 'full' | 'blank' | 'minimal' | 'project'
  ready: boolean
  steps: number
  stalled_action?: string
  payload?: unknown
}

// Mirrors the real booth entry: v2 intake always starts from a saved project
// (2026-07-16 failure came through this path, not a blank session).
const BOOTH_PROJECT: ProjectResponse = {
  project_id: 'harness-project',
  user_id: 'harness-user',
  name: '창업 허브 탐방 여행',
  description: '',
  kind: 'venture' as const,
  product_context: {
    product_description:
      '창업 관련 정보/교육 콘텐츠와 현지 창업 생태계 탐방을 결합한 여행 상품. ' +
      '온라인 강의 + 현지 멘토링 + 네트워킹 이벤트 포함. 5~7일 일정으로 실리콘밸리, 베를린 등 창업 허브 도시 중심 운영',
  },
  features: [],
  prices: [],
  target_notes: '예비 창업자, 스타트업 종사자, 창업 교육 관심자 (25-45세)',
  alternatives: [],
  created_at: '2026-07-16T00:00:00Z',
  updated_at: '2026-07-16T00:00:00Z',
  archived_at: null,
}

const MAX_STEPS = 14
const VAGUE_ANSWER = '잘 모르겠어요. 알아서 진행해주세요.'

function freshSession(): IntakeSession {
  return { ...createInitialIntakeSession(), messages: [], action: null }
}

function replayComplete(simulationType: string): ExportedPayload {
  const fixture = simulationIntakeV2Fixtures.find(
    (item) => item.category === 'complete' && item.expectedSimulationType === simulationType,
  )
  if (!fixture) {
    return { simulation_type: simulationType, scenario: 'full', ready: false, steps: 0, stalled_action: 'no_complete_fixture' }
  }
  let session = freshSession()
  let steps = 0
  for (const event of fixture.events) {
    session = advanceIntakeSession(session, event)
    steps += 1
    // Accept generated candidates / confirm assumptions when they gate the run.
    session = drainInteractiveGates(session)
  }
  const action = session.action
  if (action?.type === 'run_ready') {
    return { simulation_type: simulationType, scenario: 'full', ready: true, steps, payload: action.payload }
  }
  return {
    simulation_type: simulationType,
    scenario: 'full',
    ready: false,
    steps,
    stalled_action: action?.type ?? 'none',
  }
}

function drainInteractiveGates(session: IntakeSession): IntakeSession {
  let current = session
  for (let index = 0; index < 3; index += 1) {
    const action = current.action
    if (action?.type === 'candidate_review') {
      current = advanceIntakeSession(current, {
        type: 'candidate_accept',
        candidates: action.candidates,
        assumptions: action.assumptions,
      })
    } else if (action?.type === 'confirm_assumptions') {
      current = advanceIntakeSession(current, { type: 'confirm_assumptions' })
    } else {
      break
    }
  }
  return current
}

function firstUserMessage(simulationType: string, category: 'goal_only' | 'messy'): string | null {
  const fixture = simulationIntakeV2Fixtures.find(
    (item) => item.category === category && item.expectedSimulationType === simulationType,
  )
  const event = fixture?.events[0]
  return event && event.type === 'user_message' ? event.content : null
}

function projectWalk(simulationType: string): ExportedPayload {
  let session = createProjectIntakeSession(BOOTH_PROJECT, simulationType as SimulationType)
  let previousActionType = ''
  let repeats = 0
  for (let step = 1; step <= MAX_STEPS; step += 1) {
    session = drainInteractiveGates(session)
    const action = session.action
    if (action?.type === 'run_ready') {
      return { simulation_type: simulationType, scenario: 'project', ready: true, steps: step, payload: action.payload }
    }
    if (action?.type === previousActionType) {
      repeats += 1
      if (repeats >= 3) break
    } else {
      repeats = 0
      previousActionType = action?.type ?? ''
    }
    if (action?.type === 'show_form') {
      session = advanceIntakeSession(session, {
        type: 'form_submit',
        values: Object.fromEntries(action.form.fields.map((field) => [field.id, ''])),
      })
    } else if (action?.type === 'ask_question' || action?.type === 'repair_input') {
      session = advanceIntakeSession(session, { type: 'user_message', content: VAGUE_ANSWER })
    } else {
      break
    }
  }
  return {
    simulation_type: simulationType,
    scenario: 'project',
    ready: false,
    steps: MAX_STEPS,
    stalled_action: session.action?.type ?? 'none',
  }
}

function sparseWalk(simulationType: string, scenario: 'blank' | 'minimal'): ExportedPayload {
  const goal =
    firstUserMessage(simulationType, 'goal_only') ??
    `${simulationType} 시뮬레이션을 실행하고 싶어요.`
  // "minimal" mirrors the 2026-07-16 booth flow: the user gives one rich chat
  // answer, then leaves every structured form blank.
  const chatAnswer =
    scenario === 'minimal'
      ? firstUserMessage(simulationType, 'messy') ?? goal
      : VAGUE_ANSWER

  let session = advanceIntakeSession(freshSession(), {
    type: 'user_message',
    content: goal,
    selectedSimulationType: simulationType as never,
  })
  let previousActionType = ''
  let repeats = 0
  for (let step = 1; step <= MAX_STEPS; step += 1) {
    session = drainInteractiveGates(session)
    const action = session.action
    if (action?.type === 'run_ready') {
      return { simulation_type: simulationType, scenario, ready: true, steps: step, payload: action.payload }
    }
    if (action?.type === previousActionType) {
      repeats += 1
      // The planner keeps asking for the same thing on sparse answers: it
      // correctly refuses to run without the input. Valid outcome.
      if (repeats >= 3) break
    } else {
      repeats = 0
      previousActionType = action?.type ?? ''
    }
    if (action?.type === 'show_form') {
      session = advanceIntakeSession(session, {
        type: 'form_submit',
        values: Object.fromEntries(action.form.fields.map((field) => [field.id, ''])),
      })
    } else if (action?.type === 'ask_question' || action?.type === 'repair_input') {
      session = advanceIntakeSession(session, { type: 'user_message', content: chatAnswer })
    } else {
      break
    }
  }
  return {
    simulation_type: simulationType,
    scenario,
    ready: false,
    steps: MAX_STEPS,
    stalled_action: session.action?.type ?? 'none',
  }
}

export function exportRunReadyPayloads(): ExportedPayload[] {
  const simulationTypes = [
    ...new Set(
      simulationIntakeV2Fixtures
        .map((fixture) => fixture.expectedSimulationType)
        .filter((value): value is string => Boolean(value)),
    ),
  ]
  return simulationTypes.flatMap((simulationType) => [
    replayComplete(simulationType),
    sparseWalk(simulationType, 'blank'),
    sparseWalk(simulationType, 'minimal'),
    projectWalk(simulationType),
  ])
}
