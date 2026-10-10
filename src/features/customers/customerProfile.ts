import { roundMoney } from '@shared/billing/pricing'
import type {
  AdaguDueSummary,
  CustomerDuesColumn,
  DueEntry,
  GoldSavingAccount,
} from '@shared/types'

export interface CustomerPaymentRow {
  id: string
  date: string
  amount: number
  reference: string | null
}

export interface CustomerDueRow {
  id: number
  date: string
  amount: number
  reference: string | null
}

export interface CustomerAdaguRow {
  pledgeId: number
  receiptNo: string
  pledgeDate: string
  principal: number
  remaining: number
  interestDue: number
  status: AdaguDueSummary['status']
}

export interface CustomerProfileSummary {
  totalPaid: number
  outstanding: number
  activeLoans: number
  interestDue: number
  payments: CustomerPaymentRow[]
  dues: CustomerDueRow[]
  adagu: CustomerAdaguRow[]
  schemes: GoldSavingAccount[]
}

function referenceOf(entry: DueEntry): string | null {
  return entry.pledgeReceiptNo ?? null
}

function byNewestDateThenId<T extends { date: string; id: number | string }>(a: T, b: T): number {
  if (a.date !== b.date) {
    return a.date < b.date ? 1 : -1
  }
  return String(b.id).localeCompare(String(a.id), undefined, { numeric: true })
}

function paymentRows(entries: DueEntry[]): CustomerPaymentRow[] {
  return entries
    .filter((entry) => entry.kind === 'payment')
    .map((entry) => ({
      id: `due-${entry.id}`,
      date: entry.entryDate,
      amount: entry.amount,
      reference: referenceOf(entry),
    }))
    .sort(byNewestDateThenId)
}

function dueRows(entries: DueEntry[]): CustomerDueRow[] {
  return entries
    .filter((entry) => entry.kind === 'due')
    .map((entry) => ({
      id: entry.id,
      date: entry.entryDate,
      amount: entry.amount,
      reference: referenceOf(entry),
    }))
    .sort(byNewestDateThenId)
}

function adaguRows(customerId: number, adaguDues: AdaguDueSummary[]): CustomerAdaguRow[] {
  return (adaguDues ?? [])
    .filter((row) => row.customerId === customerId)
    .map((row) => ({
      pledgeId: row.pledgeId,
      receiptNo: row.receiptNo,
      pledgeDate: row.pledgeDate,
      principal: row.principal,
      remaining: row.remaining,
      interestDue: row.interestDue,
      status: row.status,
    }))
    .sort((a, b) => {
      if (a.pledgeDate !== b.pledgeDate) {
        return a.pledgeDate < b.pledgeDate ? 1 : -1
      }
      return b.pledgeId - a.pledgeId
    })
}

export function buildCustomerProfile(
  customerId: number,
  column?: CustomerDuesColumn,
  adaguDues: AdaguDueSummary[] = [],
  schemes: GoldSavingAccount[] = [],
): CustomerProfileSummary {
  const entries = column?.entries ?? []
  const payments = paymentRows(entries)
  const dues = dueRows(entries)
  const adagu = adaguRows(customerId, adaguDues)
  const customerSchemes = (schemes ?? []).filter((account) => account.customerId === customerId)

  const totalPaid = roundMoney(payments.reduce((sum, row) => sum + row.amount, 0))
  const outstanding = column !== undefined ? column.balance : 0
  const activeLoans = adagu.filter((row) => row.status === 'active' && row.remaining > 0).length
  const interestDue = roundMoney(
    adagu
      .filter((row) => row.status === 'active')
      .reduce((sum, row) => sum + Math.max(row.interestDue, 0), 0),
  )

  return {
    totalPaid,
    outstanding,
    activeLoans,
    interestDue,
    payments,
    dues,
    adagu,
    schemes: customerSchemes,
  }
}
