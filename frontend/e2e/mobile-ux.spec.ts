import { mkdir } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { minsimResultFixture } from '../src/v2/fixtures/minsimResultFixture'
import { countryMapRegionManifest } from './fixtures/country-map-region-manifest'

const EVIDENCE_DIR = '../docs/verification/deploy/mobile-ui-20260718'
const evidencePhase = process.env.MOBILE_UX_EVIDENCE_PHASE ?? 'final'
const countryMapEvidencePath = process.env.COUNTRY_MAP_EVIDENCE_PATH
const countryMapCases = [
  { countryId: 'kr', countryName: '대한민국', regionName: '서울', expectedRegionName: '서울특별시' },
  { countryId: 'us', countryName: '미국', regionName: 'CA' },
  { countryId: 'jp', countryName: '일본', regionName: '東京都' },
  { countryId: 'in', countryName: '인도', regionName: 'Maharashtra' },
  { countryId: 'br', countryName: '브라질', regionName: 'São Paulo' },
  { countryId: 'fr', countryName: '프랑스', regionName: 'Paris' },
  { countryId: 'sg', countryName: '싱가포르', regionName: 'Bedok' },
  { countryId: 'vn', countryName: '베트남', regionName: 'Thành Phố Hồ Chí Minh' },
  { countryId: 'sv', countryName: '엘살바도르', regionName: 'San Salvador' },
  { countryId: 'be', countryName: '벨기에', regionName: 'Vlaanderen' },
] as const
const authScenarios = [
  {
    label: 'login',
    // Compact landing control uses aria-label "로그인" with visible "로그인" text.
    accessibleName: '로그인',
    authenticated: false,
    colors: {
      background: 'rgb(255, 255, 255)',
      border: 'rgb(218, 220, 224)',
      foreground: 'rgb(60, 64, 67)',
    },
  },
  {
    label: 'logout',
    accessibleName: '로그아웃',
    authenticated: true,
    colors: {
      background: 'rgb(234, 242, 254)',
      border: 'rgba(0, 102, 255, 0.48)',
      foreground: 'rgb(0, 102, 255)',
    },
  },
] as const

test.beforeAll(async () => {
  await mkdir(EVIDENCE_DIR, { recursive: true })
})

test.use({ viewport: { width: 375, height: 812 } })

test('mobile landing keeps navigation clear of hero content', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.minsim-hero-copy')).toBeVisible()
  await capture(page, 'landing-mobile')

  const geometry = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.topnav')
    const heroCopy = document.querySelector<HTMLElement>('.minsim-hero-copy')
    const input = document.querySelector<HTMLElement>('.hero-input')
    if (!header || !heroCopy || !input) throw new Error('landing geometry targets are missing')
    return {
      headerBottom: Math.round(header.getBoundingClientRect().bottom),
      heroTop: Math.round(heroCopy.getBoundingClientRect().top),
      inputTop: Math.round(input.getBoundingClientRect().top),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }
  })

  expect(geometry.headerBottom).toBeLessThanOrEqual(geometry.heroTop)
  expect(geometry.inputTop).toBeGreaterThan(geometry.heroTop)
  expect(geometry.documentWidth).toBe(geometry.viewportWidth)
  await expect(page.getByRole('button', { name: '시뮬레이션 시작', exact: true })).toBeVisible()
})

