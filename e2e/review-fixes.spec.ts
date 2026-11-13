/**
 * Browser checks for the frontend fixes from the code review. Each test walks
 * the screen where the bug showed up and checks the fixed behaviour. Every
 * test also fails if the page reports a Content-Security-Policy violation,
 * since the app now ships with a CSP.
 */
import type { Page } from '@playwright/test'
import { addDaysIso } from '../shared/billing/pledgeMath'
import { formatDisplayDate } from '../src/lib/format'
import { expect, test } from './fixtures/web-app'
import {
  adaguField,
  fillAdaguBorrower,
  fillPledgeItem,
  localTodayIso,
  openNewAdaguBill,
} from './helpers/adagu'
import { sidebarLink } from './helpers/nav'
import { seedPledge } from './helpers/seed'

const cspViolations = new WeakMap<Page, string[]>()

test.beforeEach(async ({ window }) => {
  const found: string[] = []
  cspViolations.set(window, found)
  window.on('console', (message) => {
    if (/content security policy/i.test(message.text())) found.push(message.text())
  })
})

test.afterEach(async ({ window }) => {
  expect(cspViolations.get(window) ?? []).toEqual([])
})

function origin(page: Page): string {
  return new URL(page.url()).origin
}

function billNoInput(page: Page) {
  return page.locator('.sale-bill-meta-field').filter({ hasText: 'Bill No.' }).locator('input')
}

async function fillLoan(page: Page, values: { name: string; phone: string; item: string; loan: string }) {
  await fillAdaguBorrower(page, { name: values.name, phone: values.phone })
  await fillPledgeItem(page, { description: values.item, grossWeight: '10', stoneWeight: '0' })
  await adaguField(page, 'Loan Amount').locator('input').fill(values.loan)
}

async function openDueDrawer(page: Page) {
  await sidebarLink(page, 'Dues').click()
  await expect(page.getByRole('heading', { name: 'Adagu Dues' })).toBeVisible()
  await page.getByRole('button', { name: 'View' }).click()
  const drawer = page.getByRole('dialog', { name: 'E2E Customer' })
  await expect(drawer.getByRole('heading', { name: 'Loan Summary' })).toBeVisible()
  return drawer
}

async function drawerMenu(page: Page, drawer: ReturnType<Page['getByRole']>, item: string) {
  await drawer.getByRole('button', { name: 'More' }).click()
  await drawer.getByRole('menuitem', { name: item, exact: true }).click()
}

test('New Adagu after saving a draft starts a fresh bill and leaves the draft untouched', async ({ window }) => {
  await openNewAdaguBill(window)
  await fillLoan(window, { name: 'Draft Owner', phone: '9811111111', item: 'Draft chain', loan: '5000' })
  await window.getByRole('button', { name: 'Save draft' }).click()
  await expect(window.getByText('Draft saved')).toBeVisible()
  await expect(window).toHaveURL(/\/adagu\/\d+$/)
  const draftId = Number(new URL(window.url()).pathname.split('/').pop())
  const draftBillNo = await billNoInput(window).inputValue()

  // Straight from the saved draft to the tab, as a user would. (Going through
  // the sidebar visits the list first, which unmounts the editor and hides
  // the bug.)
  await window.locator('.billing-chrome').getByRole('tab', { name: 'New Adagu', exact: true }).click()
  await expect(window).toHaveURL(/\/adagu\/new$/)
  // Before the fix the "new" bill still showed the saved draft.
  await expect(adaguField(window, 'Customer Name').locator('input')).toHaveValue('')
  await expect(billNoInput(window)).not.toHaveValue(draftBillNo)

  await fillLoan(window, { name: 'Second Borrower', phone: '9822222222', item: 'Second ring', loan: '4000' })
  await window.getByRole('button', { name: 'Save draft' }).click()
  await expect(window.getByText('Draft saved').first()).toBeVisible()

  // ...and saving it overwrote the first draft.
  const first = await window.request.get(`${origin(window)}/api/pledges/${draftId}`)
  expect((await first.json()).customerName).toBe('Draft Owner')
})

test('Enter in an empty customer search moves on instead of picking the newest customer', async ({ window }) => {
  await seedPledge(window)
  await openNewAdaguBill(window)
  const search = window.getByRole('combobox', { name: /search customer/i })
  await search.focus()
  await search.press('Enter')
  await expect(adaguField(window, 'Customer Name').locator('input')).toHaveValue('')

  await search.fill('E2E')
  await search.press('Enter')
  await expect(adaguField(window, 'Customer Name').locator('input')).toHaveValue('E2E Customer')
})

