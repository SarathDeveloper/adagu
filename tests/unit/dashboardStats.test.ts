import { describe, expect, it } from 'vitest'
import {
  adaguFollowUps,
  buildDashboardAlerts,
  computeAdaguCollectionsInRange,
  computeAdaguStats,
  computeCollections,
  computeDueCollections,
  computeTodayCollections,
  daysBetween,
  DUE_COLLECTIONS_LIMIT,
  DUE_OVERDUE_DAYS,
  oldestDueDate,
} from '../../src/features/dashboard/dashboardStats'
import type { AdaguDueSummary, DueEntry, DuesLedger, GoldSavingDashboard } from '../../shared/types'

const today = '2026-09-24'
const yesterday = '2026-09-23'

function entry(overrides: Partial<DueEntry> = {}): DueEntry {
  return {
    id: 1,
    customerId: 1,
    entryDate: today,
    kind: 'payment',
    amount: 500,
    note: '',
    pledgeId: null,
    pledgeReceiptNo: null,
    createdAt: '',
    balanceDue: null,
    ...overrides,
  }
}

function adagu(overrides: Partial<AdaguDueSummary> = {}): AdaguDueSummary {
  return {
    pledgeId: 1,
    dueEntryId: null,
    customerId: 1,
    customerName: 'Ram',
    customerPhone: '',
    receiptNo: 'ADG-2026-0001',
    pledgeDate: '2026-09-01',
    principal: 10000,
    principalOutstanding: 8000,
    interestPct: 2,
    monthlyInterest: 200,
    daysActive: 23,
    interestDue: 150,
    interestPaidUpto: '2026-09-01',
    nextInterestDue: '2026-10-01',
    isInterestOverdue: false,
    totalDue: 8150,
    amountCollected: 0,
    remaining: 8150,
    status: 'active',
    topups: [],
    ...overrides,
  }
}

function ledger(overrides: Partial<DuesLedger> = {}): DuesLedger {
  return { columns: [], totalOutstanding: 0, adaguDues: [], adaguOutstanding: 0, ...overrides }
}

describe('daysBetween / oldestDueDate', () => {
  it('counts whole days and never goes negative', () => {
    expect(daysBetween('2026-09-12', today)).toBe(12)
    expect(daysBetween(today, '2026-09-01')).toBe(0)
  })

  it('finds the oldest due entry and ignores payments', () => {
    const rows = [
      entry({ id: 1, kind: 'payment', entryDate: '2026-09-01' }),
      entry({ id: 2, kind: 'due', entryDate: '2026-09-12' }),
      entry({ id: 3, kind: 'due', entryDate: '2026-09-18' }),
    ]
    expect(oldestDueDate(rows)).toBe('2026-09-12')
    expect(oldestDueDate([])).toBeNull()
  })
})

describe('computeCollections', () => {
  it('sums payments in range and ignores dues', () => {
    const rows = [
      entry({ id: 1, kind: 'payment', amount: 1000 }),
      entry({ id: 2, kind: 'payment', amount: 400, entryDate: yesterday }),
      entry({ id: 3, kind: 'payment', amount: 900, entryDate: '2026-09-01' }),
      entry({ id: 4, kind: 'due', amount: 7000 }),
    ]
    expect(computeCollections(rows, today, today)).toBe(1000)
    expect(computeCollections(rows, '2026-09-01', today)).toBe(2300)
    expect(computeCollections(null, today, today)).toBe(0)
  })

  it('scopes today collections to the given date', () => {
    const rows = [entry({ id: 1, amount: 250 }), entry({ id: 2, amount: 750, entryDate: yesterday })]
    expect(computeTodayCollections(rows, today)).toBe(250)
  })
})

describe('computeAdaguCollectionsInRange', () => {
  it('counts only payments tied to a pledge', () => {
    const rows = [
      entry({ id: 1, amount: 1000, pledgeId: 5, pledgeReceiptNo: 'ADG-5' }),
      entry({ id: 2, amount: 900 }),
      entry({
        id: 3,
        amount: 500,
        pledgeId: 6,
        pledgeReceiptNo: 'ADG-6',
        entryDate: '2026-09-01',
      }),
    ]
    expect(computeAdaguCollectionsInRange(rows, '2026-09-01', today)).toBe(1500)
    expect(computeAdaguCollectionsInRange(rows, today, today)).toBe(1000)
  })
})

