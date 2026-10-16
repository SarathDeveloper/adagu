import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/web-app'

const PHONE = { width: 390, height: 844 }
const TABLET = { width: 768, height: 1024 }

/** Routes that must render without pushing the page wider than the viewport. */
const ROUTES: { path: string; name: string }[] = [
  { path: '/dashboard', name: 'dashboard' },
  { path: '/adagu', name: 'adagu list' },
  { path: '/adagu/new', name: 'adagu pledge editor' },
  { path: '/customers', name: 'customers' },
  { path: '/dues', name: 'dues' },
  { path: '/reports/active-pledges', name: 'reports' },
  { path: '/gold-savings/dashboard', name: 'gold savings' },
  { path: '/settings', name: 'settings' },
  { path: '/users', name: 'users' },
]

/** The document must never be wider than the viewport on narrow screens. */
async function expectNoPageOverflow(page: Page, name: string) {
  const overflow = await page.evaluate(() => {
    const width = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    return width - window.innerWidth
  })
  expect(overflow, `${name} overflows the viewport horizontally`).toBeLessThanOrEqual(1)
}

/** Wait for the route shell and its first data render to settle. */
async function openRoute(page: Page, path: string) {
  await page.goto(`${new URL(page.url()).origin}${path}`)
  await page.locator('.content').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
}

test.describe('phone viewport', () => {
  test.beforeEach(async ({ window }) => {
    await window.setViewportSize(PHONE)
  })

  test('hamburger drawer opens and navigates', async ({ window }) => {
    const toggle = window.getByRole('button', { name: 'Open navigation' })
    const sidebar = window.locator('#app-sidebar')

    await expect(window.locator('.mobile-topbar')).toBeVisible()
    await expect(toggle).toBeVisible()
    await expect(sidebar).toBeHidden()

    await toggle.click()
    await expect(sidebar).toBeVisible()
    await expect(
      window.locator('.mobile-topbar').getByRole('button', { name: 'Close navigation' }),
    ).toBeVisible()

    await window.locator('.sidebar-nav').getByRole('link', { name: 'Customers' }).click()
    await expect(window).toHaveURL(/\/customers$/)
    await expect(sidebar).toBeHidden()
  })

  test('drawer closes with Escape', async ({ window }) => {
    await window.getByRole('button', { name: 'Open navigation' }).click()
    await expect(window.locator('#app-sidebar')).toBeVisible()

    await window.keyboard.press('Escape')
    await expect(window.locator('#app-sidebar')).toBeHidden()
  })

  test('main routes fit the viewport', async ({ window }) => {
    for (const route of ROUTES) {
      await openRoute(window, route.path)
      await expectNoPageOverflow(window, route.name)
    }
  })

  test('adagu pledge editor shows card rows and a sticky action bar', async ({ window }) => {
    await openRoute(window, '/adagu/new')
    await window.getByRole('button', { name: /Add Item/i }).click()

    const table = window.locator('.adagu-jewellery-table--pledge')
    const firstRow = table.locator('tbody tr').first()
    await expect(firstRow).toBeVisible()

    // Column headers are replaced by per-cell labels on phones.
    await expect(table.locator('thead')).toBeHidden()
    expect(await firstRow.evaluate((row) => getComputedStyle(row).display)).toBe('grid')

    const labels = await firstRow.evaluate((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => cell.getAttribute('data-label') ?? ''),
    )
    expect(labels.some((entry) => entry.includes('Purity'))).toBe(true)

    // The table no longer forces a wide minimum width.
    const tableWidth = await table.evaluate((node) => node.getBoundingClientRect().width)
    expect(tableWidth).toBeLessThanOrEqual(PHONE.width)

    // Running total plus the primary actions stay pinned to the viewport.
    const actions = window.locator('.sale-bill-editor .adagu-header-actions')
    await expect(actions).toBeVisible()
    await expect(window.locator('.sale-bill-mobile-total')).toBeVisible()
    await expect(actions.getByRole('button', { name: /Save draft/i })).toBeInViewport()

    const bar = await actions.boundingBox()
    expect(bar).not.toBeNull()
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(PHONE.height + 1)
  })

  test('reports submenu fits inside the viewport', async ({ window }) => {
    await openRoute(window, '/reports/active-pledges')
    await window.locator('.reports-tab-chevron').first().click()

    const submenu = window.locator('.reports-submenu').first()
    await expect(submenu).toBeVisible()
    const box = await submenu.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width + 1)
  })
})

test.describe('tablet viewport', () => {
  test.beforeEach(async ({ window }) => {
    await window.setViewportSize(TABLET)
  })

  test('uses the drawer navigation and fits the viewport', async ({ window }) => {
    await expect(window.locator('.mobile-topbar')).toBeVisible()
    await expect(window.locator('#app-sidebar')).toBeHidden()

    await window.getByRole('button', { name: 'Open navigation' }).click()
    await expect(window.locator('#app-sidebar')).toBeVisible()
    await window.locator('.sidebar-nav').getByRole('link', { name: 'Adagu' }).click()
    await window.locator('.content').waitFor({ state: 'visible' })
    await window.waitForTimeout(250)
    await expectNoPageOverflow(window, 'adagu list')

    await openRoute(window, '/adagu/new')
    await expectNoPageOverflow(window, 'adagu pledge editor')

    await openRoute(window, '/settings')
    await expectNoPageOverflow(window, 'settings')
  })
})

test.describe('desktop viewport', () => {
  test('keeps the sidebar navigation and no mobile top bar', async ({ window }) => {
    await window.setViewportSize({ width: 1280, height: 800 })
    await expect(window.locator('.mobile-topbar')).toBeHidden()
    await expect(window.locator('#app-sidebar')).toBeVisible()
    await expect(window.locator('.sidebar-backdrop')).toBeHidden()
  })
})