test('Renew from the editor pre-fills the real outstanding principal, top-ups included', async ({ window }) => {
  const pledgeId = await seedPledge(window)
  const topup = await window.request.post(`${origin(window)}/api/pledges/${pledgeId}/topup`, {
    data: { topupDate: localTodayIso(), amount: 3000 },
  })
  expect(topup.ok()).toBe(true)

  await window.goto(`${origin(window)}/adagu/${pledgeId}`)
  await window.getByRole('button', { name: 'Renew', exact: true }).click()
  const modal = window.getByRole('dialog', { name: /Renew loan/ })
  // Base loan 10,000 + top-up 3,000. Before the fix this showed 10,000.
  await expect(modal.getByLabel('New loan amount')).toHaveValue('13000')
  await expect(modal.getByText('The new ticket carries the same principal.')).toBeVisible()
})

test('the loan drawer refreshes after a collection, so Undo names the latest payment', async ({ window }) => {
  await seedPledge(window)
  const drawer = await openDueDrawer(window)

  for (const amount of ['100', '50']) {
    await drawerMenu(window, drawer, 'Collect interest')
    const modal = window.getByRole('dialog', { name: /Collect interest/ })
    await modal.getByLabel('Amount').fill(amount)
    await modal.getByRole('button', { name: 'Record collection' }).click()
    await expect(modal).toBeHidden()
    const recorded = window.getByRole('dialog', { name: /Interest receipt/ })
    await recorded.getByRole('button', { name: 'Done' }).click()
    await expect(recorded).toBeHidden()
  }

  await drawer.getByRole('button', { name: 'Undo last payment' }).click()
  const confirm = window.getByRole('dialog', { name: 'Undo last payment' })
  await expect(confirm).toContainText('₹50')
  await confirm.getByRole('button', { name: 'Cancel' }).click()
})

test('an action error is visible while its modal is open', async ({ window }) => {
  await seedPledge(window)
  const drawer = await openDueDrawer(window)
  await drawerMenu(window, drawer, 'Collect interest')
  const modal = window.getByRole('dialog', { name: /Collect interest/ })
  await modal.getByLabel('Date').fill(addDaysIso(localTodayIso(), 30))
  await modal.getByLabel('Amount').fill('100')
  await modal.getByRole('button', { name: 'Record collection' }).click()
  // The page banner is behind the drawer; the toast sits above every overlay.
  await expect(window.locator('.toast-stack')).toContainText('cannot be in the future')
})

test('the auction notice uses the shop notice period and the same dates as the server', async ({ window }) => {
  // Through the API: the Adagu settings card also requires the shop's phone
  // and address, which this test shop does not have.
  const settings = await (await window.request.get(`${origin(window)}/api/settings`)).json()
  const saved = await window.request.put(`${origin(window)}/api/settings`, {
    data: { ...settings, adaguAuctionNoticeDays: 21 },
  })
  expect(saved.ok()).toBe(true)
  await seedPledge(window)
  const drawer = await openDueDrawer(window)
  await drawerMenu(window, drawer, 'Auction notice')
  const modal = window.getByRole('dialog', { name: /Auction notice/ })
  const expected = formatDisplayDate(addDaysIso(localTodayIso(), 21))
  await expect(modal).toContainText(`on or after ${expected}`)
})

test('modals take focus and keep Tab inside', async ({ window }) => {
  await seedPledge(window)
  const drawer = await openDueDrawer(window)
  await drawerMenu(window, drawer, 'Collect interest')
  const modal = window.getByRole('dialog', { name: /Collect interest/ })
  await expect(modal).toBeVisible()
  for (let step = 0; step < 12; step += 1) {
    await window.keyboard.press('Tab')
    const inside = await modal.evaluate((element) => element.contains(document.activeElement))
    expect(inside).toBe(true)
  }
})

test('the customer form shows its own validation error', async ({ window }) => {
  await sidebarLink(window, 'Customers').click()
  await window.getByRole('button', { name: 'Add customer' }).click()
  const modal = window.getByRole('dialog', { name: 'Add customer' })
  await modal.getByRole('button', { name: 'Save' }).click()
  await expect(modal.getByRole('alert')).toContainText(/required/i)
})
