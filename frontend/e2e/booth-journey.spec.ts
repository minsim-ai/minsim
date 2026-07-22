import { expect, test, type Page } from '@playwright/test'

/**
 * The booth journey with DELIBERATELY minimal input — the exact class that
 * produced the 2026-07-16 live 422: user types one product sentence, leaves
 * every structured form blank, and clicks through to run.
 *
 * Pass criteria: no "API request failed" ever appears, the run starts, and
 * the results report renders to the final summary card.
 */

const PRODUCT_SENTENCE =
  '창업 관련 정보/교육 콘텐츠와 현지 창업 생태계 탐방을 결합한 여행 상품입니다. ' +
  '온라인 강의와 현지 멘토링, 네트워킹 이벤트를 포함합니다.'

const AUDIENCE_SENTENCE = '예비 창업자, 스타트업 종사자, 창업 교육 관심자 (25-45세)'

async function expectNoApiFailure(page: Page) {
  await expect(page.getByText(/API request failed/i)).toHaveCount(0)
}

test('booth minimal-input journey: project → 창업 아이템 검증 → run → report', async ({ page }) => {
  // 1. Create a project with only a name.
  await page.goto('/projects')
  await page.getByRole('button', { name: /새 프로젝트|첫 프로젝트 만들기/ }).first().click()
  await page.getByPlaceholder(/어르신 동반 강아지 로봇/).fill('창업 허브 탐방 여행')
  await page.getByRole('button', { name: /만들고 정보 등록/ }).click()
  await page.waitForURL('**/projects/**')

  // 2. Start a new simulation; the integrated validation type is the default.
  await page.getByRole('button', { name: '시뮬레이션 시작하기' }).click()
  await page.waitForURL('**/type**')
  await expect(page.getByRole('button', { name: /창업 아이템 검증/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: /이 유형으로 시작/ }).click()
  await page.waitForURL('**/intake**')

  // 3. Walk the intake with minimal effort: answer chat questions with one
  //    sentence, submit every structured form EMPTY, confirm assumptions.
  let chatAnswers = 0
  for (let step = 0; step < 14; step += 1) {
    await expectNoApiFailure(page)

    const runButton = page.getByRole('button', { name: /시뮬레이션 시작/ })
    if (await runButton.isVisible().catch(() => false)) {
      await runButton.click()
      break
    }

    const confirmButton = page.getByRole('button', { name: /가정 확인하고 계속/ })
    if (await confirmButton.isVisible().catch(() => false)) {
      await confirmButton.click()
      continue
    }

    const candidateButton = page.getByRole('button', { name: /후보.*진행|이 후보로 진행/ })
    if (await candidateButton.isVisible().catch(() => false)) {
      await candidateButton.click()
      continue
    }

    const formNext = page.getByRole('button', { name: /^다음$/ })
    if (await formNext.isVisible().catch(() => false)) {
      // The regression path: submit the structured form without typing.
      await formNext.click()
      continue
    }

    const chatBox = page.getByLabel('질문에 답변')
    if (await chatBox.isVisible().catch(() => false)) {
      await chatBox.fill(chatAnswers === 0 ? PRODUCT_SENTENCE : AUDIENCE_SENTENCE)
      chatAnswers += 1
      await page.getByRole('button', { name: /답변 전송/ }).click()
      continue
    }

    await page.waitForTimeout(400)
  }

  // 4. Run must start — never a raw API failure toast.
  await expectNoApiFailure(page)
  await page.waitForURL('**/loading**', { timeout: 20_000 })
  await expectNoApiFailure(page)

  // 5. Inline worker + fake LLM completes quickly; report must render.
  await page.waitForURL('**/results**', { timeout: 90_000 })
  await expect(page.getByText('한 장으로 보는 결론')).toBeVisible({ timeout: 30_000 })
  await expectNoApiFailure(page)
})
