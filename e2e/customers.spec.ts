import { GOLD_SAVINGS_VISIBLE } from '../src/features/goldSavings/visibility'
import { expect, test } from './fixtures/web-app'
import { sidebarLink } from './helpers/nav'
import { seedPledge } from './helpers/seed'

test('customers CRUD', async ({ window }) => {
  await sidebarLink(window, 'Customers').click()
  await expect(window.getByRole('heading', { name: 'Customers' })).toBeVisible()

  await window.getByRole('button', { name: 'Add customer' }).click()
  await window.getByLabel('Name', { exact: true }).fill('E2E Customer')
  await window.getByLabel('Mobile').fill('9111111111')
  await window.getByLabel('Address').fill('Salem')
  await window.getByLabel('Notes').fill('Test')
  await window.getByRole('button', { name: 'Save' }).click()

  await expect(window.getByRole('cell', { name: 'E2E Customer' })).toBeVisible()

  await window.getByRole('button', { name: 'Edit' }).click()
  await window.getByLabel('Name', { exact: true }).fill('E2E Customer Updated')
  await window.getByRole('button', { name: 'Save' }).click()
  await expect(window.getByRole('cell', { name: 'E2E Customer Updated' })).toBeVisible()

  await window.getByRole('button', { name: 'Delete' }).click()
  await window.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(window.getByText('No customers yet')).toBeVisible()
})

test('customer profile shows Adagu loan and due history', async ({ window }) => {
  await seedPledge(window)

  await sidebarLink(window, 'Customers').click()
  await expect(window.getByRole('heading', { name: 'Customers' })).toBeVisible()
  const customerRow = window.getByRole('row').filter({ hasText: 'E2E Customer' })
  await customerRow.getByRole('link', { name: 'E2E Customer' }).click()

  await expect(window).toHaveURL(/\/customers\/\d+$/)
  await expect(window.getByRole('heading', { name: 'E2E Customer' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Customer Profile' })).toBeVisible()
  await expect(window.getByText('Total Paid')).toBeVisible()
  await expect(window.getByText('Outstanding')).toBeVisible()
  await expect(window.getByText('Active Adagu loans')).toBeVisible()

  await window.getByRole('tab', { name: 'Adagu' }).click()
  await expect(window.getByRole('heading', { name: 'Active Adagu loans' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Active Adagu loans' }).locator('..').getByText(/ADG/)).toBeVisible()

  if (GOLD_SAVINGS_VISIBLE) {
    await expect(window.getByRole('tab', { name: 'Gold Savings' })).toBeVisible()
  } else {
    await expect(window.getByRole('tab', { name: 'Gold Savings' })).toHaveCount(0)
  }

  await window.getByRole('tab', { name: 'History' }).click()
  await expect(window.getByRole('heading', { name: 'Payment History' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Due History' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Due History' }).locator('..').getByText(/ADG/)).toBeVisible()
  await expect(window.getByText('No payments recorded.')).toBeVisible()
})
