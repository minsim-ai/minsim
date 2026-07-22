import { expect, test, type Page } from '@playwright/test'
import { minsimResultFixture } from '../src/v2/fixtures/minsimResultFixture'

/**
 * 결과 화면의 의향 카드가 시뮬레이션별 실제 응답 라벨을 인식하는지 검증한다.
 *
 * 회귀 대상: `intentOf`가 `구매/거부/관망`만 인식해 `수용`·`유지`·`이탈`을 조용히
 * 버리고, 살아남은 응답만으로 100%를 재계산하던 결함. 200명 중 80명이 수용해도
 * "구매 0%"가 표시됐다.
 */
type Case = {
  simulationType: string
  counts: Record<string, number>
  title: string
  expected: [string, number][]
}

const CASES: Case[] = [
  {
    simulationType: 'startup_item_validation',
    counts: { 수용: 80, 관망: 60, 거부: 60 },
    title: '수용 의향',
    expected: [['수용', 40], ['관망', 30], ['거부', 30]],
  },
  {
    simulationType: 'churn_prediction',
    counts: { 유지: 80, 관망: 60, 이탈: 60 },
    title: '유지 의향',
    expected: [['유지', 40], ['관망', 30], ['이탈', 30]],
  },
  {
    simulationType: 'price_optimization',
    counts: { 구매: 80, 관망: 60, 거부: 60 },
    title: '구매 의향',
    expected: [['구매', 40], ['관망', 30], ['거부', 30]],
  },
]

function rawResultsFor(counts: Record<string, number>) {
  const rows: unknown[] = []
  for (const [label, count] of Object.entries(counts)) {
    for (let index = 0; index < count; index += 1) {
      rows.push({
        uuid: `${label}-${index}`,
        persona: { name: `응답자${label}${index}`, age: 30, sex: '남', province: '서울', occupation: '연구원' },
        response: `의향: ${label}\n이유: 테스트 응답`,
        parsed: { intent: label, primary: label, reason: '테스트 응답' },
      })
    }
  }
  return rows
}

async function mockResult(page: Page, testCase: Case) {
  const total = Object.values(testCase.counts).reduce((sum, value) => sum + value, 0)
  await page.route('**/api/projects/intent-demo**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/runs/intent-run/result')) {
      await route.fulfill({
        json: {
          ...minsimResultFixture,
          run_id: 'intent-run',
          simulation_type: testCase.simulationType,
          sample_size: total,
          total_responses: total,
          parse_failed: 0,
          raw_results: rawResultsFor(testCase.counts),
          metrics: {
            ...(minsimResultFixture.metrics as Record<string, unknown>),
            intent_counts: testCase.counts,
          },
        },
      })
      return
    }
    if (path.endsWith('/runs/intent-run/interview-threads')) {
      await route.fulfill({ json: { threads: [] } })
      return
    }
    if (path.endsWith('/runs')) {
      await route.fulfill({
        json: {
          project_id: 'intent-demo',
          runs: [
            {
              project_id: 'intent-demo',
              run_label: '의향 라벨 검증',
              derived_from_run_id: null,
              created_at: '2026-07-21T00:00:00Z',
              run: {
                run_id: 'intent-run',
                simulation_type: testCase.simulationType,
                status: 'completed',
                sample_size: total,
                done_count: total,
                total_count: total,
                progress_pct: 100,
                country_id: 'kr',
                created_at: '2026-07-21T00:00:00Z',
                started_at: '2026-07-21T00:00:01Z',
                updated_at: '2026-07-21T00:00:02Z',
                completed_at: '2026-07-21T00:00:02Z',
                error: null,
                result_available: true,
              },
            },
          ],
        },
      })
      return
    }
    if (path.endsWith('/intent-demo')) {
      await route.fulfill({
        json: {
          project_id: 'intent-demo',
          user_id: 'intent-user',
          name: '의향 라벨 검증',
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
}

for (const testCase of CASES) {
  test(`${testCase.simulationType} 의향 카드가 실제 라벨과 비율을 표시한다`, async ({ page }) => {
    await mockResult(page, testCase)
    await page.goto('/results?project_id=intent-demo&run_id=intent-run')

    const card = page.locator('.card', { hasText: testCase.title })
    await expect(card).toBeVisible()

    for (const [label, pct] of testCase.expected) {
      await expect(card.getByText(new RegExp(`${label}\\s*${pct}%`))).toBeVisible()
    }
  })
}
