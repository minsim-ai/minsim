import { requestJson } from './client'
import type { AuthSessionResponse } from '../types/api'

export function getAuthSession(): Promise<AuthSessionResponse> {
  return requestJson<AuthSessionResponse>('/api/auth/session')
}

export function googleLogin(next = '/app') {
  window.location.href = `/api/auth/google/login?next=${encodeURIComponent(next)}`
}

export function logout(next = '/') {
  window.location.href = `/api/auth/logout?next=${encodeURIComponent(next)}`
}