test('mobile intake shows collapsible prior project context', async ({ page }) => {
  await page.setViewportSize({ width: 621, height: 804 })
  const projectId = 'mobile-intake-context-demo'
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      json: {
        authenticated: true,
        user: {
          id: 'mobile-auth-user',
          email: 'mobile@example.com',
          name: '모바일 사용자',
          picture: null,
          provider: 'google',
        },
        provider: 'google',
        auth_enabled: true,
        auth_required: true,
        test_login_enabled: false,
        login_url: '/api/auth/google/login',
        logout_url: '/api/auth/logout',
      },
    })
  })
  await page.route(`**/api/projects/${projectId}`, async (route) => {
    await route.fulfill({
      json: {
        project_id: projectId,
        name: 'DGIST 카풀 택시 합리화',
        kind: 'poll',
        description: '늦을 때 2~3명 동승이 혼자 택시보다 합리적일지 확인',
        product_context: { product_description: '학내 택시 카풀 배경 메모' },
        features: [],
        prices: [],
        target_notes: '학부생 위주',
        alternatives: [],
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
      },
    })
  })
  await page.route('**/api/config', async (route) => {
    await route.fulfill({
      json: {
        available_countries: [
          {
            country_id: 'kr',
            country_name: 'South Korea',
            country_name_ko: '대한민국',
            hf_id: 'nvidia/Nemotron-Personas-Korea',
            language: 'Korean',
            supports_region_filter: true,
            supports_korea_map: true,
            available: true,
            path: '',
          },
        ],
        default_country_id: 'kr',
      },
    })
  })

  await page.goto(`/projects/${projectId}/intake?type=open_survey`)
  const context = page.locator('details.minsim-intake-context')
  await expect(context).toBeVisible()
  await expect(context).not.toHaveAttribute('open', '')
  await expect(context.getByText('이전 입력')).toBeVisible()
  await expect(context.getByText('자유 설문').first()).toBeVisible()

  await context.locator('summary').click()
  await expect(context).toHaveAttribute('open', '')
  await expect(context.getByText('늦을 때 2~3명 동승이 혼자 택시보다 합리적일지 확인')).toBeVisible()
  await expect(context.getByText('학내 택시 카풀 배경 메모')).toBeVisible()
  // Type change stays outside the collapsible for one-tap access.
  await expect(page.getByRole('button', { name: '변경', exact: true })).toBeVisible()

  await context.locator('summary').click()
  await expect(context).not.toHaveAttribute('open', '')
})

test('mobile simulation type grid stays two columns', async ({ page }) => {
  await page.setViewportSize({ width: 524, height: 774 })
  const projectId = 'mobile-type-demo'
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      json: {
        authenticated: true,
        user: {
          id: 'mobile-auth-user',
          email: 'mobile@example.com',
          name: '모바일 사용자',
          picture: null,
          provider: 'google',
        },
        provider: 'google',
        auth_enabled: true,
        auth_required: true,
        test_login_enabled: false,
        login_url: '/api/auth/google/login',
        logout_url: '/api/auth/logout',
      },
    })
  })
  await page.route(`**/api/projects/${projectId}`, async (route) => {
    await route.fulfill({
      json: {
        project_id: projectId,
        name: '유형 선택 모바일',
        kind: 'poll',
        description: '유형 그리드 검증',
        product_context: {},
        features: [],
        prices: [],
        target_notes: '',
        alternatives: [],
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
      },
    })
  })

  await page.goto(`/projects/${projectId}/type`)
  const grid = page.locator('.minsim-type-grid')
  await expect(grid).toBeVisible()
  await expect(grid.locator('.minsim-type-card').first()).toBeVisible()

  const columns = await grid.evaluate((element) => {
    const style = getComputedStyle(element)
    const tracks = style.gridTemplateColumns.split(' ').filter(Boolean)
    const cards = Array.from(element.querySelectorAll<HTMLElement>('.minsim-type-card'))
    const tops = cards.slice(0, 2).map((card) => Math.round(card.getBoundingClientRect().top))
    return {
      trackCount: tracks.length,
      firstTwoShareRow: tops.length >= 2 && tops[0] === tops[1],
    }
  })

  expect(columns.trackCount).toBeGreaterThanOrEqual(2)
  expect(columns.firstTwoShareRow).toBe(true)
})

