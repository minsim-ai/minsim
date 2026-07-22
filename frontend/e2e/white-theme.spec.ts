import { expect, test, type Page } from '@playwright/test'

const WHITE = 'rgb(255, 255, 255)'
const INK = 'rgb(23, 23, 25)'
const PRIMARY = 'rgb(0, 102, 255)'

test.describe('Minsim light design contract', () => {
  test('landing uses the authored white foundation', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.minsim-hero-copy')).toBeVisible()

    const foundation = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      const body = getComputedStyle(document.body)
      const shell = getComputedStyle(document.querySelector<HTMLElement>('.minsim-shell')!)
      return {
        colorScheme: root.colorScheme,
        bodyBackground: body.backgroundColor,
        shellBackground: shell.backgroundColor,
        foreground: root.getPropertyValue('--fg').trim(),
        primary: root.getPropertyValue('--lime').trim(),
      }
    })

    expect(foundation).toEqual({
      colorScheme: 'light',
      bodyBackground: WHITE,
      shellBackground: WHITE,
      foreground: '#171719',
      primary: '#06f',
    })

    await page.locator('#minsim-question').fill('화이트 테마 계약 검증')
    const primaryAction = page.getByRole('button', { name: '시뮬레이션 시작', exact: true })
    await expect(primaryAction).toBeVisible()
    await expect(primaryAction).toHaveCSS('background-color', PRIMARY)
    await expect(primaryAction).toHaveCSS('color', WHITE)
    await expect(page.locator('.minsim-hero h1')).toHaveCSS('color', INK)

    expect(await horizontalOverflow(page)).toBe(0)
  })

  test('project shell and selected states stay light', async ({ page }) => {
    await page.goto('/projects')
    await expect(page.locator('.minsim-flow-rail')).toBeVisible()

    await expect(page.locator('.minsim-shell')).toHaveCSS('background-color', WHITE)
    await expect(page.locator('.minsim-flow-rail')).toHaveCSS('background-color', WHITE)
    await expect(page.locator('.minsim-flow-rail [aria-current="step"] b'))
      .toHaveCSS('background-color', PRIMARY)

    const currentStep = page.locator('.minsim-flow-rail [aria-current="step"]')
    await expect(currentStep).toHaveCSS('color', PRIMARY)
    expect(await horizontalOverflow(page)).toBe(0)
  })

  test('Google auth control follows the light surface contract', async ({ page }) => {
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        json: {
          authenticated: false,
          user: null,
          provider: null,
          auth_enabled: true,
          auth_required: true,
          test_login_enabled: false,
          login_url: '/api/auth/google/login',
          logout_url: '/api/auth/logout',
        },
      })
    })

    await page.goto('/')
    const auth = page.getByRole('button', { name: '로그인', exact: true })
    await expect(auth).toBeVisible()
    await expect(auth).toHaveCSS('background-color', WHITE)
    await expect(auth).toHaveCSS('color', 'rgb(60, 64, 67)')
    await expect(auth).toHaveCSS('border-color', 'rgb(218, 220, 224)')
    await auth.focus()
    expect(await auth.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none')
  })

  test('mobile light landing has no authored-design overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.locator('.minsim-hero-copy')).toBeVisible()
    expect(await horizontalOverflow(page)).toBe(0)

    const composer = page.locator('.hero-input')
    const box = await composer.boundingBox()
    expect(box).not.toBeNull()
    expect(Math.round(box?.width ?? 0)).toBeLessThanOrEqual(358)
  })
})

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ))
}
