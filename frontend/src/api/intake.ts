import { requestJson } from './client'
import type {
  IntakeCandidateRequest,
  IntakeCandidateResponse,
  ProjectAutofillRequest,
  ProjectAutofillResponse,
  IntakeAdvanceRequest,
  IntakeAdvanceResponse,
  IntakeHistoryResponse,
  IntakeSessionListResponse,
  IntakeSessionResponse,
  IntakeSessionSaveRequest,
  IntakeSessionRunLinkRequest,
} from '../types/api'

export function advanceIntake(payload: IntakeAdvanceRequest): Promise<IntakeAdvanceResponse> {
  return requestJson<IntakeAdvanceResponse>('/api/intake/advance', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function saveIntakeSession(payload: IntakeSessionSaveRequest): Promise<IntakeSessionResponse> {
  return requestJson<IntakeSessionResponse>('/api/intake/sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateIntakeSession(
  sessionId: string,
  payload: IntakeSessionSaveRequest,
): Promise<IntakeSessionResponse> {
  return requestJson<IntakeSessionResponse>(`/api/intake/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function getIntakeSession(sessionId: string): Promise<IntakeSessionResponse> {
  return requestJson<IntakeSessionResponse>(`/api/intake/sessions/${encodeURIComponent(sessionId)}`)
}

export function listIntakeSessions(limit = 10): Promise<IntakeSessionListResponse> {
  return requestJson<IntakeSessionListResponse>(`/api/intake/sessions?limit=${encodeURIComponent(limit)}`)
}

export function listIntakeHistory(limit = 10): Promise<IntakeHistoryResponse> {
  return requestJson<IntakeHistoryResponse>(`/api/intake/history?limit=${encodeURIComponent(limit)}`)
}

export function linkIntakeSessionRun(
  sessionId: string,
  payload: IntakeSessionRunLinkRequest,
): Promise<IntakeSessionResponse> {
  return requestJson<IntakeSessionResponse>(`/api/intake/sessions/${encodeURIComponent(sessionId)}/run`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function generateIntakeCandidates(payload: IntakeCandidateRequest): Promise<IntakeCandidateResponse> {
  return requestJson<IntakeCandidateResponse>('/api/intake/candidates', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  })
}

export function autofillProject(payload: ProjectAutofillRequest): Promise<ProjectAutofillResponse> {
  return requestJson<ProjectAutofillResponse>('/api/intake/autofill', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25_000),
  })
}

export interface PolicyDraftResponse {
  fields: Record<string, string>
  ai_generated: string[]
}

/** 안건 한 줄에서 campus_policy 구조화 필드 초안을 받아온다. */
export function draftPolicyFields(
  agenda: string,
  fields: Record<string, string>,
): Promise<PolicyDraftResponse> {
  return requestJson<PolicyDraftResponse>('/api/intake/policy-draft', {
    method: 'POST',
    body: JSON.stringify({ agenda, fields }),
  })
}
