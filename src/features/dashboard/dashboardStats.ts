import type { AdaguDueSummary, DueEntry, DuesLedger, GoldSavingDashboard } from '@shared/types'
import { formatCurrency } from '../../lib/format'
import { dateInRange } from '../../lib/dateRange'

export const DUE_COLLECTIONS_LIMIT = 4

/** A due older than this many days is surfaced as a dashboard alert. */
export const DUE_OVERDUE_DAYS = 30

export type DashboardAlertTone = 'danger' | 'info' | 'brand' | 'success'

export interface DashboardAlert {
  id: string
  tone: DashboardAlertTone
  title: string
  detail: string
  to: string
}

export interface DueCollectionRow {
  customerId: number
  customerName: string
  balance: number
  daysOverdue: number
}

function toDateKey(value: string | null | undefined): string {
  return (value ?? '').slice(0, 10)
}

export function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(`${toDateKey(startDate)}T12:00:00`)
  const end = new Date(`${toDateKey(endDate)}T12:00:00`)
  const diffMs = end.getTime() - start.getTime()
  return Math.max(0, Math.floor(diffMs / 86_400_000))
}

export function oldestDueDate(entries: DueEntry[]): string | null {
  let oldest: string | null = null
  for (const entry of entries) {
    if (entry.kind !== 'due') {
      continue
    }
    const key = toDateKey(entry.entryDate)
    if (!oldest || key < oldest) {
      oldest = key
    }
  }
  return oldest
}

/** Sum of recorded payments in a date range. Adagu payments carry a pledgeId. */
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
    total += entry.amount
  }
  return total
}

export function computeTodayCollections(entries: DueEntry[] | null | undefined, today: string): number {
  return computeCollections(entries, today, today)
}

/** Adagu payments only, for the "collected this month" KPI. */
export function computeAdaguCollectionsInRange(
  entries: DueEntry[] | null | undefined,
  from: string,
  to: string,
): number {
  let total = 0
  for (const entry of entries ?? []) {
    if (entry.kind !== 'payment' || entry.pledgeId === null || !dateInRange(entry.entryDate, from, to)) {
      continue
    }
    total += entry.amount
  }
  return total
}

export interface AdaguDashboardStats {
  activePledges: number
  activePrincipal: number
  overduePledges: number
  outstanding: number
}

export function computeAdaguStats(
  ledger: DuesLedger | null | undefined,
  _today: string,
): AdaguDashboardStats {
  const rows = ledger?.adaguDues ?? []
  const active = rows.filter((row) => row.status === 'active' && row.remaining > 0)
  return {
    activePledges: active.length,
    activePrincipal: active.reduce((sum, row) => sum + row.remaining, 0),
    overduePledges: rows.filter((row) => row.isInterestOverdue).length,
    outstanding: ledger?.adaguOutstanding ?? 0,
  }
}

/** Adagu follow-ups: the loans with a remaining balance, largest first. */
export function adaguFollowUps(
  ledger: DuesLedger | null | undefined,
  today: string,
): (AdaguDueSummary & { daysSinceStart: number })[] {
  return (ledger?.adaguDues ?? [])
    .filter((row) => row.remaining > 0)
    .map((row) => ({ ...row, daysSinceStart: daysBetween(row.pledgeDate, today) }))
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, DUE_COLLECTIONS_LIMIT)
}

function computeDueCollections(
  ledger: DuesLedger | null | undefined,
  today: string,
): {
  dueCollections: DueCollectionRow[]
  outstandingCustomerCount: number
} {
  const withBalance = (ledger?.columns ?? [])
    .filter((column) => column.balance > 0)
    .map((column) => {
      const oldest = oldestDueDate(column.entries ?? [])
      return {
        customerId: column.customerId,
        customerName: column.customerName,
        balance: column.balance,
        daysOverdue: oldest ? daysBetween(oldest, today) : 0,
      }
    })
    .sort((a, b) => b.balance - a.balance)

  return {
    dueCollections: withBalance.slice(0, DUE_COLLECTIONS_LIMIT),
    outstandingCustomerCount: withBalance.length,
  }
}

export { computeDueCollections }

/** Dashboard notifications for Adagu dues and Gold Savings. */
export function buildDashboardAlerts(
  ledger: DuesLedger | null | undefined,
  goldSavings: GoldSavingDashboard | null | undefined,
  today: string,
): DashboardAlert[] {
  const alerts: DashboardAlert[] = []

  const overdueDues = (ledger?.columns ?? [])
    .filter((column) => column.balance > 0)
    .map((column) => ({ column, oldest: oldestDueDate(column.entries ?? []) }))
    .filter((row) => row.oldest !== null && daysBetween(row.oldest, today) > DUE_OVERDUE_DAYS)
    .sort((a, b) => b.column.balance - a.column.balance)
  if (overdueDues.length > 0) {
    const count = overdueDues.length
    alerts.push({
      id: 'dues-overdue',
      tone: 'danger',
      title: `${count} due${count === 1 ? '' : 's'} over ${DUE_OVERDUE_DAYS} days`,
      detail: `${overdueDues[0].column.customerName} · ${formatCurrency(overdueDues[0].column.balance)}`,
      to: '/dues',
    })
  }

  const overdueInterest = (ledger?.adaguDues ?? []).filter((row) => row.isInterestOverdue)
  if (overdueInterest.length > 0) {
    alerts.push({
      id: 'adagu-interest-overdue',
      tone: 'danger',
      title:
        overdueInterest.length === 1
          ? '1 Adagu interest is overdue'
          : `${overdueInterest.length} Adagu interests are overdue`,
      detail: overdueInterest
        .slice(0, 3)
        .map((row) => `${row.receiptNo} · ${row.customerName}`)
        .join(', '),
      to: '/dues',
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
