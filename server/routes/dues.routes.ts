import { Router } from 'express'
import {
  dueEntryInputSchema,
  dueEntryUpdateInputSchema,
  duePaymentInputSchema,
} from '@shared/schemas'
import { daysBetween } from '@shared/billing/pledgeMath'
import { localTodayIso } from '@shared/localDate'
import type {
  AdaguDueSummary,
  CustomerDuesColumn,
  DueEntry,
  DueEntryInput,
  DueEntryKind,
  DueEntryUpdateInput,
  DuePaymentInput,
  DuesLedger,
  PledgeStatus,
} from '@shared/types'
import type Database from 'better-sqlite3'
import { getDatabase } from '../db'
import { refreshActivePledgeDues } from '../dues/pledgeSync'
import { asyncHandler, parseBody, parseIdParam } from '../lib/http'
import { replayForPledge } from '../pledges/ledger'
import { loadPledgeTopups } from '../pledges/topups'
import {
  computePledgePayoff,
  deleteLatestPledgePayment,
  recordPledgePayment,
} from '../pledges/payments'

const router = Router()

type DueEntryRow = {
  id: number
  customer_id: number
  entry_date: string
  kind: DueEntryKind
  amount: number
  note: string
  pledge_id: number | null
  pledge_receipt_no: string | null
  pledge_loan_amount: number | null
  pledge_interest_pct: number | null
  pledge_date: string | null
  pledge_amount_collected: number | null
  pledge_status: string | null
  pledge_redeemed_date: string | null
  created_at: string
}

type CustomerRow = {
  id: number
  name: string
  phone: string
}

function pledgeRemainingFromRow(db: Database.Database, row: DueEntryRow): number | null {
  if (row.pledge_id === null) {
    return null
  }
  const asOf =
    row.pledge_status === 'active'
      ? localTodayIso()
      : row.pledge_redeemed_date || localTodayIso()
  const payoff = computePledgePayoff(db, row.pledge_id, asOf)
  return payoff ? payoff.payoff : null
}

function mapDueEntry(db: Database.Database, row: DueEntryRow): DueEntry {
  const pledgeRemaining = pledgeRemainingFromRow(db, row)
  return {
    id: row.id,
    customerId: row.customer_id,
    entryDate: row.entry_date,
    kind: row.kind,
    amount: row.amount,
    note: row.note,
    pledgeId: row.pledge_id,
    pledgeReceiptNo: row.pledge_receipt_no,
    createdAt: row.created_at,
    balanceDue: pledgeRemaining,
  }
}

function emptyDueEntryStub(customerId: number, kind: DueEntryKind, amount: number): DueEntry {
  return {
    id: 0,
    customerId,
    entryDate: '',
    kind,
    amount,
    note: '',
    pledgeId: null,
    pledgeReceiptNo: null,
    createdAt: '',
    balanceDue: null,
  }
}

function balanceForEntries(entries: DueEntry[]): number {
  let balance = 0
  for (const entry of entries) {
    if (entry.kind === 'due') {
      balance += entry.amount
    } else {
      balance -= entry.amount
    }
  }
  return balance
}

const entrySelectSql = `
  SELECT d.*,
         p.receipt_no AS pledge_receipt_no,
         p.loan_amount AS pledge_loan_amount,
         p.interest_pct AS pledge_interest_pct,
         p.pledge_date AS pledge_date,
         p.amount_collected AS pledge_amount_collected,
         p.status AS pledge_status,
         p.redeemed_date AS pledge_redeemed_date
  FROM customer_dues d
  LEFT JOIN pledges p ON p.id = d.pledge_id
`

function loadDueEntry(db: Database.Database, id: number): DueEntry {
  const row = db.prepare(`${entrySelectSql} WHERE d.id = ?`).get(id) as DueEntryRow | undefined
  if (!row) {
    throw new Error('Due entry not found')
  }
  return mapDueEntry(db, row)
}

