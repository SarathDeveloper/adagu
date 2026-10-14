import type Database from 'better-sqlite3'
import { roundMoney } from '@shared/billing/pricing'
import type {
  Customer,
  DashboardAttentionRow,
  DashboardAttentionStatus,
  DashboardSearchPledge,
  DashboardSearchResult,
  MainDashboard,
  PledgeStatus,
} from '@shared/types'

type CountRow = { count: number }
type TodayRow = { count: number; value: number }

type AttentionSqlRow = {
  pledge_id: number
  receipt_no: string
  customer_id: number
  customer_name: string
  amount: number
  start_date: string
  due_date: string
  status: DashboardAttentionStatus
}

type CustomerRow = {
  id: number
  name: string
  phone: string
  address: string
  guardian_name: string
  notes: string
  gstin: string
  aadhaar: string
  pan: string
  id_proof_type: string
  created_at: string
}

type PledgeSearchRow = {
  id: number
  receipt_no: string
  customer_name: string
  status: PledgeStatus
}

const ATTENTION_WHERE = `
  p.status = 'active'
  AND p.repayment_due_date IS NOT NULL
  AND TRIM(p.repayment_due_date) != ''
  AND p.repayment_due_date <= date(?, '+30 days')
`

export function getMainDashboard(db: Database.Database, today: string): MainDashboard {
  const weekStart = `date(?, '-7 days')`
  const totalCustomers = count(db, 'SELECT COUNT(*) AS count FROM customers')
  const newCustomersThisWeek = count(
    db,
    `SELECT COUNT(*) AS count FROM customers
     WHERE date(created_at) >= ${weekStart} AND date(created_at) <= ?`,
    [today, today],
  )
  const activePledges = count(db, `SELECT COUNT(*) AS count FROM pledges WHERE status = 'active'`)
  const newActivePledgesThisWeek = count(
    db,
    `SELECT COUNT(*) AS count FROM pledges
     WHERE status = 'active' AND pledge_date >= ${weekStart} AND pledge_date <= ?`,
    [today, today],
  )
  const todayRow = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(loan_amount), 0) AS value
       FROM pledges
       WHERE status != 'draft' AND pledge_date = ?`,
    )
    .get(today) as TodayRow
  const dueSoon = count(
    db,
    `SELECT COUNT(*) AS count FROM pledges
     WHERE status = 'active'
       AND repayment_due_date IS NOT NULL
       AND TRIM(repayment_due_date) != ''
       AND repayment_due_date >= ?
       AND repayment_due_date <= date(?, '+30 days')`,
    [today, today],
  )
  const overdue = count(
    db,
    `SELECT COUNT(*) AS count FROM pledges
     WHERE status = 'active'
       AND repayment_due_date IS NOT NULL
       AND TRIM(repayment_due_date) != ''
       AND repayment_due_date < ?`,
    [today],
  )
  const attention = (
    db
      .prepare(
        `SELECT p.id AS pledge_id, p.receipt_no, p.customer_id, c.name AS customer_name,
                p.loan_amount + COALESCE(
                  (SELECT SUM(t.amount) FROM pledge_topups t WHERE t.pledge_id = p.id),
                  0
                ) AS amount,
                p.pledge_date AS start_date,
                p.repayment_due_date AS due_date,
                CASE WHEN p.repayment_due_date < ? THEN 'overdue' ELSE 'active' END AS status
         FROM pledges p
         JOIN customers c ON c.id = p.customer_id
         WHERE ${ATTENTION_WHERE}
         ORDER BY CASE WHEN p.repayment_due_date < ? THEN 0 ELSE 1 END,
                  p.repayment_due_date,
                  p.id`,
      )
      .all(today, today, today) as AttentionSqlRow[]
  ).map(mapAttention)

  return {
    totalCustomers,
    newCustomersThisWeek,
    activePledges,
    newActivePledgesThisWeek,
    todayPledges: todayRow.count,
    todayPledgesValue: roundMoney(todayRow.value),
    dueSoon,
    overdue,
    attention,
  }
}

export function searchDashboard(db: Database.Database, query: string): DashboardSearchResult {
  const term = query.trim()
  if (!term) return { customers: [], pledges: [] }
  const like = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
  const customers = (
    db
      .prepare(
        `SELECT id, name, phone, address, guardian_name, notes, gstin, aadhaar, pan,
                id_proof_type, created_at
         FROM customers
         WHERE name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\'
         ORDER BY name COLLATE NOCASE, id
         LIMIT 5`,
      )
      .all(like, like) as CustomerRow[]
  ).map(mapCustomer)
  const pledges = (
    db
      .prepare(
        `SELECT p.id, p.receipt_no, c.name AS customer_name, p.status
         FROM pledges p
         JOIN customers c ON c.id = p.customer_id
         WHERE p.receipt_no LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\'
         ORDER BY p.pledge_date DESC, p.id DESC
         LIMIT 5`,
      )
      .all(like, like) as PledgeSearchRow[]
  ).map(mapSearchPledge)
  return { customers, pledges }
}

function count(db: Database.Database, sql: string, params: unknown[] = []): number {
  return (db.prepare(sql).get(...params) as CountRow).count
}

function mapAttention(row: AttentionSqlRow): DashboardAttentionRow {
  return {
    pledgeId: row.pledge_id,
    receiptNo: row.receipt_no,
    customerId: row.customer_id,
    customerName: row.customer_name,
    amount: roundMoney(row.amount),
    startDate: row.start_date,
    dueDate: row.due_date,
    status: row.status,
  }
}

function mapCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    guardianName: row.guardian_name ?? '',
    notes: row.notes,
    gstin: row.gstin ?? '',
    aadhaar: row.aadhaar ?? '',
    pan: row.pan ?? '',
    idProofType: row.id_proof_type ?? '',
    createdAt: row.created_at,
  }
}

function mapSearchPledge(row: PledgeSearchRow): DashboardSearchPledge {
  return {
    id: row.id,
    receiptNo: row.receipt_no,
    customerName: row.customer_name,
    status: row.status,
  }
}
