import { expect, test } from './fixtures/web-app'
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
