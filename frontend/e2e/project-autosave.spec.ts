import { expect, test, type APIRequestContext } from '@playwright/test'
import { apiPost } from './helpers/api'

/**
 * 저장하지 않은 편집을 남긴 채 시뮬레이션으로 넘어가면 인테이크가 서버의 옛 값을 읽는다.
 * 프로덕션 run 7a6184c8에서 지운 줄 알았던 "3천원"이 프롬프트에 그대로 들어가
 * 200명 중 170명이 가격 후보 밖 금액을 답했다.
 */
async function createProject(request: APIRequestContext) {
  const response = await apiPost(request, '/api/projects', {
    name: `자동저장 확인 ${Date.now()}`,
    description: '옛 설명 · 3천원',
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json()
  return payload.data ?? payload
}

test('시뮬레이션 시작 전에 편집이 저장된다', async ({ page, request }) => {
  const project = await createProject(request)
  await page.goto(`/projects/${encodeURIComponent(project.project_id)}`)

  const description = page.locator('.minsim-description-field')
  await expect(description).toHaveValue('옛 설명 · 3천원')
  await description.fill('가격 문구를 뺀 새 설명')

  await page.getByRole('button', { name: '시뮬레이션 시작하기' }).click()
  await page.waitForURL(/\/type/)

  const saved = await request.get(`/api/projects/${encodeURIComponent(project.project_id)}`)
  const body = await saved.json()
  expect((body.data ?? body).description).toBe('가격 문구를 뺀 새 설명')
})


