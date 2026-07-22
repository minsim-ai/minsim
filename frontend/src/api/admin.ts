import { requestJson } from './client'
import type {
  AdminExportResponse,
  AdminListResponse,
  AdminMutationResponse,
  AdminOverviewResponse,
} from '../types/api'

function sensitiveParam(includeSensitive = false): string {
  return `include_sensitive=${includeSensitive ? 'true' : 'false'}`
}

export function getAdminOverview(includeSensitive = false): Promise<AdminOverviewResponse> {
  return requestJson<AdminOverviewResponse>(`/api/admin/overview?${sensitiveParam(includeSensitive)}`)
}

export function getAdminUsers(limit = 50, includeSensitive = false): Promise<AdminListResponse> {
  return requestJson<AdminListResponse>(
    `/api/admin/users?limit=${encodeURIComponent(limit)}&${sensitiveParam(includeSensitive)}`,
  )
}

export function getAdminRuns(limit = 50, includeSensitive = false): Promise<AdminListResponse> {
  return requestJson<AdminListResponse>(
    `/api/admin/runs?limit=${encodeURIComponent(limit)}&${sensitiveParam(includeSensitive)}`,
  )
}

export function getAdminFeedback(limit = 50, includeSensitive = false): Promise<AdminListResponse> {
  return requestJson<AdminListResponse>(
    `/api/admin/feedback?limit=${encodeURIComponent(limit)}&${sensitiveParam(includeSensitive)}`,
  )
}

export function getAdminExport(includeSensitive = false): Promise<AdminExportResponse> {
  return requestJson<AdminExportResponse>(`/api/admin/export?${sensitiveParam(includeSensitive)}`)
}

export function pruneAdminRetention(payload: {
  retention_days: number
  dry_run: boolean
  confirm: boolean
}): Promise<AdminMutationResponse> {
  return requestJson<AdminMutationResponse>('/api/admin/retention/prune', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function deleteAdminUser(userId: string): Promise<AdminMutationResponse> {
  return requestJson<AdminMutationResponse>(`/api/admin/users/${encodeURIComponent(userId)}/delete`, {
    method: 'POST',
    body: JSON.stringify({ confirm_user_id: userId }),
  })
}
