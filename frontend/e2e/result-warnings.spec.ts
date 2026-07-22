import { expect, test } from '@playwright/test'
import { minsimResultFixture } from '../src/v2/fixtures/minsimResultFixture'

/**
 * 집계 경고가 결과 최상단에 보이는지 확인한다.
 * 프로덕션 run 7a6184c8에서 200명 중 170명이 후보에 없는 가격을 골랐는데
 * 화면에는 아무 표시도 없었다.
 */
const WARNING =
  '응답자 170명(85.0%)이 제시한 가격 후보에 없는 금액을 골랐습니다 (3,000원 170명).'

test('집계 경고가 결과 상단에 표시된다', async ({ page }) => {
  await page.route('**/api/projects/warn-demo**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/runs/warn-run/result')) {
      await route.fulfill({
        json: {
          ...minsimResultFixture,
          run_id: 'warn-run',
          simulation_type: 'price_optimization',
          metrics: {
            ...(minsimResultFixture.metrics as Record<string, unknown>),
            warnings: [WARNING],
          },
        },
      })
      return
    }
    if (path.endsWith('/runs/warn-run/interview-threads')) {
      await route.fulfill({ json: { threads: [] } })
      return
    }
    if (path.endsWith('/runs')) {
      await route.fulfill({ json: { project_id: 'warn-demo', runs: [] } })
      return
    }
    if (path.endsWith('/warn-demo')) {
      await route.fulfill({
        json: {
          project_id: 'warn-demo',
          user_id: 'warn-user',
          name: '경고 표시 검증',
          description: '',
          kind: 'venture',
          product_context: {},
          features: [],
          prices: [],
          target_notes: '',
          alternatives: [],
          created_at: '2026-07-21T00:00:00Z',
          updated_at: '2026-07-21T00:00:00Z',
          archived_at: null,
        },
      })
      return
    }
    await route.continue()
  })

  await page.goto('/results?project_id=warn-demo&run_id=warn-run')
  await expect(page.getByText('결과 해석 주의')).toBeVisible()
  await expect(page.getByText(WARNING)).toBeVisible()
})
