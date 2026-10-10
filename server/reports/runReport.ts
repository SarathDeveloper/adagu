import { roundMoney } from '@shared/billing/pricing'
import { localTodayIso } from '@shared/localDate'
import { reportQuerySchema } from '@shared/schemas'
import {
  findReport,
  type ReportColumn,
  type ReportDefinition,
  type ReportId,
  type ReportResult,
} from '@shared/reportsCatalog'
import type { z } from 'zod'
import { getDatabase } from '../db'
import { HttpError } from '../lib/http'

type SqlRow = Record<string, unknown>

interface Scope {
  from: string
  to: string
  customerId?: number
  metal?: string
}

const PLEDGE_MODE_LABEL = `CASE pp.mode
  WHEN 'cash' THEN 'Cash'
  WHEN 'upi' THEN 'UPI'
  WHEN 'card' THEN 'Card'
  WHEN 'bank_transfer' THEN 'Bank transfer'
  WHEN 'transfer' THEN 'Transfer'
  WHEN 'auction' THEN 'Auction'
  ELSE pp.mode
END`

function num(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value: unknown): number {
  return roundMoney(num(value))
}

function text(value: unknown): string {
  return value == null ? '' : String(value)
}

function rowsOf(db: ReturnType<typeof getDatabase>, sql: string, params: unknown[]): SqlRow[] {
  return db.prepare(sql).all(...params) as SqlRow[]
}

function result(columns: ReportColumn[], rows: Record<string, string | number>[]): ReportResult {
  const totals: Record<string, number> = {}
  for (const column of columns) {
    if (!column.total) continue
    totals[column.key] = roundMoney(rows.reduce((sum, row) => sum + num(row[column.key]), 0))
  }
  return { columns, rows, totals }
}

export function resolveScope(report: ReportDefinition, query: z.infer<typeof reportQuerySchema>): Scope {
  const today = localTodayIso()
  let from = query.from
  let to = query.to
  if (report.dateScope === 'none') {
    from = '0001-01-01'
    to = '9999-12-31'
  } else if (report.dateScope === 'asOf') {
    const day = query.to ?? query.from ?? today
    from = day
    to = day
  } else {
    from = from ?? (report.defaultToday ? today : `${today.slice(0, 7)}-01`)
    to = to ?? today
  }
  if (from > to) {
    throw new HttpError(400, 'From date must be on or before the to date')
  }
  return {
    from,
    to,
    customerId: query.customerId,
  }
}

function customerClause(column: string, scope: Scope, params: unknown[]): string {
  if (!scope.customerId) return ''
  params.push(scope.customerId)
  return ` AND ${column} = ?`
}

function pledgeCustomer(scope: Scope, params: unknown[], column = 'p.customer_id'): string {
  return customerClause(column, scope, params)
}

function pledgeList(
  db: ReturnType<typeof getDatabase>,
  _scope: Scope,
  where: string,
  params: unknown[] = [],
  includeClosed = false,
) {
  const rows = rowsOf(
    db,
    `SELECT p.pledge_date AS date, p.receipt_no AS receipt, c.name AS customer, p.status AS status,
            p.loan_amount AS loan, p.assessed_value AS assessed, p.amount_collected AS collected,
            p.repayment_due_date AS due_date, p.redeemed_date AS closed_date
     FROM pledges p
     JOIN customers c ON c.id = p.customer_id
     WHERE ${where}
     ORDER BY p.pledge_date, p.id`,
    params,
  )
  const columns: ReportColumn[] = [
    { key: 'date', label: 'Date', format: 'date' },
    { key: 'receipt', label: 'Receipt' },
    { key: 'customer', label: 'Customer' },
    { key: 'status', label: 'Status' },
    { key: 'loan', label: 'Loan', align: 'right', format: 'money', total: true },
    { key: 'assessed', label: 'Assessed', align: 'right', format: 'money', total: true },
    { key: 'collected', label: 'Collected', align: 'right', format: 'money', total: true },
    { key: 'dueDate', label: 'Due date', format: 'date' },
  ]
  if (includeClosed) {
    columns.push({ key: 'closedDate', label: 'Closed date', format: 'date' })
  }
  return result(
    columns,
    rows.map((row) => ({
      date: text(row.date),
      receipt: text(row.receipt),
      customer: text(row.customer),
      status: text(row.status),
      loan: money(row.loan),
      assessed: money(row.assessed),
      collected: money(row.collected),
      dueDate: text(row.due_date),
      ...(includeClosed ? { closedDate: text(row.closed_date) } : {}),
    })),
  )
}