test('mobile project detail shows form fields before action CTAs', async ({ page }) => {
  await page.setViewportSize({ width: 504, height: 687 })
  const projectId = 'mobile-detail-demo'
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      json: {
        authenticated: true,
        user: {
          id: 'mobile-auth-user',
          email: 'mobile@example.com',
          name: '모바일 사용자',
          picture: null,
          provider: 'google',
        },
        provider: 'google',
        auth_enabled: true,
        auth_required: true,
        test_login_enabled: false,
        login_url: '/api/auth/google/login',
        logout_url: '/api/auth/logout',
      },
    })
  })
  await page.route(`**/api/projects/${projectId}`, async (route) => {
    await route.fulfill({
      json: {
        project_id: projectId,
        name: 'DGIST 카풀 택시 합리화',
        kind: 'poll',
        description: '카풀이 더 합리적일지 여론을 확인한다.',
        product_context: {
          product_description: '배경 정보 예시',
          autofill: {
            source: 'generated',
            prompt: '테스트',
            recommended_simulation_type: 'open_survey',
            simulation_input: {},
            assumptions: [],
            notes: ['가정 메모'],
            filled_fields: ['name', 'description'],
          },
        },
        features: [],
        prices: [],
        target_notes: '응답자 메모 예시',
        alternatives: [],
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
      },
    })
  })
  await page.route(`**/api/projects/${projectId}/runs`, async (route) => {
    await route.fulfill({ json: { runs: [] } })
  })

  await page.goto(`/projects/${projectId}`)
  await expect(page.getByRole('heading', { name: 'DGIST 카풀 택시 합리화' })).toBeVisible()

  const geometry = await page.evaluate(() => {
    const nameField = document.querySelector<HTMLElement>('.v2-editor-grid label')
    const actions = document.querySelector<HTMLElement>('.v2-project-detail > .v2-action-row')
    const recommended = Array.from(document.querySelectorAll('button')).find((button) =>
      /추천 유형/.test(button.textContent ?? ''),
    )
    if (!nameField || !actions) throw new Error('project detail targets missing')
    return {
      nameTop: Math.round(nameField.getBoundingClientRect().top),
      actionsTop: Math.round(actions.getBoundingClientRect().top),
      hasRecommendedStart: Boolean(recommended),
    }
  })

  // Content-first: form fields appear above the large CTA cluster.
  expect(geometry.nameTop).toBeLessThan(geometry.actionsTop)
  expect(geometry.hasRecommendedStart).toBe(false)
  await expect(page.getByRole('button', { name: '시뮬레이션 시작하기', exact: true })).toBeVisible()
})

test('mobile project create form balances CTAs, rounds fields, and enlarges labels', async ({ page }) => {
  // Galaxy S-class / feedback viewport: dual CTAs should sit side-by-side with equal width.
  await page.setViewportSize({ width: 499, height: 687 })
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      json: {
        authenticated: true,
        user: {
          id: 'mobile-auth-user',
          email: 'mobile@example.com',
          name: '모바일 사용자',
          picture: null,
          provider: 'google',
        },
        provider: 'google',
        auth_enabled: true,
        auth_required: true,
        test_login_enabled: false,
        login_url: '/api/auth/google/login',
        logout_url: '/api/auth/logout',
      },
    })
  })
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } })
      return
    }
    await route.continue()
  })

  await page.goto('/projects')
  await page.getByRole('button', { name: /새 프로젝트|첫 프로젝트 만들기/ }).first().click()

  // Name is auto-derived / AI-filled — users only write a one-line intro.
  const nameInput = page.locator('.minsim-project-form-field input.inp')
  const descInput = page.locator('.minsim-project-form-field textarea.inp')
  const aiButton = page.getByRole('button', { name: /AI로 채우기/ })
  const submitButton = page.getByRole('button', { name: /만들고 정보 등록/ })

  await expect(nameInput).toHaveCount(0)
  await expect(descInput).toBeVisible()
  await expect(page.getByText('한 줄 소개', { exact: true })).toBeVisible()
  await expect(aiButton).toBeVisible()
  await expect(submitButton).toBeVisible()

  const metrics = await page.evaluate(() => {
    const desc = document.querySelector<HTMLElement>('.minsim-project-form-field textarea.inp')
    const introLbl = document.querySelector<HTMLElement>('.minsim-project-intro > .lbl')
    const kindLbl = document.querySelector<HTMLElement>('.minsim-project-kind > .lbl')
    const buttons = Array.from(
      document.querySelectorAll<HTMLElement>('.minsim-project-form-buttons > .btn'),
    )
    if (!desc || !introLbl || !kindLbl || buttons.length < 2) {
      throw new Error('project form targets missing')
    }
    const buttonBoxes = buttons.map((button) => {
      const box = button.getBoundingClientRect()
      return { width: Math.round(box.width), height: Math.round(box.height), top: Math.round(box.top) }
    })
    return {
      descRadius: getComputedStyle(desc).borderRadius,
      descPaddingLeft: getComputedStyle(desc).paddingLeft,
      introLabelSize: Number.parseFloat(getComputedStyle(introLbl).fontSize),
      kindLabelSize: Number.parseFloat(getComputedStyle(kindLbl).fontSize),
      buttonBoxes,
    }
  })

  // Match surrounding control radius (var(--r-sm) = 7px) rather than square corners.
  expect(metrics.descRadius).not.toBe('0px')
  expect(Number.parseFloat(metrics.descRadius)).toBeGreaterThanOrEqual(6)
  expect(Number.parseFloat(metrics.descPaddingLeft)).toBeGreaterThanOrEqual(10)
  expect(metrics.introLabelSize).toBeGreaterThanOrEqual(14.5)
  expect(metrics.kindLabelSize).toBeGreaterThanOrEqual(14.5)

  // Galaxy-class width: equal side-by-side columns, not uneven content-sized stacks.
  expect(metrics.buttonBoxes[0].width).toBe(metrics.buttonBoxes[1].width)
  expect(metrics.buttonBoxes[0].top).toBe(metrics.buttonBoxes[1].top)
  expect(metrics.buttonBoxes[0].width).toBeGreaterThan(120)
  expect(metrics.buttonBoxes[0].height).toBeGreaterThanOrEqual(44)
})