function loadDueEntryForPledgePayment(db: Database.Database, pledgePaymentId: number): DueEntry {
  const row = db
    .prepare('SELECT id FROM customer_dues WHERE pledge_payment_id = ?')
    .get(pledgePaymentId) as { id: number } | undefined
  if (!row) {
    throw new Error('Payment ledger row not found')
  }
  return loadDueEntry(db, row.id)
}

function remainingForDue(db: Database.Database, entry: DueEntry): number {
  if (entry.kind !== 'due') {
    throw new Error('Payments can only be recorded against a due entry')
  }

  if (entry.pledgeId !== null) {
    const payoff = computePledgePayoff(db, entry.pledgeId)
    if (!payoff) {
      throw new Error('Pledge not found')
    }
    return payoff.payoff
  }

  const rows = db
    .prepare(
      `SELECT kind, amount FROM customer_dues
       WHERE customer_id = ?
       ORDER BY entry_date ASC, id ASC`,
    )
    .all(entry.customerId) as Array<{ kind: DueEntryKind; amount: number }>

  const columnBalance = balanceForEntries(
    rows.map((row) => emptyDueEntryStub(entry.customerId, row.kind, row.amount)),
  )

  return Math.max(0, Math.min(entry.amount, columnBalance))
}

type PledgeListRow = {
  id: number
  customer_id: number
  receipt_no: string
  pledge_date: string
  loan_amount: number
  interest_pct: number
  amount_collected: number
  status: PledgeStatus
  redeemed_date: string | null
  customer_name: string
  customer_phone: string
  auction_notice_date: string | null
  auction_date: string | null
}

export function buildAdaguDues(
  db: Database.Database,
  term: string,
): { adaguDues: AdaguDueSummary[]; adaguOutstanding: number } {
  const today = localTodayIso()
  const pledges = db
    .prepare(
      `SELECT p.id, p.customer_id, p.receipt_no, p.pledge_date, p.loan_amount, p.interest_pct,
              p.amount_collected, p.status, p.redeemed_date,
              c.name AS customer_name, c.phone AS customer_phone,
              (SELECT notice_date FROM pledge_auctions WHERE pledge_id = p.id) AS auction_notice_date,
              (SELECT auction_date FROM pledge_auctions WHERE pledge_id = p.id) AS auction_date
       FROM pledges p
       JOIN customers c ON c.id = p.customer_id
       WHERE p.status IN ('active', 'redeemed', 'forfeited', 'renewed')
       ORDER BY p.pledge_date DESC, p.id DESC`,
    )
    .all() as PledgeListRow[]

  const dueIdStmt = db.prepare(
    `SELECT id FROM customer_dues WHERE pledge_id = ? AND kind = 'due'`,
  )

  const adaguDues: AdaguDueSummary[] = []
  let adaguOutstanding = 0

  for (const pledge of pledges) {
    if (term) {
      const haystack = `${pledge.customer_name} ${pledge.customer_phone} ${pledge.receipt_no}`.toLowerCase()
      if (!haystack.includes(term)) continue
    }
    const asOf = pledge.status === 'active' ? today : pledge.redeemed_date || today
    const { result } = replayForPledge(db, pledge, asOf)
    const dueRow = dueIdStmt.get(pledge.id) as { id: number } | undefined
    const remaining = Math.max(0, result.payoff)
    adaguOutstanding += remaining
    adaguDues.push({
      pledgeId: pledge.id,
      dueEntryId: dueRow?.id ?? null,
      customerId: pledge.customer_id,
      customerName: pledge.customer_name,
      customerPhone: pledge.customer_phone,
      receiptNo: pledge.receipt_no,
      pledgeDate: pledge.pledge_date,
      principal: result.principalOutstanding,
      principalOutstanding: result.principalOutstanding,
      interestPct: pledge.interest_pct,
      monthlyInterest: result.monthlyInterest,
      daysActive: daysBetween(pledge.pledge_date, asOf),
      interestDue: result.interestDue,
      interestPaidUpto: result.interestPaidUpto,
      nextInterestDue: result.nextInterestDue,
      isInterestOverdue: pledge.status === 'active' && remaining > 0 && result.isInterestOverdue,
      totalDue: result.grossDue,
      amountCollected: pledge.amount_collected,
      remaining,
      status: pledge.status,
      auctionNoticeDate: pledge.auction_notice_date,
      auctionDate: pledge.auction_date,
      topups: loadPledgeTopups(db, pledge.id),
    })
  }

  return { adaguDues, adaguOutstanding }
}

