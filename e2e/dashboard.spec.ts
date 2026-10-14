import { expect, test } from './fixtures/web-app'

test('dashboard shows pledge KPI cards and the attention list', async ({ window }) => {
  await expect(window.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(window.getByPlaceholder('Search pledges, customers...')).toBeVisible()
  await expect(window.getByRole('button', { name: 'New Customer' })).toBeVisible()
  await expect(window.getByRole('link', { name: 'New Pledge' })).toBeVisible()
  for (const label of ['Total Customers', 'Active Pledges', "Today's Pledges", 'Due Soon', 'Overdue']) {
    await expect(window.locator('.main-dash-kpi-label', { hasText: label })).toBeVisible()
  }
  await expect(window.getByRole('heading', { name: 'Attention Required (Due Soon & Overdue)' })).toBeVisible()
})
