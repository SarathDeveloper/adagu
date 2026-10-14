import type { DueEntry, GoldSavingDashboard, MainDashboard } from '@shared/types'
import { formatCurrency } from '../../lib/format'
import { dateInRange } from '../../lib/dateRange'

export type DashboardAlertTone = 'danger' | 'info' | 'brand' | 'success'

export interface DashboardAlert {
  id: string
  tone: DashboardAlertTone
  title: string
  detail: string
  to: string
}

/** Sum of recorded payments in a date range. */
export function computeCollections(
  entries: DueEntry[] | null | undefined,
  from: string,
  to: string,
): number {
  let total = 0
  for (const entry of entries ?? []) {
    if (entry.kind !== 'payment' || !dateInRange(entry.entryDate, from, to)) {
      continue
    }
    // A renewal carries principal to the new ticket. It is not money received.
    if (entry.mode === 'transfer') continue
    total += entry.amount
  }
  return total
}

export function computeTodayCollections(entries: DueEntry[] | null | undefined, today: string): number {
  return computeCollections(entries, today, today)
}

/** Notifications for pledges that are overdue or due within 30 days, plus Gold Savings. */
export function buildDashboardAlerts(
  dashboard: MainDashboard | null | undefined,
  goldSavings: GoldSavingDashboard | null | undefined,
): DashboardAlert[] {
  const alerts: DashboardAlert[] = []

  if (dashboard && dashboard.overdue > 0) {
    const first = dashboard.attention.find((row) => row.status === 'overdue')
    const count = dashboard.overdue
    alerts.push({
      id: 'pledges-overdue',
      tone: 'danger',
      title: count === 1 ? '1 pledge is overdue' : `${count} pledges are overdue`,
      detail: first ? `${first.customerName} · ${formatCurrency(first.amount)}` : 'Requires action',
      to: '/adagu',
    })
  }

  if (dashboard && dashboard.dueSoon > 0) {
    const count = dashboard.dueSoon
    alerts.push({
      id: 'pledges-due-soon',
      tone: 'info',
      title:
        count === 1
          ? '1 pledge is due in the next 30 days'
          : `${count} pledges are due in the next 30 days`,
      detail: 'Next 30 days',
      to: '/adagu',
    })
  }

  if (goldSavings) {
    if (goldSavings.overdueInstallments > 0) {
      const count = goldSavings.overdueInstallments
      alerts.push({
        id: 'gs-overdue',
        tone: 'danger',
        title: `${count} Gold Savings installment${count === 1 ? '' : 's'} overdue`,
        detail: 'Collect overdue installments',
        to: '/gold-savings/overdue',
      })
    }
    if (goldSavings.upcomingMaturities > 0) {
      const count = goldSavings.upcomingMaturities
      alerts.push({
        id: 'gs-maturity',
        tone: 'info',
        title: `${count} Gold Savings maturit${count === 1 ? 'y' : 'ies'} upcoming`,
        detail: 'Review the maturity plan',
        to: '/gold-savings/maturity',
      })
    }
  }

  return alerts
}
