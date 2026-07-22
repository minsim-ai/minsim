import { expect, type APIRequestContext, type APIResponse } from '@playwright/test'

/**
 * Playwright APIRequestContext does not run SPA JS, so it must manually
 * bootstrap the double-submit CSRF cookie/header the browser client sends.
 */
export async function ensureCsrfToken(request: APIRequestContext): Promise<string> {
  await request.get('/api/auth/session')
  const state = await request.storageState()
  const token = state.cookies.find((cookie) => cookie.name === 'koresim_csrf')?.value
  expect(token, 'koresim_csrf cookie should be issued by the API').toBeTruthy()
  return token as string
}

export async function apiPost(
  request: APIRequestContext,
  path: string,
  data: unknown,
): Promise<APIResponse> {
  const csrf = await ensureCsrfToken(request)
  return request.post(path, {
    data,
    headers: { 'X-CSRF-Token': csrf },
  })
}

export async function apiPatch(
  request: APIRequestContext,
  path: string,
  data: unknown,
): Promise<APIResponse> {
  const csrf = await ensureCsrfToken(request)
  return request.patch(path, {
    data,
    headers: { 'X-CSRF-Token': csrf },
  })
}
