import { requestJson } from './client'
import type { McpConnectResponse, McpGrant, McpGrantsResponse } from '../types/api'

export function getMcpConnect(): Promise<McpConnectResponse> {
  return requestJson<McpConnectResponse>('/api/mcp/connect')
}

export function listMcpGrants(): Promise<McpGrantsResponse> {
  return requestJson<McpGrantsResponse>('/api/mcp/grants')
}

export function revokeMcpGrant(grantId: string): Promise<{ grant: McpGrant }> {
  return requestJson<{ grant: McpGrant }>(`/api/mcp/grants/${encodeURIComponent(grantId)}`, {
    method: 'DELETE',
  })
}
