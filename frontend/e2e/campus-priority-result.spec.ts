import { expect, test, type Page } from '@playwright/test'
import { minsimResultFixture } from '../src/v2/fixtures/minsimResultFixture'

/**
 * Campus priority result chrome must stay carded (reasons/inversions).
 * Bare prose + inline "N명" regressed three times when only global CSS padding was "fixed".
 */
const METRICS = {
  items: ['학식 질 개선', '심야 셔틀', '스터디룸 증설'],
  item_count: 3,
  overall_order: ['학식 질 개선', '심야 셔틀', '스터디룸 증설'],
  item_rows: [
    {
      item: '학식 질 개선',
      overall_rank: 1,
      borda_score: 120,
      mean_rank: 1.4,
      top_choice_count: 60,
      top_choice_pct: 60,
    },
    {
      item: '심야 셔틀',
      overall_rank: 2,
      borda_score: 80,
      mean_rank: 2.1,
      top_choice_count: 30,
      top_choice_pct: 30,
    },
    {
      item: '스터디룸 증설',
      overall_rank: 3,
      borda_score: 40,
      mean_rank: 2.5,
      top_choice_count: 10,
      top_choice_pct: 10,
    },
  ],
  tier_rankings: {
    학부생: { n: 40, order: ['학식 질 개선', '심야 셔틀', '스터디룸 증설'], low_confidence: false },
    '석·박사 재학': {
      n: 30,
      order: ['심야 셔틀', '학식 질 개선', '스터디룸 증설'],
      low_confidence: false,
    },
    박사후연구원: {
      n: 15,
      order: ['학식 질 개선', '스터디룸 증설', '심야 셔틀'],
      low_confidence: true,
    },
    교직원: { n: 15, order: ['학식 질 개선', '심야 셔틀', '스터디룸 증설'], low_confidence: false },
  },
  tier_axis: ['학부생', '석·박사 재학', '박사후연구원', '교직원'],
  tier_axis_label: '소속',
  persona_pool: 'dgist',
  rank_inversions: [
    {
      item: '심야 셔틀',
      gap: 2,
      highest_tier: '석·박사 재학',
      highest_rank: 1,
      lowest_tier: '박사후연구원',
      lowest_rank: 3,
    },
  ],
  inversion_threshold: 2,
  top_reasons: [
    { reason: '매일 먹는 학식 품질이 컨디션에 바로 영향을 줍니다.', count: 12 },
    { reason: '식사 만족도가 하루 리듬을 좌우합니다.', count: 5 },
  ],
  bottom_reasons: [
    { reason: '스터디룸은 대체 공간이 있어 체감이 작습니다.', count: 8 },
    { reason: '이용 빈도가 낮아 우선순위가 밀립니다.', count: 3 },
  ],
  low_confidence_min_sample: 20,
  ranking_available: true,
  valid_answer_count: 100,
  ranking_suppressed_reason: null,
  sampling: {
    sampling: 'stratified',
    tier_counts: { 학부생: 40, '석·박사 재학': 30, 박사후연구원: 15, 교직원: 15 },
    tier_weights: {},
    warnings: [],
  },
}

async function mockCampusPriority(page: Page) {
  await page.route('**/api/projects/priority-demo**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/runs/priority-run/result')) {
      await route.fulfill({
        json: {
          ...minsimResultFixture,
          run_id: 'priority-run',
          simulation_type: 'campus_priority',
          persona_pool: 'dgist',
          sample_size: 100,
          total_responses: 100,
          parse_failed: 0,
          metrics: METRICS,
          raw_results: [],
        },
      })
      return
    }
    if (path.endsWith('/runs/priority-run/interview-threads')) {
      await route.fulfill({ json: { threads: [] } })
      return
    }
    if (path.endsWith('/runs')) {
      await route.fulfill({ json: { project_id: 'priority-demo', runs: [] } })
      return
    }
    if (path.endsWith('/priority-demo')) {
      await route.fulfill({
        json: {
          project_id: 'priority-demo',
          user_id: 'priority-user',
          name: '복지 우선순위 검증',
          description: '',
          kind: 'poll',
          product_context: {},
          features: [],
          prices: [],
          target_notes: '',
          alternatives: [],
          created_at: '2026-07-23T00:00:00Z',
          updated_at: '2026-07-23T00:00:00Z',
          archived_at: null,
        },
      })
      return
    }
    await route.continue()
  })
}

test('우선순위 결과 이유·역전 블록이 카드 레이아웃을 유지한다', async ({ page }) => {
  await mockCampusPriority(page)
  await page.goto('/results?project_id=priority-demo&run_id=priority-run')

  await expect(page.getByText('전체 순위')).toBeVisible()
  await expect(page.getByText('1순위·최하위 이유')).toBeVisible()

  const reasonCard = page.locator('.minsim-campus-priority > .card', {
    hasText: '1순위·최하위 이유',
  })
  await expect(reasonCard).toBeVisible()
  const cardPad = await reasonCard.evaluate((el) => {
    const s = getComputedStyle(el)
    return { top: Number.parseFloat(s.paddingTop), left: Number.parseFloat(s.paddingLeft) }
  })
  expect(cardPad.top).toBeGreaterThanOrEqual(16)
  expect(cardPad.left).toBeGreaterThanOrEqual(16)

  const group = page.locator('.minsim-result-reason-group, .minsim-campus-priority-reason-group').first()
  await expect(group).toBeVisible()
  const groupStyle = await group.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      border: Number.parseFloat(s.borderTopWidth),
      pad: Number.parseFloat(s.paddingTop),
    }
  })
  expect(groupStyle.border).toBeGreaterThan(0)
  expect(groupStyle.pad).toBeGreaterThanOrEqual(12)

  const li = group.locator('li').first()
  const layout = await li.evaluate((el) => {
    const s = getComputedStyle(el)
    const spans = [...el.querySelectorAll('span')]
    const a = spans[0]?.getBoundingClientRect()
    const b = spans[1]?.getBoundingClientRect()
    return {
      display: s.display,
      countBelow: Boolean(a && b && b.top >= a.bottom - 2),
    }
  })
  expect(layout.display).toBe('grid')
  expect(layout.countBelow).toBe(true)

  const inv = page.locator('.minsim-result-inversion-item, .minsim-campus-priority-inversion-item').first()
  await expect(inv).toBeVisible()
  const invStyle = await inv.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      border: Number.parseFloat(s.borderTopWidth),
      pad: Number.parseFloat(s.paddingTop),
    }
  })
  expect(invStyle.border).toBeGreaterThan(0)
  expect(invStyle.pad).toBeGreaterThanOrEqual(10)
})
