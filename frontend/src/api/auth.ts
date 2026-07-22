import { requestJson } from './client'
import type {
  AuthSessionResponse,
  UserOnboardingRequest,
  UserOnboardingResponse,
  UserUsageResponse,
} from '../types/api'

export function getAuthSession(): Promise<AuthSessionResponse> {
  return requestJson<AuthSessionResponse>('/api/auth/session')
}

export function getUserUsage(): Promise<UserUsageResponse> {
  return requestJson<UserUsageResponse>('/api/me/usage')
}

export function getUserOnboarding(): Promise<UserOnboardingResponse> {
  return requestJson<UserOnboardingResponse>('/api/me/onboarding')
}

export function saveUserOnboarding(payload: UserOnboardingRequest): Promise<UserOnboardingResponse> {
  return requestJson<UserOnboardingResponse>('/api/me/onboarding', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function googleLogin(next = '/projects') {
  window.location.href = `/api/auth/google/login?next=${encodeURIComponent(next)}`
}

export function logout(next = '/') {
  window.location.href = `/api/auth/logout?next=${encodeURIComponent(next)}`
}

/** Relative path only; blocks open redirects. */
export function safeAuthNext(raw: string | null | undefined, fallback = '/projects'): string {
  if (!raw) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback
  if (raw.startsWith('/login') || raw.startsWith('/api/auth/')) return fallback
  return raw
}

export function loginPageHref(next = '/projects'): string {
  return `/login?next=${encodeURIComponent(safeAuthNext(next))}`
}
