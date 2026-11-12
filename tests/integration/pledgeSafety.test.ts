import { describe, expect, it } from 'vitest'
import { getDatabase } from '../../server/db'
import {
  getTestAgent,
  ipc,
  IPC_CHANNELS,
  loginAsAdmin,
  skipPasswordChange,
  useFrozenToday,
  useIntegrationEnv,
} from './helpers/testEnv'

/**
 * Regression tests for loan bugs found in review: each one reproduces the
 * original failure through the HTTP API and checks the fixed behaviour.
 */

const TODAY = '2026-10-01'

type Item = { id: number; description: string; releasedAt: string | null }

async function createCustomer(name: string, phone: string): Promise<number> {
  const customer = await ipc<{ id: number }>(IPC_CHANNELS.CUSTOMERS_CREATE, {
    name,
    phone,
    address: 'Salem',
    notes: '',
  })
  return customer.id
}

function gold(description: string, netWeight: number, itemValue: number) {
  return { description, metal: 'Gold', purity: '22K', grossWeight: netWeight, netWeight, pieces: 1, itemValue }
}

async function sanctionedLoan(
  name: string,
  phone: string,
  options: { assessedValue?: number; loanAmount?: number; items?: ReturnType<typeof gold>[] } = {},
): Promise<number> {
  const customerId = await createCustomer(name, phone)
  const created = await getTestAgent().post('/api/pledges').send({
    customerId,
    pledgeDate: '2026-08-01',
    assessedValue: options.assessedValue ?? 40000,
    loanAmount: options.loanAmount ?? 20000,
    interestPct: 2,
    items: options.items ?? [gold('Chain', 20, 30000), gold('Ring', 8, 10000)],
  })
  expect(created.status).toBe(201)
  const sanctioned = await getTestAgent().post(`/api/pledges/${created.body.id}/sanction`)
  expect(sanctioned.status).toBe(200)
  return created.body.id as number
}

async function signInAsStaff(username: string, features: string[]): Promise<void> {
  const staff = await getTestAgent()
    .post('/api/users')
    .send({ username, password: 'staff123', role: 'staff', features })
  expect(staff.status).toBe(201)
  skipPasswordChange(username)
  await getTestAgent().post('/api/auth/logout')
  const login = await getTestAgent().post('/api/auth/login').send({ username, password: 'staff123' })
  expect(login.status).toBe(200)
}

async function payoffOn(pledgeId: number, date: string) {
  const res = await getTestAgent().get(`/api/pledges/${pledgeId}/payoff?date=${date}`)
  expect(res.status).toBe(200)
  return res.body as { payoff: number; interestDue: number; principalOutstanding: number }
}

