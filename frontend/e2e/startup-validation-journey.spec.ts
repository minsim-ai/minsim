import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { apiPost } from './helpers/api'

/**
 * The founder journey with a REALISTIC filled-in MVP idea — the counterpart to
 * booth-journey.spec.ts's deliberately-empty path. Drives startup_item_validation
 * intake with concrete Korean answers, asserts the resulting report renders real
 * content, then exercises the post-results follow-up and export actions.
 */

const ITEM_DESCRIPTION =
  '소상공인을 위한 AI 재고관리 SaaS입니다. POS 데이터를 실시간으로 분석해 발주 시점과 ' +
  '수량을 자동으로 추천합니다. 월 구독형으로 제공됩니다.'

const PROBLEM_STATEMENT =
  '소규모 매장 사장님들은 재고를 감으로 발주해 품절과 과잉재고를 반복적으로 겪습니다. ' +
  '특히 명절이나 행사 시즌에 손실이 큽니다.'

const KEY_FEATURES = '실시간 재고 대시보드\nAI 자동 발주 추천\n판매 데이터 기반 수요 예측'
const ALTERNATIVES = '엑셀 수기 관리\n기존 POS 부가기능\n전문 재고관리 소프트웨어'
const TARGET_CUSTOMERS = '동네 마트 사장님\n소규모 카페 운영자\n편의점 점주'
const PRICE_HINT = '월 39,000원'

const FOLLOWUP_QUESTION = '가격이 부담스럽다고 답한 응답자들은 어떤 조건이면 다시 고려할까요?'

async function expectNoApiFailure(page: Page) {
  await expect(page.getByText(/API request failed/i)).toHaveCount(0)
}

async function createVentureProject(request: APIRequestContext): Promise<string> {
  const response = await apiPost(request, '/api/projects', {
    name: `AI 재고관리 SaaS 검증 ${Date.now()}`,
    kind: 'venture',
    description: '소상공인 대상 AI 재고관리 SaaS의 시장 수용도 검증',
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json()
  const project = payload.data ?? payload
  return project.project_id as string
}

function answerForFormField(labelText: string): string {
  if (labelText.includes('가격')) return PRICE_HINT
  if (labelText.includes('기능')) return KEY_FEATURES
  if (labelText.includes('대안') || labelText.includes('경쟁')) return ALTERNATIVES
  if (labelText.includes('고객')) return TARGET_CUSTOMERS
  return ITEM_DESCRIPTION
}

test.describe('startup item validation journey', () => {
  test('rich-input founder journey: project → intake → run → report → follow-up → export', async ({
    page,
    request,
  }) => {
    const projectId = await createVentureProject(request)
    await page.goto(`/projects/${encodeURIComponent(projectId)}`)

    await page.getByRole('button', { name: '시뮬레이션 시작하기' }).click()
    await page.waitForURL('**/type**')
    await expect(page.getByRole('button', { name: /창업 아이템 검증/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByRole('button', { name: /이 유형으로 시작/ }).click()
    await page.waitForURL('**/intake**')

    let chatAnswers = 0
    for (let step = 0; step < 24; step += 1) {
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

      const formFields = page.locator('.minsim-form-field')
      const formFieldCount = await formFields.count()
      if (formFieldCount > 0) {
        for (let fieldIndex = 0; fieldIndex < formFieldCount; fieldIndex += 1) {
          const field = formFields.nth(fieldIndex)
          const labelText = (await field.locator('strong').innerText()).trim()
          await field.locator('textarea, input').fill(answerForFormField(labelText))
        }
        await page.getByRole('button', { name: /^다음$/ }).click()
        continue
      }

      const chatBox = page.getByLabel('질문에 답변')
      if (await chatBox.isVisible().catch(() => false)) {
        await chatBox.fill(chatAnswers === 0 ? ITEM_DESCRIPTION : PROBLEM_STATEMENT)
        chatAnswers += 1
        await page.getByRole('button', { name: /답변 전송/ }).click()
        continue
      }

      await page.waitForTimeout(400)
    }

    await expectNoApiFailure(page)
    await page.waitForURL('**/loading**', { timeout: 20_000 })
    await expectNoApiFailure(page)

    const resultResponsePromise = page.waitForResponse(
      (response) => /\/runs\/[^/]+\/result$/.test(new URL(response.url()).pathname) && response.ok(),
      { timeout: 90_000 },
    )
    await page.waitForURL('**/results**', { timeout: 90_000 })
    const resultResponse = await resultResponsePromise
    const resultBody = await resultResponse.json()
    await expectNoApiFailure(page)

    await expect(page.getByText('한 장으로 보는 결론')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/표본|응답 표본/).first()).toBeVisible()

    const runId = resultBody.run_id as string
    expect(runId).toBeTruthy()

    // Golden values captured from a real run of this exact intake flow against
    // LLM_BACKEND=fake. The fake backend seeds purely off persona_uuid + sample
    // size, so these numbers are stable regardless of the founder input text —
    // verified reproducible across two consecutive runs.
    const metrics = resultBody.metrics as Record<string, unknown>
    expect(metrics.protocol_id).toBe('startup_item_validation_v2')
    expect(metrics.intent_counts).toEqual({ 수용: 117, 관망: 53, 거부: 30 })
    expect(metrics.intent_pct).toEqual({ 수용: 58.5, 관망: 26.5, 거부: 15 })
    expect(metrics.wtp_median).toBe(129000)
    expect(metrics.wtp_p25).toBe(99000)
    expect(metrics.wtp_p75).toBe(129000)
    expect(metrics.barrier_counts).toEqual({ 가격부담: 24, 신뢰부족: 28, 필요성낮음: 31 })
    expect(metrics.need_category_counts).toEqual({ 건강: 47, 불안해소: 85, 시간절약: 68 })
    expect(metrics.segment_counts).toEqual({
      적극수용층: 35,
      실용검토층: 45,
      가격민감층: 36,
      대안만족층: 49,
      무관심층: 35,
    })
    expect(metrics.conditional_yes_count).toBe(51)
    expect(metrics.conditional_yes_rate).toBe(25.5)

    // Post-results action B.1: submit a follow-up question in the Research Workspace.
    await page.getByRole('textbox', { name: '후속 질문' }).fill(FOLLOWUP_QUESTION)
    const followupResponsePromise = page.waitForResponse(
      (response) => /\/runs\/[^/]+\/followup$/.test(new URL(response.url()).pathname),
      { timeout: 30_000 },
    )
    await page.getByRole('button', { name: /8명에게 묻기/ }).click()
    await followupResponsePromise
    await expect(page.locator('.research-followup-list article').first()).toBeVisible({ timeout: 30_000 })
    await expectNoApiFailure(page)

    // Post-results action B.2: redacted export must never include raw_results.
    // The results-page export buttons render the report client-side (no network
    // call) once buildMinsimReport succeeds, so we hit the export endpoint
    // directly to verify the data-governance contract for this run.
    const exportResponse = await page.request.get(
      `/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/export`,
    )
    expect(exportResponse.ok()).toBeTruthy()
    const exportBody = await exportResponse.json()
    expect(exportBody).not.toHaveProperty('raw_results')
    expect(JSON.stringify(exportBody)).not.toContain('"raw_results"')
  })
})
