import { expect, test, type APIRequestContext } from '@playwright/test'

/**
 * 여론조사 프로젝트에 창업 아이템 검증 폼이 새는 것을 막는다.
 * 코드 게이트는 통과해도 화면은 틀릴 수 있어 실제 렌더로 확인한다.
 */
async function createProject(request: APIRequestContext, kind: 'poll' | 'venture') {
  const response = await request.post('/api/projects', {
    data: {
      name: `${kind} 갈래 확인 ${Date.now()}`,
      kind,
      description: '프로젝트 갈래 렌더 검증용',
    },
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json()
  return payload.data ?? payload
}

const VENTURE_ONLY_LABELS = ['기능', '가격', '대안/경쟁재', '제품 컨텍스트']

test('여론조사 프로젝트 상세에는 창업 검증 전용 칸이 없다', async ({ page, request }) => {
  const project = await createProject(request, 'poll')
  await page.goto(`/projects/${encodeURIComponent(project.project_id)}`)

  await expect(page.getByText('배경 정보', { exact: true })).toBeVisible()
  await expect(page.getByText('응답자 메모', { exact: true })).toBeVisible()
  for (const label of VENTURE_ONLY_LABELS) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(0)
  }
})

test('사업 아이템 검증 프로젝트 상세는 기존 칸을 유지한다', async ({ page, request }) => {
  const project = await createProject(request, 'venture')
  await page.goto(`/projects/${encodeURIComponent(project.project_id)}`)

  for (const label of VENTURE_ONLY_LABELS) {
    await expect(page.getByText(label, { exact: true })).toBeVisible()
  }
  await expect(page.getByText('배경 정보', { exact: true })).toHaveCount(0)
})

test('프로젝트 목록 카드가 갈래를 표시한다', async ({ page, request }) => {
  const poll = await createProject(request, 'poll')
  const venture = await createProject(request, 'venture')
  await page.goto('/projects')

  const pollCard = page.locator('.card', { hasText: poll.name })
  const ventureCard = page.locator('.card', { hasText: venture.name })
  await expect(pollCard.getByText('여론조사', { exact: true })).toBeVisible()
  await expect(ventureCard.getByText('사업 아이템 검증', { exact: true })).toBeVisible()
  // 여론조사 카드에 기능·가격 집계는 의미가 없다.
  await expect(pollCard.getByText(/^기능 \d+$/)).toHaveCount(0)
  await expect(ventureCard.getByText(/^기능 \d+$/)).toBeVisible()
})

test('여론조사 프로젝트는 이후 화면에서도 여론조사 라벨을 유지한다', async ({ page, request }) => {
  const project = await createProject(request, 'poll')
  await page.goto(`/projects/${encodeURIComponent(project.project_id)}/type`)

  // 유형 선택 카드의 라벨
  await expect(page.getByText('요금 변경', { exact: true }).first()).toBeVisible()
  // 창업 검증 쪽 라벨이 같은 화면에 섞이면 안 된다.
  await expect(page.getByText('가격 최적화', { exact: true })).toHaveCount(0)
})
