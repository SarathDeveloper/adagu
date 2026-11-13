import type Database from 'better-sqlite3'
import { replayPledge } from '@shared/billing/pledgeLedger'
import type { PledgePaymentReceipt, PledgeStatus } from '@shared/types'
import { HttpError } from '../lib/http'
import {
  capLedgerDate,
  loadPledgePayments,
  loadPledgeTranches,
  pledgeLedgerCap,
  toLedgerPayments,
  type PledgeLedgerCore,
} from './ledger'
import { mapPaymentById } from './payments'

type ReceiptPledgeRow = PledgeLedgerCore & {
  receipt_no: string
  guardian_name: string | null
  customer_name: string
  customer_phone: string | null
  customer_address: string | null
  customer_guardian: string | null
}

/**
 * The loan as it stood straight after one payment: later payments and later
 * top-ups are left out of the replay, so a reprinted receipt never changes.
 */
export function buildPledgePaymentReceipt(
  db: Database.Database,
  paymentId: number,
): PledgePaymentReceipt {
  const payment = mapPaymentById(db, paymentId)

  const pledge = db
    .prepare(
      `SELECT p.id, p.customer_id, p.pledge_date, p.loan_amount, p.interest_pct, p.status,
              p.redeemed_date, p.receipt_no, p.guardian_name,
              c.name AS customer_name, c.phone AS customer_phone,
              c.address AS customer_address, c.guardian_name AS customer_guardian
       FROM pledges p JOIN customers c ON c.id = p.customer_id
       WHERE p.id = ?`,
    )
    .get(payment.pledgeId) as ReceiptPledgeRow | undefined
  if (!pledge) throw new HttpError(404, 'Pledge not found')

  const { base, topups } = loadPledgeTranches(db, pledge)
  const upToThis = loadPledgePayments(db, pledge.id).filter(
    (row) =>
      row.paymentDate < payment.paymentDate ||
      (row.paymentDate === payment.paymentDate && row.id <= payment.id),
  )
  const topupsSoFar = topups.filter(
    (topup) =>
      topup.date < payment.paymentDate ||
      (topup.date === payment.paymentDate &&
        (topup.afterPaymentSeq == null || topup.afterPaymentSeq < payment.id)),
  )
  const cap = pledgeLedgerCap(pledge)
  const result = replayPledge({
    base,
    topups: topupsSoFar,
    payments: toLedgerPayments(upToThis).map((row) => ({ ...row, date: capLedgerDate(row.date, cap) })),
    asOfDate: capLedgerDate(payment.paymentDate, cap),
  })

  const closedByThis =
    result.principalOutstanding <= 0.01 && pledge.status === 'redeemed' && pledge.redeemed_date === payment.paymentDate

  return {
    payment,
    pledgeId: pledge.id,
    receiptNo: pledge.receipt_no,
    pledgeDate: pledge.pledge_date,
    loanAmount: pledge.loan_amount,
    interestPct: pledge.interest_pct,
    customerName: pledge.customer_name,
    customerPhone: pledge.customer_phone ?? '',
    customerAddress: pledge.customer_address ?? '',
    guardianName: pledge.guardian_name || pledge.customer_guardian || '',
    principalAfter: result.principalOutstanding,
    interestPaidUpto: result.interestPaidUpto,
    nextInterestDue: result.nextInterestDue,
    status: (closedByThis ? 'redeemed' : 'active') as PledgeStatus,
  }
}
