import type { ErrorResponse } from '../types/api'

export class APIError extends Error {
  status: number
  payload: ErrorResponse | null
  reason: 'auth_required' | 'access_required' | 'api_error'

  constructor(
    status: number,
    payload: ErrorResponse | null,
    message: string,
    reason: 'auth_required' | 'access_required' | 'api_error' = 'api_error',
  ) {
    super(message)
    this.name = 'APIError'
    this.status = status
    this.payload = payload
    this.reason = reason
  }
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!isJsonResponse(response)) {
    const nonJsonError = await readNonJsonError(response, path)
    throw new APIError(response.status, null, nonJsonError.message, nonJsonError.reason)
  }

  if (!response.ok) {
    const payload = await readErrorPayload(response)
    if (response.status === 401 || String(payload?.code ?? '') === 'AUTH_REQUIRED') {
      throw new APIError(
        response.status,
        payload,
        '로그인이 필요합니다. Google 계정으로 로그인한 뒤 데모를 실행해주세요.',
        'auth_required',
      )
    }
    throw new APIError(
      response.status,
      payload,
      payload?.message ?? defaultErrorMessage(response.status),
    )
  }

  return response.json() as Promise<T>
}

async function readErrorPayload(response: Response): Promise<ErrorResponse | null> {
  try {
    const data = await response.json()
    const detail = data.detail ?? data
    if (Array.isArray(detail)) {
      const issues = detail
        .filter(isValidationIssue)
        .map((issue) => `${formatValidationLocation(issue.loc)}: ${issue.msg}`)
      return {
        code: 'INVALID_REQUEST',
        message: issues.length > 0 ? `입력값을 확인해주세요. ${issues.join(' ')}` : '입력값을 확인해주세요.',
      }
    }
    return detail as ErrorResponse
  } catch {
    return null
  }
}

function isValidationIssue(value: unknown): value is { loc: unknown; msg: unknown } {
  return value !== null && typeof value === 'object' && 'loc' in value && 'msg' in value
}

function formatValidationLocation(location: unknown): string {
  if (!Array.isArray(location)) return '요청'
  const path = location.filter((part) => part !== 'body').join('.')
  return path || '요청'
}

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type') ?? ''
  return contentType.includes('application/json')
}

async function readNonJsonError(
  response: Response,
  path: string,
): Promise<{ message: string; reason: 'auth_required' | 'access_required' | 'api_error' }> {
  const text = await response.text().catch(() => '')
  if (isAppLoginChallenge(response, text) || isProtectedApiHtmlFallback(path, text)) {
    return {
      message: '로그인이 필요합니다. Google 계정으로 로그인한 뒤 데모를 실행해주세요.',
      reason: 'auth_required',
    }
  }
  if (isAccessChallenge(response, text)) {
    return {
      message: '보호된 경로입니다. 접근 권한이 있는 계정으로 로그인한 뒤 다시 시도해주세요.',
      reason: 'access_required',
    }
  }
  return { message: defaultErrorMessage(response.status), reason: 'api_error' }
}

function isAppLoginChallenge(response: Response, body: string): boolean {
  const marker = `${response.url}\n${body}`.toLowerCase()
  return (
    marker.includes('/api/auth/google/login') ||
    marker.includes('accounts.google.com') ||
    marker.includes('sign in - google accounts') ||
    marker.includes('google 계정') ||
    marker.includes('google 로그인')
  )
}

function isProtectedApiHtmlFallback(path: string, body: string): boolean {
  const marker = body.toLowerCase()
  return (
    path.startsWith('/api/') &&
    marker.includes('<!doctype html') &&
    (marker.includes('id="root"') || marker.includes('/src/main') || marker.includes('arabesque'))
  )
}

function isAccessChallenge(response: Response, body: string): boolean {
  const location = response.headers.get('location') ?? response.url
  const marker = `${location}\n${body}`.toLowerCase()
  return (
    response.redirected ||
    marker.includes('/cdn-cgi/access') ||
    marker.includes('cloudflare access') ||
    marker.includes('access denied')
  )
}

function defaultErrorMessage(status: number): string {
  return `API request failed with status ${status}`
}

/** Prefer server-provided message; map browser timeouts to a clear Korean fallback. */
export function userFacingErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof APIError && err.message.trim()) {
    return err.message
  }
  if (
    (err instanceof DOMException || err instanceof Error) &&
    (err.name === 'TimeoutError' || err.name === 'AbortError')
  ) {
    return '요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message
  }
  return fallback
}
