import { expect, test, type Page } from '@playwright/test'
import { minsimResultFixture } from '../src/v2/fixtures/minsimResultFixture'

/**
 * 자유 설문 결과 화면 회귀.
 *
 * 백엔드는 choice_rows/tier_rows/reasons_by_choice를 정상적으로 내보냈지만
 * 프론트엔드에 이를 읽는 코드가 하나도 없어, 200명이 답해도 선택지 분포가
 * 화면에 나오지 않았다. 실행·파싱만 확인하고 결과 화면을 본 적이 없어 생긴 결함이다.
 */
const OPTIONS = ['A안 유지', 'B안 전환', '판단 보류']

const METRICS = {
  question: '학생회비 인상안 중 무엇을 지지하십니까?',
  options: OPTIONS,
  choice_counts: { 'A안 유지': 90, 'B안 전환': 70, '판단 보류': 40 },
  choice_pct: { 'A안 유지': 45, 'B안 전환': 35, '판단 보류': 20 },
  choice_rows: [
    { option: 'A안 유지', count: 90, pct: 45 },
    { option: 'B안 전환', count: 70, pct: 35 },
    { option: '판단 보류', count: 40, pct: 20 },
  ],
  tier_rows: [
    { tier: '학부생', n: 120, top_option: 'A안 유지', low_confidence: false, distribution: {} },
    { tier: '석·박사 재학', n: 60, top_option: 'B안 전환', low_confidence: false, distribution: {} },
    { tier: '박사후연구원', n: 3, top_option: '판단 보류', low_confidence: true, distribution: {} },
    { tier: '교직원', n: 17, top_option: 'A안 유지', low_confidence: false, distribution: {} },
  ],
  reasons_by_choice: {
    'A안 유지': [{ reason: '현행 부담이 이미 크다', count: 40 }],
    'B안 전환': [{ reason: '복지 확대가 우선', count: 30 }],
    '판단 보류': [{ reason: '정보가 부족하다', count: 20 }],
  },
  low_confidence_min_sample: 15,
}

async function mockOpenSurvey(page: Page) {
  await page.route('**/api/projects/survey-demo**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/runs/survey-run/result')) {
      await route.fulfill({
        json: {
          ...minsimResultFixture,
          run_id: 'survey-run',
          simulation_type: 'open_survey',
          sample_size: 200,
          total_responses: 200,
          parse_failed: 0,
          metrics: METRICS,
          raw_results: OPTIONS.flatMap((option, optionIndex) =>
            Array.from({ length: 5 }, (_unused, index) => ({
              uuid: `${optionIndex}-${index}`,
              persona: { name: `응답자${optionIndex}${index}`, age: 24, sex: '여', province: '대구', occupation: '학생' },
              response: `선택: ${option}\n이유: 테스트`,
              parsed: { choice: option, primary: option, reason: '테스트' },
            })),
          ),
        },
      })
      return
    }
    if (path.endsWith('/runs/survey-run/interview-threads')) {
      await route.fulfill({ json: { threads: [] } })
      return
    }
    if (path.endsWith('/runs')) {
      await route.fulfill({ json: { project_id: 'survey-demo', runs: [] } })
      return
    }
    if (path.endsWith('/survey-demo')) {
      await route.fulfill({
        json: {
          project_id: 'survey-demo',
          user_id: 'survey-user',
          name: '자유 설문 검증',
          description: '',
          kind: 'poll',
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

test('자유 설문 결과가 질문과 선택지 분포를 표시한다', async ({ page }) => {
  await mockOpenSurvey(page)
  await page.goto('/results?project_id=survey-demo&run_id=survey-run')

  await expect(page.getByText(METRICS.question)).toBeVisible()

  const section = page.locator('.minsim-open-survey-card', { hasText: '선택지별 응답' })
  await expect(section).toBeVisible()
  for (const row of METRICS.choice_rows) {
    await expect(section.getByText(new RegExp(`${row.count}명\\s*·\\s*${row.pct}%`))).toBeVisible()
  }

  // Cards must have real padding — zero padding made the report look broken.
  const padding = await section.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      top: Number.parseFloat(style.paddingTop),
      left: Number.parseFloat(style.paddingLeft),
      background: style.backgroundColor,
    }
  })
  expect(padding.top).toBeGreaterThanOrEqual(16)
  expect(padding.left).toBeGreaterThanOrEqual(16)
  expect(padding.background).not.toBe('rgba(0, 0, 0, 0)')
})

test('자유 설문 결과가 표본 부족 계층을 구분한다', async ({ page }) => {
  await mockOpenSurvey(page)
  await page.goto('/results?project_id=survey-demo&run_id=survey-run')

  const tierSection = page.locator('.minsim-open-survey-card', { hasText: '계층별 선택' })
  await expect(tierSection).toBeVisible()
  // 표본 3명인 박사후연구원은 경고 표시가 붙어야 한다.
  await expect(tierSection.getByText(/3명\s*⚠/)).toBeVisible()
  await expect(tierSection.locator('tr.is-low-confidence')).toHaveCount(1)
})
