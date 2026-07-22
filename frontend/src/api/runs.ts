import { requestJson } from './client'
import type {
  DemoPreset,
  RunCreateRequest,
  RunCreateResponse,
  RunExportResponse,
  RunFeedbackRequest,
  RunFeedbackResponse,
  RunPartialResultsResponse,
  RunResultEnvelope,
  RunSnapshot,
} from '../types/api'

export function getPresets(): Promise<DemoPreset[]> {
  return requestJson<DemoPreset[]>('/api/presets')
}

export function createRun(payload: RunCreateRequest): Promise<RunCreateResponse> {
  return requestJson<RunCreateResponse>('/api/runs', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getRun(runId: string): Promise<RunSnapshot> {
  return requestJson<RunSnapshot>(`/api/runs/${encodeURIComponent(runId)}`)
}

export function getRunResult(runId: string): Promise<RunResultEnvelope> {
  return requestJson<RunResultEnvelope>(`/api/runs/${encodeURIComponent(runId)}/result`)
}

export function getRunPartials(runId: string): Promise<RunPartialResultsResponse> {
  return requestJson<RunPartialResultsResponse>(`/api/runs/${encodeURIComponent(runId)}/partials`)
}

export function cancelRun(runId: string): Promise<RunSnapshot> {
  return requestJson<RunSnapshot>(`/api/runs/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
  })
}

export function getRunExport(runId: string): Promise<RunExportResponse> {
  return requestJson<RunExportResponse>(`/api/runs/${encodeURIComponent(runId)}/export`)
}

export function submitRunFeedback(runId: string, payload: RunFeedbackRequest): Promise<RunFeedbackResponse> {
  return requestJson<RunFeedbackResponse>(`/api/runs/${encodeURIComponent(runId)}/feedback`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}


export interface SurveyQuestion {
  kind: string
  text: string
  options: string[]
}

export interface SurveyExportResponse {
  agenda: string
  markdown: string
  plain_text: string
  questions: SurveyQuestion[]
}

/** 시뮬 결과를 실제 설문 문항으로 변환한다. 시뮬은 사전 탐색, 실제 설문이 검증이다. */
export function getRunSurvey(runId: string): Promise<SurveyExportResponse> {
  return requestJson<SurveyExportResponse>(`/api/runs/${encodeURIComponent(runId)}/survey`)
}
