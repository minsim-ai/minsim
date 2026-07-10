import { requestJson } from './client'
import type {
  ProjectCreateRequest,
  ProjectListResponse,
  ProjectResponse,
  ProjectRunCreateRequest,
  ProjectRunCreateResponse,
  ProjectRunFollowupRequest,
  ProjectRunFollowupResponse,
  ProjectRunInterviewRequest,
  ProjectRunInterviewResponse,
  ProjectRunListResponse,
  ProjectUpdateRequest,
  RunExportResponse,
  RunFeedbackRequest,
  RunFeedbackResponse,
  RunResultEnvelope,
} from '../types/api'

const enc = encodeURIComponent

export function listProjects(): Promise<ProjectListResponse> {
  return requestJson<ProjectListResponse>('/api/projects')
}

export function createProject(payload: ProjectCreateRequest): Promise<ProjectResponse> {
  return requestJson<ProjectResponse>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getProject(projectId: string): Promise<ProjectResponse> {
  return requestJson<ProjectResponse>(`/api/projects/${enc(projectId)}`)
}

export function updateProject(projectId: string, payload: ProjectUpdateRequest): Promise<ProjectResponse> {
  return requestJson<ProjectResponse>(`/api/projects/${enc(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function archiveProject(projectId: string): Promise<ProjectResponse> {
  return requestJson<ProjectResponse>(`/api/projects/${enc(projectId)}/archive`, {
    method: 'POST',
  })
}

export function listProjectRuns(projectId: string): Promise<ProjectRunListResponse> {
  return requestJson<ProjectRunListResponse>(`/api/projects/${enc(projectId)}/runs`)
}

export function createProjectRun(
  projectId: string,
  payload: ProjectRunCreateRequest,
): Promise<ProjectRunCreateResponse> {
  return requestJson<ProjectRunCreateResponse>(`/api/projects/${enc(projectId)}/runs`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getProjectRunResult(projectId: string, runId: string): Promise<RunResultEnvelope> {
  return requestJson<RunResultEnvelope>(`/api/projects/${enc(projectId)}/runs/${enc(runId)}/result`)
}

export function getProjectRunExport(projectId: string, runId: string): Promise<RunExportResponse> {
  return requestJson<RunExportResponse>(`/api/projects/${enc(projectId)}/runs/${enc(runId)}/export`)
}

export function submitProjectRunFeedback(
  projectId: string,
  runId: string,
  payload: RunFeedbackRequest,
): Promise<RunFeedbackResponse> {
  return requestJson<RunFeedbackResponse>(`/api/projects/${enc(projectId)}/runs/${enc(runId)}/feedback`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function askProjectRunFollowup(
  projectId: string,
  runId: string,
  payload: ProjectRunFollowupRequest,
): Promise<ProjectRunFollowupResponse> {
  return requestJson<ProjectRunFollowupResponse>(`/api/projects/${enc(projectId)}/runs/${enc(runId)}/followup`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function askProjectRunInterview(
  projectId: string,
  runId: string,
  payload: ProjectRunInterviewRequest,
): Promise<ProjectRunInterviewResponse> {
  return requestJson<ProjectRunInterviewResponse>(`/api/projects/${enc(projectId)}/runs/${enc(runId)}/interview`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
