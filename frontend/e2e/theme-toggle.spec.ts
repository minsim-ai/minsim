import { expect, test, type Page } from '@playwright/test'

const THEME_KEY = 'minsim.theme'

test.describe('Minsim theme toggle', () => {
  test('defaults to light even when the OS is dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'minsim')
    await expect(page.getByRole('button', { name: '다크 모드' })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.minsim-shell')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    expect(await storedTheme(page)).toBeNull()
  })

  test('ignores live OS changes', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'minsim')
    await page.emulateMedia({ colorScheme: 'dark' })
    // OS를 다크로 바꿔도 사용자가 고르기 전에는 라이트를 유지한다.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'minsim')
    expect(await storedTheme(page)).toBeNull()
  })

  test('remembers an explicit choice across routes and reloads', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')

    const toggle = page.getByRole('button', { name: '다크 모드' })
    await expect(toggle).toBeVisible()
    await toggle.click()

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'minsim-dark')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(await storedTheme(page)).toBe('dark')

    await page.goto('/projects')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'minsim-dark')
    await expect(page.locator('.minsim-flow-rail')).toHaveCSS('background-color', 'rgb(13, 15, 18)')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'minsim-dark')

    await page.getByRole('button', { name: '다크 모드' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'minsim')
    expect(await storedTheme(page)).toBe('light')
  })

  test('explicit light preference stays light on a dark OS', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.addInitScript(([key]) => window.localStorage.setItem(key, 'light'), [THEME_KEY])
    await page.goto('/')

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'minsim')
    await expect(page.getByRole('button', { name: '다크 모드' })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.minsim-shell')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  })

  test('stays touch-safe without mobile overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    const toggle = page.getByRole('button', { name: '다크 모드' })
    const box = await toggle.boundingBox()
    expect(box).not.toBeNull()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
    expect(await horizontalOverflow(page)).toBe(0)

    await page.goto('/projects')
    await expect(page.getByRole('button', { name: '다크 모드' })).toBeVisible()
    expect(await horizontalOverflow(page)).toBe(0)
  })
})

async function storedTheme(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), THEME_KEY)
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ))
}