describe('computeAdaguStats', () => {
  it('counts active loans with a balance and overdue interest', () => {
    const stats = computeAdaguStats(
      ledger({
        adaguOutstanding: 17000,
        adaguDues: [
          adagu({ pledgeId: 1, remaining: 8000 }),
          adagu({ pledgeId: 2, remaining: 9000, isInterestOverdue: true }),
          adagu({ pledgeId: 3, status: 'redeemed', remaining: 0 }),
        ],
      }),
      today,
    )
    expect(stats.activePledges).toBe(2)
    expect(stats.activePrincipal).toBe(17000)
    expect(stats.overduePledges).toBe(1)
    expect(stats.outstanding).toBe(17000)
  })

  it('defaults to zeros without a ledger', () => {
    expect(computeAdaguStats(null, today)).toEqual({
      activePledges: 0,
      activePrincipal: 0,
      overduePledges: 0,
      outstanding: 0,
    })
  })
})

describe('adaguFollowUps', () => {
  it('keeps loans with a balance, largest first, and adds the loan age', () => {
    const rows = adaguFollowUps(
      ledger({
        adaguDues: [
          adagu({ pledgeId: 1, remaining: 1000 }),
          adagu({ pledgeId: 2, remaining: 9000, pledgeDate: '2026-09-12' }),
          adagu({ pledgeId: 3, remaining: 0 }),
        ],
      }),
      today,
    )
    expect(rows.map((row) => row.pledgeId)).toEqual([2, 1])
    expect(rows[0].daysSinceStart).toBe(12)
  })

  it('caps the list at DUE_COLLECTIONS_LIMIT', () => {
    const rows = adaguFollowUps(
      ledger({
        adaguDues: Array.from({ length: 6 }, (_, i) => adagu({ pledgeId: i + 1, remaining: (i + 1) * 100 })),
      }),
      today,
    )
    expect(rows).toHaveLength(DUE_COLLECTIONS_LIMIT)
    expect(rows[0].pledgeId).toBe(6)
  })
})

describe('computeDueCollections', () => {
  it('keeps balances, sorts largest first and reports days overdue', () => {
    const result = computeDueCollections(
      ledger({
        columns: [
          {
            customerId: 1,
            customerName: 'Ravi',
            customerPhone: '',
            balance: 15000,
            entries: [entry({ id: 1, kind: 'due', entryDate: '2026-09-12' })],
          },
          {
            customerId: 2,
            customerName: 'Priya',
            customerPhone: '',
            balance: 0,
            entries: [],
          },
        ],
      }),
      today,
    )
    expect(result.dueCollections).toHaveLength(1)
    expect(result.dueCollections[0]).toMatchObject({ customerId: 1, balance: 15000, daysOverdue: 12 })
    expect(result.outstandingCustomerCount).toBe(1)
  })

  it('handles a missing ledger', () => {
    expect(computeDueCollections(null, today)).toEqual({
      dueCollections: [],
      outstandingCustomerCount: 0,
    })
  })
})

describe('buildDashboardAlerts', () => {
  const olderThan30Days = '2026-08-01'

  it('returns no alerts for empty inputs', () => {
    expect(buildDashboardAlerts(null, null, today)).toEqual([])
  })

  it('flags dues older than the threshold', () => {
    const alerts = buildDashboardAlerts(
      ledger({
        columns: [
          {
            customerId: 1,
            customerName: 'Ram',
            customerPhone: '',
            balance: 5000,
            entries: [entry({ id: 1, kind: 'due', entryDate: olderThan30Days })],
          },
        ],
      }),
      null,
      today,
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0].id).toBe('dues-overdue')
    expect(alerts[0].to).toBe('/dues')
    expect(alerts[0].title).toContain(String(DUE_OVERDUE_DAYS))
  })

  it('ignores dues within the threshold', () => {
    const alerts = buildDashboardAlerts(
      ledger({
        columns: [
          {
            customerId: 1,
            customerName: 'Ram',
            customerPhone: '',
            balance: 5000,
            entries: [entry({ id: 1, kind: 'due', entryDate: today })],
          },
        ],
      }),
      null,
      today,
    )
    expect(alerts).toEqual([])
  })

  it('flags overdue Adagu interest', () => {
    const alerts = buildDashboardAlerts(
      ledger({ adaguDues: [adagu({ isInterestOverdue: true })] }),
      null,
      today,
    )
    expect(alerts.map((alert) => alert.id)).toEqual(['adagu-interest-overdue'])
    expect(alerts[0].to).toBe('/dues')
  })

  it('raises Gold Savings maturity and overdue alerts', () => {
    const goldSavings = {
      upcomingMaturities: 2,
      overdueInstallments: 3,
    } as GoldSavingDashboard
    const alerts = buildDashboardAlerts(null, goldSavings, today)
    expect(alerts.map((alert) => alert.id)).toEqual(['gs-overdue', 'gs-maturity'])
    expect(alerts[0].to).toBe('/gold-savings/overdue')
    expect(alerts[1].to).toBe('/gold-savings/maturity')
  })
})