test('mobile hero textarea expands for chip autofill without inner scrollbar or focus ring', async ({ page }) => {
  await page.goto('/')
  const textarea = page.locator('#minsim-question')
  await expect(textarea).toBeVisible()

  const emptyState = await textarea.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      overflowY: style.overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      minHeight: Number.parseFloat(style.minHeight),
    }
  })

  // Placeholder must fit without becoming a nested scroll box.
  expect(['hidden', 'clip']).toContain(emptyState.overflowY)
  expect(emptyState.clientHeight).toBeGreaterThanOrEqual(emptyState.minHeight - 1)
  expect(emptyState.clientHeight + 1).toBeGreaterThanOrEqual(emptyState.scrollHeight)

  await page.getByRole('button', { name: '강아지 로봇 구독', exact: true }).click()
  await expect(textarea).toHaveValue(/강아지 로봇/)

  const filledState = await textarea.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      value: element.value,
      focused: document.activeElement === element,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      overflowY: style.overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }
  })

  expect(filledState.focused).toBe(false)
  expect(filledState.outlineStyle === 'none' || filledState.outlineWidth === '0px').toBe(true)
  expect(filledState.boxShadow === 'none' || filledState.boxShadow === '').toBe(true)
  expect(['hidden', 'clip']).toContain(filledState.overflowY)
  // Box must cover full content without an inner scrollbar (1px subpixel slack).
  expect(filledState.clientHeight + 1).toBeGreaterThanOrEqual(Math.min(filledState.scrollHeight, 200))
  expect(filledState.value.length).toBeGreaterThan(20)
})

for (const scenario of authScenarios) {
  test(`light header keeps Google ${scenario.label} visually balanced`, async ({ page }) => {
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        json: {
          authenticated: scenario.authenticated,
          user: scenario.authenticated
            ? {
                id: 'mobile-auth-user',
                email: 'mobile@example.com',
                name: '모바일 사용자',
                picture: null,
                provider: 'google',
              }
            : null,
          provider: scenario.authenticated ? 'google' : null,
          auth_enabled: true,
          auth_required: true,
          test_login_enabled: false,
          login_url: '/api/auth/google/login',
          logout_url: '/api/auth/logout',
        },
      })
    })

    await page.goto('/')
    await assertLightAuthButton(
      page.getByRole('button', { name: scenario.accessibleName, exact: true }),
      scenario.colors,
    )
  })
}