const runners: Record<ReportId, (db: ReturnType<typeof getDatabase>, scope: Scope) => ReportResult> = {
  'customer-list': (db) => {
    const rows = rowsOf(
      db,
      `SELECT name, phone, address, gstin
       FROM customers
       ORDER BY name`,
      [],
    )
    return result(
      [
        { key: 'customer', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'address', label: 'Address' },
        { key: 'gstin', label: 'GSTIN' },
      ],
      rows.map((row) => ({
        customer: text(row.name),
        phone: text(row.phone),
        address: text(row.address),
        gstin: text(row.gstin),
      })),
    )
  },
  'customer-outstanding': (db, scope) => {
    const params: unknown[] = []
    const customer = customerClause('d.customer_id', scope, params)
    const rows = rowsOf(
      db,
      `SELECT c.name AS customer, c.phone AS phone,
              SUM(CASE WHEN d.kind = 'due' THEN d.amount ELSE -d.amount END) AS balance
       FROM customer_dues d
       JOIN customers c ON c.id = d.customer_id
       WHERE 1 = 1${customer}
       GROUP BY d.customer_id
       HAVING balance > 0.009
       ORDER BY balance DESC, c.name`,
      params,
    )
    return result(
      [
        { key: 'customer', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'balance', label: 'Balance', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        customer: text(row.customer),
        phone: text(row.phone),
        balance: money(row.balance),
      })),
    )
  },
  'active-pledges': (db, scope) => {
    const params: unknown[] = []
    const customer = pledgeCustomer(scope, params)
    return pledgeList(db, scope, `p.status = 'active'${customer}`, params)
  },
  'closed-pledges': (db, scope) => {
    const params: unknown[] = [scope.from, scope.to]
    const customer = pledgeCustomer(scope, params)
    return pledgeList(
      db,
      scope,
      `p.status IN ('redeemed', 'forfeited', 'renewed')
       AND COALESCE(p.redeemed_date, p.pledge_date) >= ? AND COALESCE(p.redeemed_date, p.pledge_date) <= ?${customer}`,
      params,
      true,
    )
  },
  'due-pledges': (db, scope) => {
    const params: unknown[] = [scope.to]
    const customer = pledgeCustomer(scope, params)
    const rows = rowsOf(
      db,
      `SELECT p.receipt_no AS receipt, c.name AS customer, p.repayment_due_date AS due_date,
              p.loan_amount AS loan, p.amount_collected AS collected,
              CASE WHEN p.repayment_due_date < ? THEN 'Overdue' ELSE 'Due' END AS due_state
       FROM pledges p
       JOIN customers c ON c.id = p.customer_id
       WHERE p.status = 'active'
         AND p.repayment_due_date IS NOT NULL
         AND TRIM(p.repayment_due_date) != ''
         AND p.repayment_due_date <= ?${customer}
       ORDER BY p.repayment_due_date, p.id`,
      [scope.to, ...params],
    )
    return result(
      [
        { key: 'receipt', label: 'Receipt' },
        { key: 'customer', label: 'Customer' },
        { key: 'dueDate', label: 'Due date', format: 'date' },
        { key: 'state', label: 'Status' },
        { key: 'loan', label: 'Loan', align: 'right', format: 'money', total: true },
        { key: 'collected', label: 'Collected', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        receipt: text(row.receipt),
        customer: text(row.customer),
        dueDate: text(row.due_date),
        state: text(row.due_state),
        loan: money(row.loan),
        collected: money(row.collected),
      })),
    )
  },
  'customer-wise-pledges': (db, scope) => {
    const params: unknown[] = []
    const customer = pledgeCustomer(scope, params)
    const rows = rowsOf(
      db,
      `SELECT c.name AS customer, COUNT(*) AS pledges,
              SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) AS active,
              SUM(p.loan_amount) AS loan, SUM(p.amount_collected) AS collected
       FROM pledges p
       JOIN customers c ON c.id = p.customer_id
       WHERE p.status != 'draft'${customer}
       GROUP BY p.customer_id
       ORDER BY loan DESC, c.name`,
      params,
    )
    return result(
      [
        { key: 'customer', label: 'Customer' },
        { key: 'pledges', label: 'Pledges', align: 'right', format: 'qty', total: true },
        { key: 'active', label: 'Active', align: 'right', format: 'qty', total: true },
        { key: 'loan', label: 'Loan', align: 'right', format: 'money', total: true },
        { key: 'collected', label: 'Collected', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        customer: text(row.customer),
        pledges: num(row.pledges),
        active: num(row.active),
        loan: money(row.loan),
        collected: money(row.collected),
      })),
    )
  },
  'pledge-transactions': (db, scope) => {
    const params: unknown[] = [scope.from, scope.to]
    const customer = pledgeCustomer(scope, params)
    return pledgeList(
      db,
      scope,
      `p.pledge_date >= ? AND p.pledge_date <= ?${customer}`,
      params,
      true,
    )
  },
  'adagu-interest-income': (db, scope) => {
    const params: unknown[] = [scope.from, scope.to]
    const customer = pledgeCustomer(scope, params)
    const rows = rowsOf(
      db,
      `SELECT pp.payment_date AS date, COUNT(*) AS payments, SUM(pp.interest_part) AS interest
       FROM pledge_payments pp
       JOIN pledges p ON p.id = pp.pledge_id
       WHERE pp.interest_part > 0
         AND pp.payment_date >= ? AND pp.payment_date <= ?${customer}
       GROUP BY pp.payment_date
       ORDER BY pp.payment_date`,
      params,
    )
    return result(
      [
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'payments', label: 'Payments', align: 'right', format: 'qty', total: true },
        { key: 'interest', label: 'Interest', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        date: text(row.date).slice(0, 10),
        payments: num(row.payments),
        interest: money(row.interest),
      })),
    )
  },
  'adagu-collections-by-mode': (db, scope) => {
    const params: unknown[] = [scope.from, scope.to]
    const customer = pledgeCustomer(scope, params)
    const rows = rowsOf(
      db,
      `SELECT ${PLEDGE_MODE_LABEL} AS mode, COUNT(*) AS payments,
              SUM(pp.amount) AS amount, SUM(pp.interest_part) AS interest,
              SUM(pp.principal_part) AS principal
       FROM pledge_payments pp
       JOIN pledges p ON p.id = pp.pledge_id
       WHERE pp.payment_date >= ? AND pp.payment_date <= ?${customer}
         AND pp.mode != 'transfer'
       GROUP BY pp.mode
       ORDER BY amount DESC`,
      params,
    )
    return result(
      [
        { key: 'mode', label: 'Mode' },
        { key: 'payments', label: 'Payments', align: 'right', format: 'qty', total: true },
        { key: 'amount', label: 'Amount', align: 'right', format: 'money', total: true },
        { key: 'interest', label: 'Interest', align: 'right', format: 'money', total: true },
        { key: 'principal', label: 'Principal', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        mode: text(row.mode),
        payments: num(row.payments),
        amount: money(row.amount),
        interest: money(row.interest),
        principal: money(row.principal),
      })),
    )
  },
  'adagu-discounts': (db, scope) => {
    const params: unknown[] = [scope.from, scope.to]
    const customer = pledgeCustomer(scope, params)
    const rows = rowsOf(
      db,
      `SELECT pp.payment_date AS date, p.receipt_no AS receipt, c.name AS customer,
              ${PLEDGE_MODE_LABEL} AS mode, pp.amount AS amount, pp.discount AS discount,
              pp.note AS note
       FROM pledge_payments pp
       JOIN pledges p ON p.id = pp.pledge_id
       JOIN customers c ON c.id = p.customer_id
       WHERE pp.discount > 0
         AND pp.payment_date >= ? AND pp.payment_date <= ?${customer}
       ORDER BY pp.payment_date, pp.id`,
      params,
    )
    return result(
      [
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'receipt', label: 'Receipt' },
        { key: 'customer', label: 'Customer' },
        { key: 'mode', label: 'Mode' },
        { key: 'amount', label: 'Paid', align: 'right', format: 'money', total: true },
        { key: 'discount', label: 'Discount', align: 'right', format: 'money', total: true },
        { key: 'note', label: 'Note' },
      ],
      rows.map((row) => ({
        date: text(row.date).slice(0, 10),
        receipt: text(row.receipt),
        customer: text(row.customer),
        mode: text(row.mode),
        amount: money(row.amount),
        discount: money(row.discount),
        note: text(row.note),
      })),
    )
  },
  'adagu-auctions': (db, scope) => {
    const params: unknown[] = [scope.from, scope.to]
    const customer = pledgeCustomer(scope, params)
    const rows = rowsOf(
      db,
      `SELECT pa.auction_date AS date, pa.notice_date AS notice_date, p.receipt_no AS receipt,
              c.name AS customer, pa.buyer_type AS buyer_type, pa.buyer_name AS buyer_name,
              pa.sale_amount AS sale, pa.payoff_at_auction AS payoff,
              pa.surplus_amount AS surplus, pa.surplus_paid_date AS surplus_paid,
              pa.shortfall_amount AS shortfall, pa.shortfall_written_off AS written_off
       FROM pledge_auctions pa
       JOIN pledges p ON p.id = pa.pledge_id
       JOIN customers c ON c.id = p.customer_id
       WHERE pa.auction_date IS NOT NULL
         AND pa.auction_date >= ? AND pa.auction_date <= ?${customer}
       ORDER BY pa.auction_date, p.id`,
      params,
    )
    return result(
      [
        { key: 'date', label: 'Auction date', format: 'date' },
        { key: 'noticeDate', label: 'Notice date', format: 'date' },
        { key: 'receipt', label: 'Receipt' },
        { key: 'customer', label: 'Customer' },
        { key: 'buyer', label: 'Buyer' },
        { key: 'sale', label: 'Sale', align: 'right', format: 'money', total: true },
        { key: 'payoff', label: 'Payoff', align: 'right', format: 'money', total: true },
        { key: 'surplus', label: 'Surplus', align: 'right', format: 'money', total: true },
        { key: 'shortfall', label: 'Shortfall', align: 'right', format: 'money', total: true },
        { key: 'writtenOff', label: 'Written off' },
      ],
      rows.map((row) => ({
        date: text(row.date).slice(0, 10),
        noticeDate: text(row.notice_date).slice(0, 10),
        receipt: text(row.receipt),
        customer: text(row.customer),
        buyer: text(row.buyer_type) === 'shop' ? 'Shop' : text(row.buyer_name) || 'Outside buyer',
        sale: money(row.sale),
        payoff: money(row.payoff),
        surplus: money(row.surplus),
        shortfall: money(row.shortfall),
        writtenOff: num(row.written_off) === 1 ? 'Yes' : 'No',
      })),
    )
  },
}

export function runReport(id: ReportId, query: z.infer<typeof reportQuerySchema>): ReportResult {
  const report = findReport(id)
  if (!report) {
    throw new HttpError(404, 'Report not found')
  }
  if (!report.available) {
    throw new HttpError(400, report.unavailableReason ?? 'This report is not available')
  }
  const scope = resolveScope(report, query)
  return runners[id](getDatabase(), scope)
}
