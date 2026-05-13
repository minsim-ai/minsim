import { requestJson } from './client'
import type {
  DemoPreset,
  RunCreateRequest,
  RunCreateResponse,
  RunExportResponse,
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
