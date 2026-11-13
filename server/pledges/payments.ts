import type Database from 'better-sqlite3'
import { replayPledge } from '@shared/billing/pledgeLedger'
import { roundMoney } from '@shared/billing/pricing'
import type {
  PledgePayment,
  PledgePaymentKind,
  PledgePaymentMode,
  PledgePayoff,
} from '@shared/types'
import { daysBetween } from '@shared/billing/pledgeMath'
import { localTodayIso } from '@shared/localDate'
import { HttpError } from '../lib/http'
import { syncDueEntryForPledge } from '../dues/pledgeSync'
import {
  capLedgerDate,
  loadPledgeCore,
  loadPledgePayments,
  loadPledgeTranches,
  mapPledgePayment,
  pledgeAsOfDate,
  pledgeLedgerCap,
  replayForPledge,
  toLedgerPayments,
  type PledgeLedgerCore,
  type PledgePaymentDbRow,
} from './ledger'

const EPSILON = 0.01

export type RecordPledgePaymentInput = {
  pledgeId: number
  date: string
  amount: number
  discount?: number
  mode: PledgePaymentMode
  kind: PledgePaymentKind
  note?: string
  /** UPI / bank transaction reference. */
  reference?: string
  /** Close the loan automatically once the principal reaches zero. */
  closeWhenSettled?: boolean
  /** Allow recording on a forfeited (auctioned) pledge, e.g. auction shortfall. */
  allowForfeited?: boolean
}

export function requireActivePledge(
  db: Database.Database,
  pledgeId: number,
  allowForfeited = false,
): PledgeLedgerCore {
  const pledge = loadPledgeCore(db, pledgeId)
  if (!pledge) throw new HttpError(404, 'Pledge not found')
  if (pledge.status === 'forfeited' && allowForfeited) return pledge
  if (pledge.status !== 'active') {
    throw new HttpError(400, 'Only active Adagu pledges can receive payments')
  }
  return pledge
}

function mapPayoff(
  pledge: PledgeLedgerCore,
  asOfDate: string,
  result: ReturnType<typeof replayPledge>,
): PledgePayoff {
  return {
    asOfDate,
    principalOutstanding: result.principalOutstanding,
    assessedInterest: result.assessedInterest,
    currentInterest: result.currentInterest,
    interestCredit: result.interestCredit,
    interestDue: result.interestDue,
    totalDiscount: result.totalDiscount,
    grossDue: result.grossDue,
    payoff: result.payoff,
    daysActive: daysBetween(pledge.pledge_date, asOfDate),
    interestPaidUpto: result.interestPaidUpto,
    nextInterestDue: result.nextInterestDue,
    isInterestOverdue: result.isInterestOverdue,
    monthlyInterest: result.monthlyInterest,
  }
}

/** Replay a pledge at a date (defaults to its own as-of date). */
export function computePledgePayoff(
  db: Database.Database,
  pledgeId: number,
  asOfDate?: string,
): PledgePayoff | null {
  const pledge = loadPledgeCore(db, pledgeId)
  if (!pledge) return null
  const date = asOfDate || pledgeAsOfDate(pledge)
  const { result } = replayForPledge(db, pledge, date)
  return mapPayoff(pledge, date, result)
}