test('mobile country picker keeps every country name readable', async ({ page }) => {
  await mockRunReadyCountryIntake(page)
  await page.goto('/projects/country-mobile-demo/intake?type=startup_item_validation')

  const countryGroup = page.getByRole('radiogroup', { name: '페르소나 국가', exact: true })
  await expect(countryGroup).toBeVisible()
  const countryOptions = countryGroup.getByRole('radio')
  await expect(countryOptions).toHaveCount(3)

  const layout = await countryGroup.evaluate((element) => {
    const style = getComputedStyle(element)
    const tracks = style.gridTemplateColumns.split(' ').filter(Boolean)
    const cards = Array.from(element.querySelectorAll<HTMLElement>('.minsim-country-option'))
    const tops = cards.slice(0, 2).map((card) => Math.round(card.getBoundingClientRect().top))
    return {
      trackCount: tracks.length,
      firstTwoShareRow: tops.length >= 2 && tops[0] === tops[1],
      cards: cards.map((card) => {
        const name = card.querySelector<HTMLElement>('.minsim-country-option-name')
        if (!name) throw new Error('country option name is missing')
        return {
          fontSize: Number.parseFloat(getComputedStyle(name).fontSize),
          height: Math.round(card.getBoundingClientRect().height),
        }
      }),
    }
  })

  // 2-up compact chips instead of a long 1-column radio list.
  expect(layout.trackCount).toBeGreaterThanOrEqual(2)
  expect(layout.firstTwoShareRow).toBe(true)
  for (const card of layout.cards) {
    expect(card.fontSize).toBeGreaterThanOrEqual(14)
    expect(card.height).toBeGreaterThanOrEqual(44)
  }

  await expect(page.locator('.minsim-country-select-desktop')).toBeHidden()
  // Radios are visually clipped inside compact chips — select via the chip label.
  await countryGroup.locator('.minsim-country-option').nth(1).click()
  await expect(countryOptions.nth(1)).toBeChecked()
  expect(await documentOverflow(page)).toBe(0)
})

test('mobile shell preserves the working viewport', async ({ page }) => {
  await page.goto('/projects')
  await expect(page.locator('.minsim-flow-rail')).toBeVisible()
  await capture(page, 'shell-mobile')

  expect(await shellChromeHeight(page)).toBeLessThanOrEqual(168)
  expect(await documentOverflow(page)).toBe(0)
  await expect(page.locator('.minsim-flow-rail [aria-current="step"]')).toBeVisible()

  await page.setViewportSize({ width: 812, height: 375 })
  await capture(page, 'shell-landscape')
  expect(await shellChromeHeight(page)).toBeLessThanOrEqual(136)
  expect(await documentOverflow(page)).toBe(0)
})