/** Cash / UPI payment recorded against a manual due entry. */
function insertPayment(
  db: Database.Database,
  input: {
    customerId: number
    entryDate: string
    amount: number
    note: string
    mode: string | null
    pledgeId: number | null
  },
): DueEntry {
  const result = db
    .prepare(
      `INSERT INTO customer_dues (customer_id, entry_date, kind, amount, note, mode, invoice_id, pledge_id, created_at)
       VALUES (?, ?, 'payment', ?, ?, ?, NULL, ?, datetime('now'))`,
    )
    .run(input.customerId, input.entryDate, input.amount, input.note, input.mode, input.pledgeId)

  return loadDueEntry(db, Number(result.lastInsertRowid))
}

router.get(
  '/',
  asyncHandler((req, res) => {
    const db = getDatabase()
    refreshActivePledgeDues(db)

    const term = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : ''

    const customers = db
      .prepare(
        `SELECT DISTINCT c.id, c.name, c.phone
         FROM customers c
         INNER JOIN customer_dues d ON d.customer_id = c.id
         ORDER BY c.name COLLATE NOCASE`,
      )
      .all() as CustomerRow[]

    const entryStmt = db.prepare(
      `${entrySelectSql}
       WHERE d.customer_id = ?
       ORDER BY d.entry_date ASC, d.id ASC`,
    )

    const columns: CustomerDuesColumn[] = []
    let totalOutstanding = 0

    for (const customer of customers) {
      if (term) {
        const haystack = `${customer.name} ${customer.phone}`.toLowerCase()
        if (!haystack.includes(term)) {
          continue
        }
      }

      const rows = entryStmt.all(customer.id) as DueEntryRow[]
      const entries = rows.map((row) => mapDueEntry(db, row))
      const balance = balanceForEntries(entries)
      totalOutstanding += balance

      columns.push({
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        balance,
        entries,
      })
    }

    const { adaguDues, adaguOutstanding } = buildAdaguDues(db, term)
    const ledger: DuesLedger = { columns, totalOutstanding, adaguDues, adaguOutstanding }
    res.json(ledger)
  }),
)

