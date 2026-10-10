import { expect, test } from './fixtures/web-app'

test('dashboard shows Adagu and Gold Savings KPI cards', async ({ window }) => {
  await expect(window.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(window.getByText('GOLD22 KT/1g', { exact: false })).toBeVisible()
  await expect(window.getByText('SILVER/1g', { exact: false })).toBeVisible()
  await expect(window.locator('.kpi-label', { hasText: 'Adagu outstanding' })).toBeVisible()
  await expect(window.locator('.kpi-label', { hasText: 'Active Adagu loans' })).toBeVisible()
  await expect(window.locator('.kpi-label', { hasText: 'Interest overdue' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Adagu follow-ups' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Due collections' })).toBeVisible()
  await expect(window.getByRole('link', { name: 'New Adagu' })).toBeVisible()
})