test('mobile intake exposes touch-safe actions', async ({ page, request }) => {
  const response = await request.post('/api/projects', {
    data: {
      name: `모바일 UX ${Date.now()}`,
      description: '모바일 입력 흐름 검증용 프로젝트',
    },
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json()
  const project = payload.data ?? payload

  await page.goto(`/projects/${encodeURIComponent(project.project_id)}/intake?type=creative_testing`)
  const changeButton = page.getByRole('button', { name: '변경' })
  await expect(changeButton).toBeVisible()
  await capture(page, 'intake-mobile')

  await expectTouchTarget(changeButton)
  expect(await documentOverflow(page)).toBe(0)

  await page.setViewportSize({ width: 812, height: 375 })
  await capture(page, 'intake-landscape')
  await expectTouchTarget(changeButton)
  expect(await shellChromeHeight(page)).toBeLessThanOrEqual(136)
})

test('mobile results collapse dense grids and label wide data', async ({ page }) => {
  await mockCompletedResult(page)
  await page.goto('/results?project_id=mobile-demo&run_id=mobile-run')
  await expect(page.getByText('한 장으로 보는 결론')).toBeVisible()
  await openDisclosure(page, 'AI 해석 보고서')
  await openDisclosure(page, '기회·리스크 통합 맵')
  await capture(page, 'results-mobile')

  await expect(page.locator('.minsim-final-summary-grid')).toBeVisible()
  await expect(page.locator('.minsim-ai-report-grid')).toBeVisible()
  expect(await gridTrackCount(page.locator('.minsim-final-summary-grid'))).toBe(1)
  expect(await gridTrackCount(page.locator('.minsim-ai-report-grid'))).toBe(1)

  const wideRegion = page.locator('.minsim-wide-data-region')
  const wideScroller = page.locator('.minsim-opportunity-scroll')
  await expect(wideRegion).toHaveAttribute('tabindex', '0')
  await expect(wideRegion.getByText(/좌우로 밀어/)).toBeVisible()
  await expect(wideScroller).toBeVisible()
  expect(await wideScroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  expect(await documentOverflow(page)).toBe(0)
})

for (const country of countryMapCases) {
  test(`mobile results render ${country.countryName} administrative regions`, async ({ page }) => {
    await mockCompletedResult(page, country.countryId, country.regionName)
    await page.goto('/results?project_id=mobile-demo&run_id=mobile-run')

    const map = page.locator('svg.region-map-svg')
    await expect(map).toBeVisible()
    await expect(map).toHaveAttribute('aria-label', `${country.countryName} 행정구역 반응 지도`)

    const expectedRegionName = 'expectedRegionName' in country
      ? country.expectedRegionName
      : country.regionName
    const region = map.locator(`path[role="button"][aria-label^="${expectedRegionName},"]`)
    await expect(region).toBeVisible()
    await expect(region).toHaveAttribute('d', /\S/)
    if (country.countryId === 'us' && countryMapEvidencePath) {
      await page.screenshot({ path: countryMapEvidencePath, fullPage: true })
    }
  })
}

for (const country of [
  { countryId: 'in', countryName: '인도', regionNames: countryMapRegionManifest.in },
  { countryId: 'be', countryName: '벨기에', regionNames: countryMapRegionManifest.be },
  { countryId: 'fr', countryName: '프랑스', regionNames: countryMapRegionManifest.fr },
] as const) {
  test(`mobile results map every installed ${country.countryName} region key`, async ({ page }) => {
    let activeRegion = country.regionNames[0] as string
    await mockCompletedResult(page, country.countryId, () => activeRegion)

    for (const regionName of country.regionNames) {
      activeRegion = regionName
      await page.goto('/results?project_id=mobile-demo&run_id=mobile-run')
      const region = page.locator('svg.region-map-svg path[role="button"]')
      await expect(region, `${country.countryName} dataset region is unmapped: ${regionName}`)
        .toHaveAttribute('aria-label', new RegExp(`^${escapeRegExp(regionName)},`))
    }
  })
}

async function capture(page: Page, name: string) {
  await page.screenshot({
    path: `${EVIDENCE_DIR}/${name}-${evidencePhase}.png`,
    fullPage: true,
  })
}

async function shellChromeHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.minsim-shell > .topnav')
    const rail = document.querySelector<HTMLElement>('.minsim-shell > .minsim-flow-rail')
    if (!header || !rail) throw new Error('shell chrome is missing')
    return Math.round(rail.getBoundingClientRect().bottom - header.getBoundingClientRect().top)
  })
}

async function documentOverflow(page: Page): Promise<number> {
  return page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ))
}

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box, 'touch target must have a rendered box').not.toBeNull()
  expect(Math.round(box?.width ?? 0)).toBeGreaterThanOrEqual(44)
  expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44)
}

async function assertLightAuthButton(
  locator: Locator,
  expectedColors: { background: string; border: string; foreground: string },
) {
  await expect(locator).toBeVisible()
  await expectTouchTarget(locator)
  const colors = await locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      background: style.backgroundColor,
      border: style.borderColor,
      foreground: style.color,
    }
  })
  expect(colors).toEqual(expectedColors)

  await locator.focus()
  expect(await locator.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none')
}

async function gridTrackCount(locator: Locator): Promise<number> {
  return locator.evaluate((element) => (
    getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length
  ))
}

async function openDisclosure(page: Page, title: string) {
  const disclosure = page.locator('details.result-disclosure', {
    has: page.locator('summary', { hasText: title }),
  })
  await disclosure.locator('summary').click()
}

