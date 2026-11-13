import { addDaysIso } from '../shared/billing/pledgeMath'
import { expect, test } from './fixtures/web-app'
import { localTodayIso } from './helpers/dates'
import { sidebarLink } from './helpers/nav'
import { seedPledge } from './helpers/seed'

test('dues ledger lists an Adagu loan after sanction', async ({ window }) => {
  await seedPledge(window)

  await sidebarLink(window, 'Dues').click()
  await expect(window.getByRole('heading', { name: 'Adagu Dues' })).toBeVisible()
  await expect(window.getByText('E2E Customer')).toBeVisible()
  await expect(window.getByText(/ADG/)).toBeVisible()

  await window.getByRole('button', { name: 'View' }).click()
  const drawer = window.getByRole('dialog', { name: 'E2E Customer' })
  await expect(drawer.getByRole('heading', { name: 'Loan Summary' })).toBeVisible()
  await expect(drawer.getByRole('heading', { name: 'Gold Pledged' })).toBeVisible()
  await expect(drawer.getByRole('heading', { name: 'Due Summary' })).toBeVisible()
  await expect(drawer.getByRole('heading', { name: 'Payment History' })).toBeVisible()
  await expect(drawer.getByText('E2E Chain')).toBeVisible()
  await expect(drawer.getByText('Collect interest').first()).toBeVisible()
})

test('the reminder queue walks through overdue loans and logs each send', async ({ window }) => {
  await seedPledge(window, { pledgeDate: addDaysIso(localTodayIso(), -40) })

  await sidebarLink(window, 'Dues').click()
  await window.locator('.filter-bar').getByRole('tab', { name: 'Reminders' }).click()
  await window.getByRole('tab', { name: /Overdue/ }).click()
  const row = window.locator('tbody tr').filter({ hasText: 'E2E Customer' })
  await expect(row.getByText('Never')).toBeVisible()

  await window.getByRole('button', { name: /Start sending \(1\)/ }).click()
  const queue = window.getByRole('dialog', { name: 'Send reminders' })
  await expect(queue).toContainText('1 of 1')
  await expect(queue).toContainText('E2E Customer')
  await queue.getByRole('button', { name: 'Open in WhatsApp' }).click()
  await expect(queue).toContainText('The chat is open in WhatsApp')
  await queue.getByRole('button', { name: 'Finish' }).click()
  await expect(queue).toContainText('1 reminder sent, 0 skipped')
  await queue.getByRole('button', { name: 'Close' }).click()

  await expect(row.getByText('Sent today')).toBeVisible()
  await expect(window.getByRole('button', { name: /Start sending \(0\)/ })).toBeDisabled()
})

test('collecting interest shows the half-page receipt and offers it on WhatsApp', async ({ window }) => {
  await seedPledge(window, { pledgeDate: addDaysIso(localTodayIso(), -40) })

  await sidebarLink(window, 'Dues').click()
  await window.getByRole('button', { name: 'View' }).click()
  const drawer = window.getByRole('dialog', { name: 'E2E Customer' })
  await drawer.getByRole('button', { name: 'More' }).click()
  await drawer.getByRole('menuitem', { name: 'Collect interest', exact: true }).click()
  const modal = window.getByRole('dialog', { name: /Collect interest/ })
  await modal.getByLabel('Mode').selectOption('upi')
  await expect(modal.getByText(/Add the shop UPI ID in Settings/)).toBeVisible()
  await modal.getByLabel('UPI reference (UTR)').fill('432198765012')
  await modal.getByLabel('Amount').fill('210')
  await modal.getByRole('button', { name: 'Record collection' }).click()

  const recorded = window.getByRole('dialog', { name: /Interest receipt · ADG\d+ · ₹210/ })
  await expect(recorded).toBeVisible()
  // The half-page receipt itself loads in the preview frame.
  const sheet = recorded.frameLocator('iframe').locator('.adr-root--a5')
  await expect(sheet).toContainText('Interest Paid Receipt')
  await expect(sheet).toContainText('₹210.00')
  await expect(sheet).toContainText('432198765012')
  await recorded.getByRole('button', { name: 'Send on WhatsApp' }).click()
  await expect(recorded).toContainText('Ctrl')
  await recorded.getByRole('button', { name: 'Done' }).click()
  await expect(recorded).toBeHidden()
})
