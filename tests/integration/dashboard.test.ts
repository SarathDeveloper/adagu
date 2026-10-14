import { describe, expect, it } from 'vitest'
import { addDaysIso } from '../../shared/billing/pledgeMath'
import { localTodayIso } from '../../shared/localDate'
import type { DashboardSearchResult, MainDashboard } from '../../shared/types'
import { getDatabase } from '../../server/db'
import { getTestAgent, useIntegrationEnv } from './helpers/testEnv'

function insertCustomer(name: string, phone: string, createdAt: string): number {
  const result = getDatabase()
    .prepare(`INSERT INTO customers (name, phone, address, notes, created_at) VALUES (?, ?, '', '', ?)`)
    .run(name, phone, createdAt)
  return Number(result.lastInsertRowid)
}

function insertPledge(input: {
  customerId: number
  receiptNo: string
  pledgeDate: string
  loanAmount: number
  dueDate: string | null
  status: 'draft' | 'active' | 'redeemed'
}): number {
  const result = getDatabase()
    .prepare(
      `INSERT INTO pledges (
         customer_id, receipt_no, pledge_date, assessed_value, loan_amount, interest_pct,
         repayment_due_date, status
       ) VALUES (?, ?, ?, ?, ?, 2, ?, ?)`,
    )
    .run(
      input.customerId,
      input.receiptNo,
      input.pledgeDate,
      input.loanAmount * 2,
      input.loanAmount,
      input.dueDate,
      input.status,
    )
  return Number(result.lastInsertRowid)
}

describe('main dashboard API', () => {
  useIntegrationEnv()

  it('counts customers and pledges, and lists due-soon and overdue rows', async () => {
    const today = localTodayIso()
    const weekAgo = addDaysIso(today, -7)
    const eightDaysAgo = addDaysIso(today, -8)
    const threeDaysAgo = addDaysIso(today, -3)
    const priyaId = insertCustomer('Priya Dharshini', '9000000001', today)
    const rameshId = insertCustomer('Ramesh Kumar', '9000000002', weekAgo)
    insertCustomer('Old Customer', '9000000003', eightDaysAgo)

    const overdueId = insertPledge({
      customerId: priyaId,
      receiptNo: 'ADG9001',
      pledgeDate: eightDaysAgo,
      loanAmount: 30000,
      dueDate: addDaysIso(today, -1),
      status: 'active',
    })
    getDatabase()
      .prepare(
        `INSERT INTO pledge_topups (pledge_id, topup_date, amount, interest_pct, note) VALUES (?, ?, 5000, 2, '')`,
      )
      .run(overdueId, today)
    const dueSoonId = insertPledge({
      customerId: rameshId,
      receiptNo: 'ADG9002',
      pledgeDate: today,
      loanAmount: 50000,
      dueDate: addDaysIso(today, 10),
      status: 'active',
    })
    insertPledge({
      customerId: priyaId,
      receiptNo: 'ADG9003',
      pledgeDate: threeDaysAgo,
      loanAmount: 10000,
      dueDate: addDaysIso(today, 60),
      status: 'active',
    })
    insertPledge({
      customerId: rameshId,
      receiptNo: 'ADG9004',
      pledgeDate: weekAgo,
      loanAmount: 8000,
      dueDate: addDaysIso(today, 31),
      status: 'active',
    })
    insertPledge({
      customerId: priyaId,
      receiptNo: 'ADG9005',
      pledgeDate: today,
      loanAmount: 99999,
      dueDate: addDaysIso(today, 10),
      status: 'draft',
    })
    insertPledge({
      customerId: priyaId,
      receiptNo: 'ADG9006',
      pledgeDate: today,
      loanAmount: 1000,
      dueDate: null,
      status: 'redeemed',
    })

    const response = await getTestAgent().get('/api/dashboard')
    expect(response.status).toBe(200)
    const body = response.body as MainDashboard
    expect(body.totalCustomers).toBe(3)
    expect(body.newCustomersThisWeek).toBe(2)
    expect(body.activePledges).toBe(4)
    expect(body.newActivePledgesThisWeek).toBe(3)
    expect(body.todayPledges).toBe(2)
    expect(body.todayPledgesValue).toBe(51000)
    expect(body.dueSoon).toBe(1)
    expect(body.overdue).toBe(1)
    expect(body.attention.map((row) => row.pledgeId)).toEqual([overdueId, dueSoonId])
    expect(body.attention[0]).toMatchObject({
      customerName: 'Priya Dharshini',
      amount: 35000,
      status: 'overdue',
      startDate: eightDaysAgo,
    })
    expect(body.attention[1]).toMatchObject({
      receiptNo: 'ADG9002',
      amount: 50000,
      status: 'active',
    })
  })

  it('searches customers and pledges, and ignores a blank query', async () => {
    const today = localTodayIso()
    const priyaId = insertCustomer('Priya Dharshini', '9111122222', today)
    insertPledge({
      customerId: priyaId,
      receiptNo: 'ADG9101',
      pledgeDate: today,
      loanAmount: 1000,
      dueDate: addDaysIso(today, 5),
      status: 'active',
    })

    const blank = await getTestAgent().get('/api/dashboard/search')
    expect(blank.status).toBe(200)
    expect(blank.body).toEqual({ customers: [], pledges: [] })

    const byName = await getTestAgent().get('/api/dashboard/search').query({ q: 'priya' })
    expect(byName.status).toBe(200)
    const named = byName.body as DashboardSearchResult
    expect(named.customers.map((customer) => customer.name)).toEqual(['Priya Dharshini'])
    expect(named.pledges.map((pledge) => pledge.receiptNo)).toEqual(['ADG9101'])

    const byPhone = await getTestAgent().get('/api/dashboard/search').query({ q: '91111' })
    expect((byPhone.body as DashboardSearchResult).customers).toHaveLength(1)

    const byReceipt = await getTestAgent().get('/api/dashboard/search').query({ q: 'ADG9101' })
    expect((byReceipt.body as DashboardSearchResult).pledges.map((pledge) => pledge.receiptNo)).toEqual([
      'ADG9101',
    ])

    const wildcard = await getTestAgent().get('/api/dashboard/search').query({ q: '%' })
    expect(wildcard.body).toEqual({ customers: [], pledges: [] })
  })
})