describe('loan safety fixes', () => {
  useFrozenToday(TODAY)
  useIntegrationEnv()

  it('renews only the jewels still held after a partial release', async () => {
    const pledgeId = await sanctionedLoan('Renew After Release', '9100000001')
    const detail = await getTestAgent().get(`/api/pledges/${pledgeId}`)
    const ring = (detail.body.items as Item[]).find((item) => item.description === 'Ring')!
    const { interestDue } = await payoffOn(pledgeId, '2026-08-01')

    const released = await getTestAgent()
      .post(`/api/pledges/${pledgeId}/items/${ring.id}/release`)
      .send({ date: '2026-08-01', amount: interestDue + 5000, mode: 'cash' })
    expect(released.status).toBe(200)
    expect(released.body.assessedValue).toBe(30000)

    const renewed = await getTestAgent().post(`/api/pledges/${pledgeId}/renew`).send({ renewDate: '2026-09-01' })
    expect(renewed.status).toBe(201)
    const items = renewed.body.items as Item[]
    expect(items.map((item) => item.description)).toEqual(['Chain'])
    expect(renewed.body.assessedValue).toBe(30000)
  })

  it('takes the weight share off the assessed value when jewels have no value, and undo restores it', async () => {
    const pledgeId = await sanctionedLoan('Weight Release', '9100000002', {
      assessedValue: 10000,
      loanAmount: 5000,
      items: [gold('Bangle', 6, 0), gold('Stud', 4, 0)],
    })
    const detail = await getTestAgent().get(`/api/pledges/${pledgeId}`)
    const stud = (detail.body.items as Item[]).find((item) => item.description === 'Stud')!
    const { interestDue } = await payoffOn(pledgeId, '2026-08-01')

    const released = await getTestAgent()
      .post(`/api/pledges/${pledgeId}/items/${stud.id}/release`)
      .send({ date: '2026-08-01', amount: interestDue + 2000, mode: 'cash' })
    expect(released.status).toBe(200)
    // Before the fix the assessed value stayed at 10000 after the stud left.
    expect(released.body.assessedValue).toBe(6000)

    const undone = await getTestAgent().delete(`/api/pledges/${pledgeId}/payments/latest`)
    expect(undone.status).toBe(200)
    expect(undone.body.assessedValue).toBe(10000)
  })

  it('lets only an admin give a redeem discount', async () => {
    const pledgeId = await sanctionedLoan('Discount Staff', '9100000003')
    const { payoff } = await payoffOn(pledgeId, TODAY)

    await signInAsStaff('discount-staff', ['adagu'])
    const staffDiscount = await getTestAgent().post(`/api/pledges/${pledgeId}/redeem`).send({
      redeemedDate: TODAY,
      amountCollected: 1,
      discount: payoff - 1,
    })
    expect(staffDiscount.status).toBe(403)
    expect((await getTestAgent().get(`/api/pledges/${pledgeId}`)).body.status).toBe('active')

    const staffFull = await getTestAgent()
      .post(`/api/pledges/${pledgeId}/redeem`)
      .send({ redeemedDate: TODAY, amountCollected: payoff })
    expect(staffFull.status).toBe(200)
    expect(staffFull.body.status).toBe('redeemed')

    await loginAsAdmin()
    const second = await sanctionedLoan('Discount Admin', '9100000004')
    const secondPayoff = (await payoffOn(second, TODAY)).payoff
    const adminDiscount = await getTestAgent()
      .post(`/api/pledges/${second}/redeem`)
      .send({ redeemedDate: TODAY, amountCollected: secondPayoff - 50, discount: 50 })
    expect(adminDiscount.status).toBe(200)
  })

  it('lets only an admin write off an auction shortfall or forfeit a loan', async () => {
    const pledgeId = await sanctionedLoan('Writeoff Staff', '9100000005')
    await signInAsStaff('writeoff-staff', ['adagu'])

    const writeOff = await getTestAgent().post(`/api/pledges/${pledgeId}/auction`).send({
      auctionDate: TODAY,
      buyerType: 'outside',
      saleAmount: 100,
      writeOffShortfall: true,
    })
    expect(writeOff.status).toBe(403)

    const forfeit = await getTestAgent().post(`/api/pledges/${pledgeId}/forfeit`).send({ forfeitedDate: TODAY })
    expect(forfeit.status).toBe(403)

    await loginAsAdmin()
    const beforePledge = await getTestAgent()
      .post(`/api/pledges/${pledgeId}/forfeit`)
      .send({ forfeitedDate: '2026-07-01' })
    expect(beforePledge.status).toBe(400)
    const future = await getTestAgent()
      .post(`/api/pledges/${pledgeId}/forfeit`)
      .send({ forfeitedDate: '2026-10-02' })
    expect(future.status).toBe(400)
    const ok = await getTestAgent().post(`/api/pledges/${pledgeId}/forfeit`).send({ forfeitedDate: TODAY })
    expect(ok.status).toBe(200)
    expect(ok.body.status).toBe('forfeited')
  })

  it('does not let Dues-only staff collect on or settle an Adagu loan', async () => {
    const pledgeId = await sanctionedLoan('Dues Only', '9100000006')
    const due = getDatabase()
      .prepare(`SELECT id FROM customer_dues WHERE pledge_id = ? AND kind = 'due'`)
      .get(pledgeId) as { id: number }
    expect(due?.id).toBeGreaterThan(0)

    await signInAsStaff('dues-only-staff', ['dues'])
    const markPaid = await getTestAgent().post(`/api/dues/${due.id}/mark-paid`)
    expect(markPaid.status).toBe(403)
    const pay = await getTestAgent()
      .post(`/api/dues/${due.id}/payment`)
      .send({ amount: 100, entryDate: TODAY })
    expect(pay.status).toBe(403)

    await loginAsAdmin()
    expect((await getTestAgent().get(`/api/pledges/${pledgeId}`)).body.status).toBe('active')
  })

  it('refuses to delete an Adagu payment row that is not linked to a loan payment', async () => {
    const pledgeId = await sanctionedLoan('Orphan Row', '9100000007')
    const db = getDatabase()
    const pledge = db.prepare('SELECT customer_id FROM pledges WHERE id = ?').get(pledgeId) as {
      customer_id: number
    }
    const inserted = db
      .prepare(
        `INSERT INTO customer_dues (customer_id, entry_date, kind, amount, note, mode, pledge_id, created_at)
         VALUES (?, ?, 'payment', 500, 'legacy', 'cash', ?, datetime('now'))`,
      )
      .run(pledge.customer_id, TODAY, pledgeId)
    const res = await getTestAgent().delete(`/api/dues/${Number(inserted.lastInsertRowid)}`)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/not linked/i)
  })

  it('values the jewels itself when a request sends no assessed value', async () => {
    const customerId = await createCustomer('No Valuation', '9100000008')
    const body = {
      customerId,
      pledgeDate: '2026-08-01',
      assessedValue: 0,
      loanAmount: 900000,
      interestPct: 2,
      items: [gold('Chain', 10, 0)],
    }
    // With no metal rates there is nothing to value the jewels with, so the
    // shop's current behaviour is kept: the loan is not measured.
    const noRates = await getTestAgent().post('/api/pledges').send(body)
    expect(noRates.status).toBe(201)

    // With rates, sending 0 must not skip the check: 10 g of 22K is valued
    // and a 9 lakh loan on it is far above the LTV band.
    const rates = await getTestAgent()
      .post('/api/metal-rates')
      .send({ effectiveDate: TODAY, gold22k: 6000, gold24k: 6500, silverFine: 80 })
    expect(rates.status).toBe(200)
    const blocked = await getTestAgent().post('/api/pledges').send(body)
    expect(blocked.status).toBe(400)
    expect(blocked.body.error).toMatch(/ltv/i)

    const override = await getTestAgent().post('/api/pledges').send({ ...body, allowAboveLtv: true })
    expect(override.status).toBe(201)
    expect(override.body.assessedValue).toBeGreaterThan(0)
  })

  it('keeps a same-day interest payment intact when a top-up follows it', async () => {
    const pledgeId = await sanctionedLoan('Same Day Topup', '9100000009')
    const { interestDue } = await payoffOn(pledgeId, '2026-08-31')
    const interest = await getTestAgent()
      .post(`/api/pledges/${pledgeId}/collect`)
      .send({ collectedDate: '2026-08-31', amount: interestDue })
    expect(interest.status).toBe(200)

    const early = await getTestAgent()
      .post(`/api/pledges/${pledgeId}/topup`)
      .send({ topupDate: '2026-08-15', amount: 5000 })
    expect(early.status).toBe(400)

    const topup = await getTestAgent()
      .post(`/api/pledges/${pledgeId}/topup`)
      .send({ topupDate: '2026-08-31', amount: 5000 })
    expect(topup.status).toBe(201)

    const payments = (await getTestAgent().get(`/api/pledges/${pledgeId}/payments`)).body as Array<{
      interestPart: number
    }>
    expect(payments[0].interestPart).toBeCloseTo(interestDue, 2)
    const payoff = (await getTestAgent().get(`/api/pledges/${pledgeId}/payoff?date=2026-08-31`)).body
    // Before the fix the earlier payment turned into a shortfall and the loan
    // went straight to "interest overdue".
    expect(payoff.isInterestOverdue).toBe(false)
    expect(payoff.interestPaidUpto).toBe('2026-08-31')
  })

  it('reports the current Adagu balance even when the dues snapshot is stale', async () => {
    const pledgeId = await sanctionedLoan('Stale Snapshot', '9100000011')
    const { payoff } = await payoffOn(pledgeId, TODAY)
    // Simulate a snapshot written weeks ago, before more interest accrued.
    getDatabase()
      .prepare(`UPDATE customer_dues SET amount = 20000 WHERE pledge_id = ? AND kind = 'due'`)
      .run(pledgeId)

    const report = await ipc<{ rows: Array<{ customer: string; balance: number }> }>(
      IPC_CHANNELS.REPORTS_RUN,
      { id: 'customer-outstanding', from: '2026-08-01', to: TODAY },
    )
    const row = report.rows.find((entry) => entry.customer === 'Stale Snapshot')
    expect(row?.balance).toBeCloseTo(payoff, 2)
  })

  it('rejects impossible dates, future payments, internal modes and zero renewals', async () => {
    const pledgeId = await sanctionedLoan('Validation', '9100000010')
    const feb30 = await getTestAgent()
      .post(`/api/pledges/${pledgeId}/collect`)
      .send({ collectedDate: '2026-02-30', amount: 100 })
    expect(feb30.status).toBe(400)

    const future = await getTestAgent()
      .post(`/api/pledges/${pledgeId}/collect`)
      .send({ collectedDate: '2027-10-01', amount: 100 })
    expect(future.status).toBe(400)
    expect(future.body.error).toMatch(/future/i)

    for (const mode of ['transfer', 'auction']) {
      const internal = await getTestAgent()
        .post(`/api/pledges/${pledgeId}/collect`)
        .send({ collectedDate: TODAY, amount: 100, mode })
      expect(internal.status).toBe(400)
    }

    const zero = await getTestAgent()
      .post(`/api/pledges/${pledgeId}/renew`)
      .send({ renewDate: TODAY, newLoanAmount: 0 })
    expect(zero.status).toBe(400)
    expect((await getTestAgent().get(`/api/pledges/${pledgeId}`)).body.status).toBe('active')
  })
})
