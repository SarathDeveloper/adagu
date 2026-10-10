import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { sidebarLink } from './nav'

export function inr(amount: number): string {
  return `₹${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)}`
}

export function inrPlain(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function localTodayIso(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isoDaysAgo(days: number): string {
  const today = localTodayIso()
  const start = Date.parse(`${today}T12:00:00`)
  const next = new Date(start - days * 24 * 60 * 60 * 1000)
  return next.toISOString().slice(0, 10)
}

export function adaguField(page: Page, label: string) {
  return page.locator('.adagu-field').filter({ hasText: label })
}

export function calculatedValue(page: Page, label: string) {
  return page.locator('.adagu-calculated-row').filter({ hasText: label }).locator('.value')
}

/** Settings → Adagu Settings, ready to edit. */
export async function openAdaguPosSettings(page: Page) {
  await sidebarLink(page, 'Settings').click()
  const tab = page.getByRole('tab', { name: 'Adagu Settings' })
  await expect(tab).toBeVisible()
  if ((await tab.getAttribute('aria-selected')) !== 'true') {
    await tab.click()
  }
  await expect(page.getByRole('heading', { name: 'Adagu Settings' })).toBeVisible()
  const card = page
    .locator('.card')
    .filter({ has: page.getByRole('heading', { name: 'Adagu Settings' }) })
  await expect(card.getByRole('heading', { name: 'Adagu POS Settings' })).toBeVisible()
  return card
}

/** Fill any of the Adagu settings and save them once. */
export async function setAdaguSettings(
  page: Page,
  values: {
    interestPct?: string
    ltvPct?: string
    noticeDays?: string
    requireKyc?: boolean
  },
) {
  const card = await openAdaguPosSettings(page)
  if (values.interestPct != null) {
    await page.getByLabel('Adagu monthly interest (%)').fill(values.interestPct)
  }
  if (values.ltvPct != null) {
    await page.getByLabel('Adagu LTV (% of assessed value)').fill(values.ltvPct)
  }
  if (values.noticeDays != null) {
    await page.getByLabel('Auction notice period (days)').fill(values.noticeDays)
  }
  if (values.requireKyc != null) {
    await page
      .getByLabel('Require KYC (Aadhaar or PAN) before sanctioning')
      .setChecked(values.requireKyc)
  }
  await card.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page.getByText('Adagu settings saved')).toBeVisible()
}

export async function setAdaguInterestPct(page: Page, pct: string) {
  await setAdaguSettings(page, { interestPct: pct })
}

/** Adagu → New Adagu, ready to fill a fresh pledge. */
export async function openNewAdaguBill(page: Page) {
  await sidebarLink(page, 'Adagu').click()
  const tab = page.getByRole('tab', { name: 'New Adagu' })
  await expect(tab).toBeVisible()
  if ((await tab.getAttribute('aria-selected')) !== 'true') {
    await tab.click()
  }
  await expect(page.getByRole('heading', { name: 'Adagu Bill' })).toBeVisible()
}

export async function setBillDate(page: Page, isoDate: string) {
  await page.getByLabel('Bill Date').fill(isoDate)
}

export async function fillAdaguBorrower(
  page: Page,
  values: { name: string; phone: string; address?: string },
) {
  await adaguField(page, 'Customer Name').locator('input').fill(values.name)
  await adaguField(page, 'Mobile Number').locator('input').fill(values.phone)
  await adaguField(page, 'Address').locator('textarea').fill(values.address ?? 'Salem')
}

export async function fillPledgeItem(
  page: Page,
  values: { description: string; grossWeight: string; stoneWeight: string },
) {
  const table = page.locator('.adagu-jewellery-table--pledge')
  const itemRow = table.locator('tbody tr').first()
  await itemRow.locator('.adagu-col-weight input').nth(0).fill(values.grossWeight)
  await itemRow.locator('.adagu-col-weight input').nth(1).fill(values.stoneWeight)
  await itemRow.locator('.adagu-col-weight input').nth(1).blur()
  await table.locator('textarea').fill(values.description)
}

export async function recoverFromFatalError(page: Page) {
  const crashed = page.getByRole('heading', { name: 'Something went wrong.' })
  if (!(await crashed.isVisible())) return
  await page.getByRole('button', { name: 'Restart Application' }).click()
  const username = page.getByLabel('Username')
  const sidebar = page.locator('.sidebar-nav')
  await username.or(sidebar).waitFor({ state: 'visible', timeout: 20_000 })
  if (await username.isVisible()) {
    await username.fill('admin')
    await page.getByLabel('Password').fill('admin456')
    await page.getByRole('button', { name: 'Sign in' }).click()
  }
  await sidebar.waitFor({ state: 'visible', timeout: 20_000 })
}

export async function dismissDialogs(page: Page) {
  const crashed = page.getByRole('heading', { name: 'Something went wrong.' })
  if (await crashed.isVisible()) {
    await recoverFromFatalError(page)
    return
  }
  await page.keyboard.press('Escape')
  const preview = page.getByRole('dialog', { name: 'Print preview' })
  if (await preview.isVisible()) {
    await page.keyboard.press('Escape')
  }
  await recoverFromFatalError(page)
}

export async function sanctionAdaguLoan(page: Page) {
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Sanction loan' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Sanction loan' }).click()
  const toast = page.getByText('Loan sanctioned')
  const crashed = page.getByRole('heading', { name: 'Something went wrong.' })
  await toast.or(crashed).waitFor({ state: 'visible', timeout: 15_000 })
  await dismissDialogs(page)
}

export async function closePrintPreview(page: Page) {
  await dismissDialogs(page)
}

export async function adaguBillNo(page: Page): Promise<string> {
  const value = await page
    .locator('.sale-bill-meta-field')
    .filter({ hasText: 'Bill No.' })
    .locator('input')
    .inputValue()
  expect(value).toMatch(/^ADG\d{4,}$/)
  return value
}

/** Dues is Adagu-only in this edition, so there is no tab to switch. */
export async function openDuesTab(page: Page) {
  await sidebarLink(page, 'Dues').click()
  await expect(page.getByRole('heading', { name: 'Adagu Dues' })).toBeVisible()
}

export async function adaguDueRow(page: Page, query: string): Promise<Locator> {
  await page.getByPlaceholder('Search customer or ADG no...').fill(query)
  const row = page.locator('tr.dues-adagu-row').filter({ hasText: query })
  await expect(row).toBeVisible()
  return row
}

export async function receiptNoFromDueRow(row: Locator): Promise<string> {
  const value = (await row.locator('.dues-adagu-receipt').innerText()).trim()
  expect(value).toMatch(/^ADG\d{4,}$/)
  return value
}

export async function openAdaguDueDrawer(page: Page, receiptNo: string, customerName: string) {
  const row = await adaguDueRow(page, receiptNo)
  await row.getByRole('button', { name: 'View' }).click()
  const drawer = page.getByRole('dialog', { name: customerName })
  await expect(drawer).toBeVisible()
  return drawer
}
