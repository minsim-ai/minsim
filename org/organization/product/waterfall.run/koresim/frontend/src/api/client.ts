import type { ErrorResponse } from '../types/api'

export class APIError extends Error {
  status: number
  payload: ErrorResponse | null

  constructor(status: number, payload: ErrorResponse | null, message: string) {
    super(message)
    this.name = 'APIError'
    this.status = status
    this.payload = payload
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
    throw new APIError(response.status, null, await readNonJsonErrorMessage(response))
  }

  if (!response.ok) {
    const payload = await readErrorPayload(response)
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
    return (data.detail ?? data) as ErrorResponse
  } catch {
    return null
  }
}

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type') ?? ''
  return contentType.includes('application/json')
}

async function readNonJsonErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  if (isAccessChallenge(response, text)) {
    return 'Cloudflare Access 인증이 필요합니다. 보호된 경로에서 로그인한 뒤 다시 시도하세요.'
  }
  return defaultErrorMessage(response.status)
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
