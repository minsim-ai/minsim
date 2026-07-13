import { requestJson } from './client'
import type {
  IntakeCandidateRequest,
  IntakeCandidateResponse,
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