async function mockCompletedResult(
  page: Page,
  countryId = 'kr',
  regionName: string | (() => string) | null = null,
) {
  const project = {
    project_id: 'mobile-demo',
    user_id: 'mobile-user',
    name: '모바일 데모 프로젝트',
    description: '모바일 결과 레이아웃 검증',
    product_context: {},
    features: [],
    prices: [],
    target_notes: '',
    alternatives: [],
    created_at: '2026-07-18T00:00:00Z',
    updated_at: '2026-07-18T00:00:00Z',
    archived_at: null,
  }
  const run = {
    project_id: 'mobile-demo',
    run_label: '모바일 결과',
    derived_from_run_id: null,
    created_at: '2026-07-18T00:00:00Z',
    run: {
      run_id: 'mobile-run',
      simulation_type: minsimResultFixture.simulation_type,
      status: 'completed',
      sample_size: minsimResultFixture.sample_size,
      done_count: minsimResultFixture.total_responses,
      total_count: minsimResultFixture.total_responses,
      progress_pct: 100,
      country_id: countryId,
      created_at: '2026-07-18T00:00:00Z',
      started_at: '2026-07-18T00:00:01Z',
      updated_at: '2026-07-18T00:00:02Z',
      completed_at: '2026-07-18T00:00:02Z',
      error: null,
      result_available: true,
    },
  }

  await page.route('**/api/projects/mobile-demo**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/runs/mobile-run/result')) {
      const activeRegionName = typeof regionName === 'function' ? regionName() : regionName
      const segments = activeRegionName
        ? {
            ...minsimResultFixture.segments,
            breakdown_by_province: {
              [activeRegionName]: { A: 3, B: 7 },
            },
          }
        : minsimResultFixture.segments
      await route.fulfill({
        json: {
          ...minsimResultFixture,
          run_id: 'mobile-run',
          country_id: countryId,
          segments,
        },
      })
      return
    }
    if (path.endsWith('/runs/mobile-run/interview-threads')) {
      await route.fulfill({ json: { threads: [] } })
      return
    }
    if (path.endsWith('/runs')) {
      await route.fulfill({ json: { project_id: 'mobile-demo', runs: [run] } })
      return
    }
    if (path.endsWith('/mobile-demo')) {
      await route.fulfill({ json: project })
      return
    }
    await route.continue()
  })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function mockRunReadyCountryIntake(page: Page) {
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      json: {
        authenticated: true,
        user: {
          id: 'mobile-country-user',
          email: 'mobile-country@example.com',
          name: '모바일 국가 QA',
          picture: null,
          provider: 'local_dev',
        },
        provider: 'local_dev',
        auth_enabled: true,
        auth_required: true,
        test_login_enabled: false,
        login_url: '/api/auth/google/login',
        logout_url: '/api/auth/logout',
      },
    })
  })
  await page.route('**/api/config', async (route) => {
    await route.fulfill({
      json: {
        default_country_id: 'kr',
        available_countries: [
          {
            country_id: 'kr',
            country_name: 'South Korea',
            country_name_ko: '대한민국',
            language: '한국어',
            available: true,
          },
          {
            country_id: 'us',
            country_name: 'United States',
            country_name_ko: '미국',
            language: 'English',
            available: true,
          },
          {
            country_id: 'jp',
            country_name: 'Japan',
            country_name_ko: '일본',
            language: '日本語',
            available: false,
          },
        ],
      },
    })
  })
  await page.route('**/api/projects/country-mobile-demo', async (route) => {
    await route.fulfill({
      json: {
        project_id: 'country-mobile-demo',
        user_id: 'mobile-country-user',
        name: 'AI 육아 도우미',
        description: '맞벌이 부모의 육아 일정 관리와 긴급 돌봄 연결 문제를 해결한다.',
        product_context: {
          product_name: 'AI 육아 도우미',
          category: '육아 서비스',
        },
        features: ['가족 일정 통합', '긴급 돌봄 연결'],
        prices: ['월 29,000원'],
        target_notes: '서울 거주 맞벌이 부모',
        alternatives: ['맘시터', '가족 캘린더'],
        created_at: '2026-07-18T00:00:00Z',
        updated_at: '2026-07-18T00:00:00Z',
        archived_at: null,
      },
    })
  })
}
