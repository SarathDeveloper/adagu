import { describe, expect, it } from 'vitest'
import { buildDashboardAlerts, computeCollections, computeTodayCollections } from '../../src/features/dashboard/dashboardStats'
import type { DueEntry, GoldSavingDashboard, MainDashboard } from '../../shared/types'

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
    mode: 'cash',
    pledgeId: null,
    pledgeReceiptNo: null,
    createdAt: '',
    balanceDue: null,
    ...overrides,
  }
}

function dashboard(overrides: Partial<MainDashboard> = {}): MainDashboard {
  return {
    totalCustomers: 0,
    newCustomersThisWeek: 0,
    activePledges: 0,
    newActivePledgesThisWeek: 0,
    todayPledges: 0,
    todayPledgesValue: 0,
    dueSoon: 0,
    overdue: 0,
    attention: [],
    ...overrides,
  }
}

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

  it('ignores renewal transfers, which are not money received', () => {
    const rows = [
      entry({ id: 1, kind: 'payment', amount: 250, mode: 'cash' }),
      entry({ id: 2, kind: 'payment', amount: 30000, mode: 'transfer' }),
      entry({ id: 3, kind: 'payment', amount: 500, mode: 'upi' }),
    ]
    expect(computeTodayCollections(rows, today)).toBe(750)
    expect(computeCollections(rows, today, today)).toBe(750)
  })
})

describe('buildDashboardAlerts', () => {
  it('returns no alerts for empty inputs', () => {
    expect(buildDashboardAlerts(null, null)).toEqual([])
    expect(buildDashboardAlerts(dashboard(), null)).toEqual([])
  })

  it('flags overdue and due-soon pledges', () => {
    const alerts = buildDashboardAlerts(
      dashboard({
        overdue: 1,
        dueSoon: 2,
        attention: [
          {
            pledgeId: 4,
            receiptNo: 'ADG0004',
            customerId: 1,
            customerName: 'Priya',
            amount: 30000,
            startDate: '2026-09-01',
            dueDate: '2026-09-20',
            status: 'overdue',
          },
        ],
      }),
      null,
    )
    expect(alerts.map((alert) => alert.id)).toEqual(['pledges-overdue', 'pledges-due-soon'])
    expect(alerts[0].tone).toBe('danger')
    expect(alerts[0].to).toBe('/adagu')
    expect(alerts[0].detail).toContain('Priya')
    expect(alerts[1].to).toBe('/adagu')
    expect(alerts[1].title).toContain('2 pledges')
  })

  it('raises Gold Savings maturity and overdue alerts', () => {
    const goldSavings = {
      upcomingMaturities: 2,
      overdueInstallments: 3,
    } as GoldSavingDashboard
    const alerts = buildDashboardAlerts(null, goldSavings)
    expect(alerts.map((alert) => alert.id)).toEqual(['gs-overdue', 'gs-maturity'])
    expect(alerts[0].to).toBe('/gold-savings/overdue')
    expect(alerts[1].to).toBe('/gold-savings/maturity')
  })
})
