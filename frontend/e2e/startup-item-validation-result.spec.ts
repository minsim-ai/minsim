import { expect, test, type Page } from '@playwright/test'
import { minsimResultFixture } from '../src/v2/fixtures/minsimResultFixture'

/**
 * startup_item_validation results render through the generic report (no
 * dedicated renderer is registered for this type — see
 * DEDICATED_RESULT_RENDERERS in src/simulations/registry.ts). This spec pins
 * down what the generic report actually surfaces for it: the acceptance
 * (수용/관망/거부) intent bar, age/region segment breakdowns keyed by that
 * intent vocabulary, and the reasons-derived "주요 거부 요인" (barriers) card.
 */

const METRICS = {
  protocol_id: 'startup_item_validation_v1',
  intent_counts: { 수용: 90, 관망: 60, 거부: 50 },
  intent_pct: { 수용: 45, 관망: 30, 거부: 25 },
  segment_counts: {},
  segment_pct: {},
  need_category_counts: { 시간절약: 40, 비용절감: 30, 건강: 10 },
  barrier_counts: { 가격부담: 28, 신뢰부족: 12, 필요성낮음: 10 },
  wtp_median: 39000,
  wtp_p25: 29000,
  wtp_p75: 49000,
}

function personaRow(uuid: string, intent: string, reason: string, age: number, province: string, sex: string) {
  return {
    uuid,
    persona: { name: `응답자${uuid}`, age, sex, province, occupation: '자영업' },
    response: `의향: ${intent}\n이유: ${reason}`,
    parsed: { intent, reason },
  }
}

const RAW_RESULTS = [
  personaRow('1', '수용', '재고 관리에 드는 시간을 크게 줄여줄 것 같습니다.', 34, '서울', '여'),
  personaRow('2', '수용', 'AI 발주 추천이 명절 손실을 막아줄 것 같습니다.', 41, '경기', '남'),
  personaRow('3', '관망', '가격이 부담스러워 조금 더 지켜보고 싶습니다.', 45, '부산', '여'),
  personaRow('4', '거부', '지금 쓰는 POS 부가기능으로 충분합니다.', 52, '대구', '남'),
  personaRow('5', '거부', '가격이 부담스럽고 아직 신뢰가 가지 않습니다.', 38, '인천', '여'),
  personaRow('6', '수용', '실시간 대시보드가 감으로 하던 발주를 대체해줍니다.', 29, '서울', '남'),
]

async function mockStartupItemValidation(page: Page) {
  await page.route('**/api/projects/startup-demo**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/runs/startup-run/result')) {
      await route.fulfill({
        json: {
          ...minsimResultFixture,
          run_id: 'startup-run',
          simulation_type: 'startup_item_validation',
          sample_size: 200,
          total_responses: 200,
          parse_failed: 0,
          metrics: METRICS,
          segments: {
            breakdown_by_age: {
              '30대': { 수용: 20, 관망: 12, 거부: 8 },
              '40대': { 수용: 25, 관망: 18, 거부: 15 },
            },
            breakdown_by_province: {
              서울: { 수용: 15, 관망: 10, 거부: 5 },
              경기: { 수용: 12, 관망: 8, 거부: 6 },
            },
          },
          raw_results: RAW_RESULTS,
        },
      })
      return
    }
    if (path.endsWith('/runs/startup-run/interview-threads')) {
      await route.fulfill({ json: { threads: [] } })
      return
    }
    if (path.endsWith('/runs')) {
      await route.fulfill({ json: { project_id: 'startup-demo', runs: [] } })
      return
    }
    if (path.endsWith('/startup-demo')) {
      await route.fulfill({
        json: {
          project_id: 'startup-demo',
          user_id: 'startup-user',
          name: 'AI 재고관리 SaaS 검증',
          description: '',
          kind: 'venture',
          product_context: {},
          features: [],
          prices: [],
          target_notes: '',
          alternatives: [],
          created_at: '2026-08-01T00:00:00Z',
          updated_at: '2026-08-01T00:00:00Z',
          archived_at: null,
        },
      })
      return
    }
    await route.continue()
  })
}

test('창업 아이템 검증 결과가 수용 의향·세그먼트·거부 요인을 표시한다', async ({ page }) => {
  await mockStartupItemValidation(page)
  await page.goto('/results?project_id=startup-demo&run_id=startup-run')

  await expect(page.getByText('한 장으로 보는 결론')).toBeVisible()

  // Acceptance verdict: intent bar built from raw_results' 수용/관망/거부 labels.
  await expect(page.getByText('수용 의향')).toBeVisible()
  await expect(page.getByText('45%').first()).toBeVisible()

  // Age/region segment breakdown keyed by the same intent vocabulary.
  await expect(page.getByText('30대').first()).toBeVisible()
  await expect(page.getByText('서울').first()).toBeVisible()

  // Reasons-derived barriers card.
  await expect(page.getByText('주요 거부 요인 · 왜 안 사는가')).toBeVisible()
  await expect(page.getByText(/가격이 부담스럽/).first()).toBeVisible()
})