router.post(
  '/',
  asyncHandler((req, res) => {
    const input = parseBody(dueEntryInputSchema, req.body) as DueEntryInput
    const db = getDatabase()
    const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(input.customerId)
    if (!customer) {
      throw new Error('Customer not found')
    }

    const result = db
      .prepare(
        `INSERT INTO customer_dues (customer_id, entry_date, kind, amount, note, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(input.customerId, input.entryDate, input.kind, input.amount, input.note)

    res.status(201).json(loadDueEntry(db, Number(result.lastInsertRowid)))
  }),
)

router.put(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(dueEntryUpdateInputSchema, { ...req.body, id }) as DueEntryUpdateInput
    const db = getDatabase()
    const existing = db
      .prepare('SELECT id, pledge_id FROM customer_dues WHERE id = ?')
      .get(input.id) as { id: number; pledge_id: number | null } | undefined

    if (!existing) {
      throw new Error('Due entry not found')
    }
    if (existing.pledge_id !== null) {
      throw new Error('Adagu-linked entries cannot be edited')
    }

    db.prepare(
      `UPDATE customer_dues
       SET entry_date = ?, kind = ?, amount = ?, note = ?
       WHERE id = ?`,
    ).run(input.entryDate, input.kind, input.amount, input.note, input.id)

    res.json(loadDueEntry(db, input.id))
  }),
)

router.delete(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    const existing = db
      .prepare('SELECT id, pledge_id, kind, pledge_payment_id FROM customer_dues WHERE id = ?')
      .get(id) as {
      id: number
      pledge_id: number | null
      kind: DueEntryKind
      pledge_payment_id: number | null
    } | undefined

    if (!existing) {
      throw new Error('Due entry not found')
    }
    if (existing.pledge_id !== null && existing.kind === 'due') {
      throw new Error('Adagu-linked due entries cannot be deleted')
    }

    const pledgeId = existing.pledge_id
    const linkedPledgePayment = pledgeId !== null && existing.kind === 'payment'

    const tx = db.transaction(() => {
      if (linkedPledgePayment && existing.pledge_payment_id !== null) {
        // Removes both the detailed payment and this ledger row, then rebuilds
        // the pledge so earlier interest periods stay consistent.
        deleteLatestPledgePayment(db, existing.pledge_payment_id)
        return
      }

      const result = db.prepare('DELETE FROM customer_dues WHERE id = ?').run(id)
      if (result.changes === 0) {
        throw new Error('Due entry not found')
      }
      if (linkedPledgePayment) {
        refreshActivePledgeDues(db)
      }
    })
    tx()
    res.status(204).end()
  }),
)

router.post(
  '/:id/payment',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(duePaymentInputSchema, { ...req.body, dueEntryId: id }) as DuePaymentInput
    const db = getDatabase()
    const tx = db.transaction(() => {
      const due = loadDueEntry(db, input.dueEntryId)
      const remaining = remainingForDue(db, due)

      if (remaining <= 0) {
        throw new Error('This due is already settled')
      }
      if (input.amount > remaining + 1e-9) {
        throw new Error(`Payment exceeds remaining balance of ${remaining}`)
      }

      const label = due.pledgeReceiptNo ? `Payment for ${due.pledgeReceiptNo}` : 'Payment'
      const note = input.note || label

      if (due.pledgeId !== null) {
        const payoff = computePledgePayoff(db, due.pledgeId, input.entryDate)
        if (!payoff) {
          throw new Error('Pledge not found')
        }
        const kind = input.amount <= payoff.interestDue + 0.01 ? 'interest' : 'part'
        const payment = recordPledgePayment(db, {
          pledgeId: due.pledgeId,
          date: input.entryDate,
          amount: input.amount,
          mode: input.mode ?? 'cash',
          kind,
          note,
        })
        return loadDueEntryForPledgePayment(db, payment.id)
      }

      return insertPayment(db, {
        customerId: due.customerId,
        entryDate: input.entryDate,
        amount: input.amount,
        note,
        mode: input.mode ?? 'cash',
        pledgeId: null,
      })
    })
    res.json(tx())
  }),
)

router.post(
  '/:id/mark-paid',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    const tx = db.transaction(() => {
      const due = loadDueEntry(db, id)
      const remaining = remainingForDue(db, due)

      if (remaining <= 0) {
        throw new Error('This due is already settled')
      }

      const entryDate = localTodayIso()
      const label = due.pledgeReceiptNo ? `Settled ${due.pledgeReceiptNo}` : 'Settled'

      if (due.pledgeId !== null) {
        const payment = recordPledgePayment(db, {
          pledgeId: due.pledgeId,
          date: entryDate,
          amount: remaining,
          mode: 'cash',
          kind: 'redeem',
          note: label,
        })
        return loadDueEntryForPledgePayment(db, payment.id)
      }

      return insertPayment(db, {
        customerId: due.customerId,
        entryDate,
        amount: remaining,
        note: label,
        mode: 'cash',
        pledgeId: null,
      })
    })
    res.json(tx())
  }),
)

export default router
