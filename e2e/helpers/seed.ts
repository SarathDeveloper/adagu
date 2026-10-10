import type { Page } from '@playwright/test'
import { getDatabase } from '../../server/db'
import { seedSampleGoldSavingsIfEmpty } from '../../server/db/sampleGoldSavings'
import { localTodayIso } from './dates'

export function seedGoldSavingsDemo(): boolean {
  return seedSampleGoldSavingsIfEmpty(getDatabase())
}

async function apiCall<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

/**
 * Create a customer and a sanctioned Adagu pledge, then return the pledge id.
 * Used by the customer, dues and print-route specs.
 */
export async function seedPledge(page: Page): Promise<number> {
  const pledgeDate = localTodayIso()
  return page.evaluate(async (date) => {
    async function api<T>(path: string, init?: RequestInit): Promise<T> {
      const response = await fetch(path, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      if (response.status === 204) return undefined as T
      return (await response.json()) as T
    }

    const customer = await api<{ id: number }>('/api/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: 'E2E Customer',
        phone: '9000000000',
        address: 'Salem',
        notes: '',
      }),
    })
    const pledge = await api<{ id: number }>('/api/pledges', {
      method: 'POST',
      body: JSON.stringify({
        customerId: customer.id,
        pledgeDate: date,
        assessedValue: 20000,
        loanAmount: 10000,
        interestPct: 2.1,
        items: [
          {
            description: 'E2E Chain',
            metal: 'Gold',
            purity: '22K',
            grossWeight: 10,
            netWeight: 9.5,
            pieces: 1,
          },
        ],
      }),
    })
    await api(`/api/pledges/${pledge.id}/sanction`, { method: 'POST' })
    return pledge.id
  }, pledgeDate)
}

/** Seed the Gold Savings demo data and return a real payment id for a receipt print. */
export function seedGoldSavingsDemoPayment(): number | null {
  const db = getDatabase()
  seedSampleGoldSavingsIfEmpty(db)
  const row = db.prepare('SELECT id FROM gold_saving_payments ORDER BY id LIMIT 1').get() as
    | { id: number }
    | undefined
  return row?.id ?? null
}

export async function seedShopName(page: Page, shopName: string): Promise<void> {
  await page.evaluate(async (name) => {
    async function api<T>(path: string, init?: RequestInit): Promise<T> {
      const response = await fetch(path, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      if (response.status === 204) return undefined as T
      return (await response.json()) as T
    }

    const settings = await api<Record<string, unknown>>('/api/settings')
    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ ...settings, shopName: name }),
    })
  }, shopName)
}

export { apiCall }