function syncPledgeCollected(db: Database.Database, pledgeId: number): number {
  // A renewal moves principal to the new ticket as a `transfer` row. That is
  // bookkeeping, not money collected, so it stays out of the running total.
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS n FROM pledge_payments
       WHERE pledge_id = ? AND mode != 'transfer'`,
    )
    .get(pledgeId) as { n: number }
  const collected = roundMoney(row.n)
  db.prepare('UPDATE pledges SET amount_collected = ? WHERE id = ?').run(collected, pledgeId)
  return collected
}

/**
 * The one place a pledge payment is written. Splits the money into interest and
 * principal, records the money-ledger row, updates the collection cache, and
 * closes the loan when the principal is cleared.
 */
export function recordPledgePayment(
  db: Database.Database,
  input: RecordPledgePaymentInput,
): PledgePayment {
  const pledge = requireActivePledge(db, input.pledgeId, input.allowForfeited)

  if (input.date < pledge.pledge_date) {
    throw new HttpError(400, 'Payment date cannot be before the pledge date')
  }

  const { base, topups } = loadPledgeTranches(db, pledge)
  const existing = loadPledgePayments(db, pledge.id)
  const lastPayment = existing[existing.length - 1]
  if (lastPayment && input.date < lastPayment.paymentDate) {
    throw new HttpError(400, 'Payment date cannot be before the last payment')
  }
  // A mistyped future date (2027 for 2026) would block every correct payment
  // after it. Auction sales are the exception: the notice period can only end
  // after the repayment due date, which is never earlier than today.
  if (input.kind !== 'auction' && input.date > localTodayIso()) {
    throw new HttpError(400, 'Payment date cannot be in the future')
  }

  // A forfeited loan freezes at its auction date: interest must not grow while
  // a shortfall sits uncollected, so the replay dates are clamped there.
  const cap = pledgeLedgerCap(pledge)
  const replayDate = capLedgerDate(input.date, cap)
  const ledgerPayments = toLedgerPayments(existing).map((payment) => ({
    ...payment,
    date: capLedgerDate(payment.date, cap),
  }))

  const amount = roundMoney(Math.max(0, input.amount))
  const discount = roundMoney(Math.max(0, input.discount ?? 0))

  const before = replayPledge({
    base,
    topups,
    payments: ledgerPayments,
    asOfDate: replayDate,
  })
  if (amount + discount > before.payoff + EPSILON) {
    throw new HttpError(
      400,
      `Payment exceeds the payoff of ${before.payoff.toFixed(2)}`,
    )
  }

  const after = replayPledge({
    base,
    topups,
    // Not stored yet, so it sorts after every recorded payment and top-up.
    payments: [
      ...ledgerPayments,
      { date: replayDate, amount, discount, seq: Number.MAX_SAFE_INTEGER },
    ],
    asOfDate: replayDate,
  })
  const allocation = after.allocations[after.allocations.length - 1]
  const note = input.note ?? ''

  const info = db
    .prepare(
      `INSERT INTO pledge_payments (
         pledge_id, payment_date, kind, mode, amount, interest_part, principal_part, discount, note,
         reference
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      pledge.id,
      input.date,
      input.kind,
      input.mode,
      amount,
      allocation.interestPart,
      allocation.principalPart,
      discount,
      note,
      (input.reference ?? '').trim(),
    )
  const paymentId = Number(info.lastInsertRowid)

  db.prepare(
    `INSERT INTO customer_dues (
       customer_id, entry_date, kind, amount, note, mode, pledge_id, pledge_payment_id, created_at
     ) VALUES (?, ?, 'payment', ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(pledge.customer_id, input.date, amount, note, input.mode, pledge.id, paymentId)

  const collected = syncPledgeCollected(db, pledge.id)

  // A forfeited loan keeps its status: collecting the shortfall settles the
  // books but must not reopen or redeem the loan.
  const closeWhenSettled = (input.closeWhenSettled ?? true) && pledge.status === 'active'
  if (closeWhenSettled && after.principalOutstanding <= EPSILON && after.overpayment <= EPSILON) {
    db.prepare(
      `UPDATE pledges SET status = 'redeemed', redeemed_date = ?, amount_collected = ? WHERE id = ?`,
    ).run(input.date, collected, pledge.id)
  }

  syncDueEntryForPledge(db, pledge.id)
  return mapPaymentById(db, paymentId)
}

export function mapPaymentById(db: Database.Database, paymentId: number): PledgePayment {
  const row = db
    .prepare(
      `SELECT id, pledge_id, payment_date, kind, mode, amount, interest_part,
              principal_part, discount, note, reference, created_at
       FROM pledge_payments WHERE id = ?`,
    )
    .get(paymentId) as PledgePaymentDbRow | undefined
  if (!row) throw new HttpError(404, 'Payment not found')
  return mapPledgePayment(row)
}

/**
 * Remove the most recent payment and rebuild the pledge state. Only the latest
 * payment can be removed, so earlier interest periods stay consistent.
 */
export function deleteLatestPledgePayment(
  db: Database.Database,
  pledgePaymentId: number,
): number {
  const row = db
    .prepare('SELECT id, pledge_id, payment_date, kind FROM pledge_payments WHERE id = ?')
    .get(pledgePaymentId) as
    | { id: number; pledge_id: number; payment_date: string; kind: string }
    | undefined
  if (!row) throw new HttpError(404, 'Payment not found')

  const pledge = loadPledgeCore(db, row.pledge_id)
  if (!pledge) throw new HttpError(404, 'Pledge not found')
  // Renewals and auctions are structural: undoing them would leave the linked
  // tickets and the auction record inconsistent.
  if (pledge.status !== 'active' && pledge.status !== 'redeemed') {
    throw new HttpError(400, 'Only an active or redeemed loan can undo a payment')
  }
  if (row.kind === 'transfer' || row.kind === 'renewal' || row.kind === 'auction') {
    throw new HttpError(400, 'Renewal, transfer and auction payments cannot be undone')
  }

  const latest = db
    .prepare(
      `SELECT id FROM pledge_payments WHERE pledge_id = ?
       ORDER BY payment_date DESC, id DESC LIMIT 1`,
    )
    .get(row.pledge_id) as { id: number } | undefined
  if (!latest || latest.id !== row.id) {
    throw new HttpError(400, 'Only the latest payment can be removed')
  }

  // Jewels released before released_assessed_value existed had item_value
  // subtracted, so that is what goes back for them.
  const released = db
    .prepare(
      `SELECT COALESCE(SUM(COALESCE(released_assessed_value, item_value)), 0) AS value
       FROM pledge_items WHERE released_payment_id = ?`,
    )
    .get(row.id) as { value: number }
  if (released.value > 0) {
    const current = db
      .prepare('SELECT assessed_value FROM pledges WHERE id = ?')
      .get(row.pledge_id) as { assessed_value: number }
    db.prepare('UPDATE pledges SET assessed_value = ? WHERE id = ?').run(
      roundMoney(current.assessed_value + released.value),
      row.pledge_id,
    )
  }
  db.prepare(
    `UPDATE pledge_items
     SET released_at = NULL, released_payment_id = NULL, released_assessed_value = NULL
     WHERE released_payment_id = ?`,
  ).run(row.id)

  db.prepare('DELETE FROM customer_dues WHERE pledge_payment_id = ?').run(row.id)
  db.prepare('DELETE FROM pledge_payments WHERE id = ?').run(row.id)

  const collected = syncPledgeCollected(db, row.pledge_id)
  const ledger = computePledgePayoff(db, row.pledge_id)
  if (ledger && ledger.principalOutstanding > EPSILON) {
    db.prepare(
      `UPDATE pledges SET status = 'active', redeemed_date = NULL, amount_collected = ?
       WHERE id = ? AND status = 'redeemed'`,
    ).run(collected, row.pledge_id)
  }

  syncDueEntryForPledge(db, row.pledge_id)
  return row.pledge_id
}
