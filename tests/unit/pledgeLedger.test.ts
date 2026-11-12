import { describe, expect, it } from 'vitest'
import {
  interestMonths,
  partMonthMonths,
  replayPledge,
} from '../../shared/billing/pledgeLedger'

const base = { amount: 10000, rate: 2, date: '2026-01-01' }

describe('pledgeLedger period rules', () => {
  it('charges a minimum of one month for the first period', () => {
    expect(interestMonths(0, true)).toBe(1)
    expect(interestMonths(1, true)).toBe(1)
    expect(interestMonths(30, true)).toBe(1)
    expect(interestMonths(45, true)).toBe(1.5)
    expect(interestMonths(46, true)).toBe(2)
  })

  it('rounds later part-months to half or full', () => {
    expect(partMonthMonths(0)).toBe(0)
    expect(partMonthMonths(15)).toBe(0.5)
    expect(partMonthMonths(16)).toBe(1)
    expect(partMonthMonths(29)).toBe(1)
    expect(partMonthMonths(30)).toBe(1)
    expect(partMonthMonths(61)).toBe(2.5)
    expect(interestMonths(15, false)).toBe(0.5)
    expect(interestMonths(46, false)).toBe(2)
  })
})

describe('replayPledge', () => {
  it('charges one month when the loan is closed the same day', () => {
    const result = replayPledge({ base, asOfDate: '2026-01-01' })
    expect(result.currentInterest).toBe(200)
    expect(result.interestDue).toBe(200)
    expect(result.payoff).toBe(10200)
  })

  it('charges one month on day one', () => {
    const result = replayPledge({ base, asOfDate: '2026-01-02' })
    expect(result.currentInterest).toBe(200)
    expect(result.payoff).toBe(10200)
  })

  it('charges one and a half months at 45 days', () => {
    expect(replayPledge({ base, asOfDate: '2026-02-15' }).currentInterest).toBe(300)
    expect(replayPledge({ base, asOfDate: '2026-02-16' }).currentInterest).toBe(400)
  })

  it('holds a partial interest payment as credit without closing the period', () => {
    const result = replayPledge({
      base,
      asOfDate: '2026-01-31',
      payments: [{ date: '2026-01-31', amount: 100 }],
    })
    expect(result.interestCredit).toBe(100)
    expect(result.interestDue).toBe(100)
    expect(result.assessedInterest).toBe(0)
    expect(result.payoff).toBe(10100)
    expect(result.allocations[0].interestPart).toBe(100)
  })

  it('reduces later interest when the principal is repaid', () => {
    const result = replayPledge({
      base,
      asOfDate: '2026-03-02',
      payments: [{ date: '2026-01-31', amount: 5100 }],
    })
    expect(result.principalOutstanding).toBe(5100)
    expect(result.assessedInterest).toBe(200)
    expect(result.currentInterest).toBe(102)
    expect(result.payoff).toBe(5202)
  })

  it('accrues interest on each top-up from its own date', () => {
    const result = replayPledge({
      base,
      topups: [{ amount: 5000, rate: 2, date: '2026-02-01' }],
      asOfDate: '2026-03-01',
    })
    expect(result.currentInterest).toBe(500)
    expect(result.principalOutstanding).toBe(15000)
    expect(result.monthlyInterest).toBe(300)
    expect(result.payoff).toBe(15500)
  })

  it('applies a discount to interest before principal', () => {
    const result = replayPledge({
      base,
      asOfDate: '2026-01-31',
      payments: [{ date: '2026-01-31', amount: 100, discount: 100 }],
    })
    expect(result.totalDiscount).toBe(100)
    expect(result.payoff).toBe(10000)
    expect(result.grossDue).toBe(10100)
  })

  it('settles the loan exactly when the payoff is paid', () => {
    const result = replayPledge({
      base,
      asOfDate: '2026-01-31',
      payments: [{ date: '2026-01-31', amount: 10200 }],
    })
    expect(result.principalOutstanding).toBe(0)
    expect(result.payoff).toBe(0)
    expect(result.grossDue).toBe(10200)
  })

  it('allows interest to be paid in advance', () => {
    const result = replayPledge({
      base,
      asOfDate: '2026-01-20',
      payments: [
        { date: '2026-01-05', amount: 200 },
        { date: '2026-01-20', amount: 10000 },
      ],
    })
    expect(result.currentInterest).toBe(0)
    expect(result.principalOutstanding).toBe(0)
    expect(result.grossDue).toBe(10200)
  })

  it('keeps the gross due equal to the money collected once settled', () => {
    const collected = 10200
    const result = replayPledge({
      base,
      asOfDate: '2026-01-31',
      payments: [{ date: '2026-01-31', amount: collected }],
    })
    expect(result.grossDue).toBe(collected)
  })
})

describe('pledgeLedger top-up ordering', () => {
  // Base 10000 @2% from 1 Jan. On 31 Jan the customer pays the 200 interest,
  // then takes a 5000 top-up the same day.
  const topup = { amount: 5000, rate: 2, date: '2026-01-31', afterPaymentSeq: 1 }
  const interestPaid = { date: '2026-01-31', amount: 200, seq: 1 }

  it('keeps a payment taken before a same-day top-up fully covering its interest', () => {
    const result = replayPledge({
      base,
      topups: [topup],
      payments: [interestPaid],
      asOfDate: '2026-01-31',
    })
    expect(result.allocations[0].coversInterest).toBe(true)
    expect(result.allocations[0].interestPart).toBe(200)
    // The base is paid to 31 Jan; only the new top-up owes its first month.
    expect(result.interestDue).toBe(100)
    expect(result.interestPaidUpto).toBe('2026-01-31')
    expect(result.isInterestOverdue).toBe(false)
  })

  it('still lets a payment taken after a same-day top-up close the loan', () => {
    const before = replayPledge({
      base,
      topups: [topup],
      payments: [interestPaid],
      asOfDate: '2026-01-31',
    })
    const result = replayPledge({
      base,
      topups: [topup],
      payments: [interestPaid, { date: '2026-01-31', amount: before.payoff, seq: 2 }],
      asOfDate: '2026-01-31',
    })
    expect(result.principalOutstanding).toBe(0)
    expect(result.overpayment).toBe(0)
    expect(result.allocations[1].interestPart).toBe(100)
  })

  it('treats a same-day payment as after the top-up when the order is unknown', () => {
    const result = replayPledge({
      base,
      topups: [{ amount: 5000, rate: 2, date: '2026-01-31' }],
      payments: [{ date: '2026-01-31', amount: 200 }],
      asOfDate: '2026-01-31',
    })
    // Previous behaviour for top-ups recorded before the order was stored.
    expect(result.allocations[0].coversInterest).toBe(false)
  })
})

describe('pledgeLedger interest-paid-up-to', () => {
  it('ignores a tranche that has been repaid in full', () => {
    // Base 10000 from 1 Jan, top-up 50000 on 15 Jan. A part payment on 31 Jan
    // clears all interest and the whole base; the top-up keeps accruing.
    const result = replayPledge({
      base,
      topups: [{ amount: 50000, rate: 2, date: '2026-01-15' }],
      payments: [
        { date: '2026-01-31', amount: 200 + 1000 + 10000 },
        { date: '2026-02-14', amount: 1000 },
        { date: '2026-03-16', amount: 1000 },
      ],
      asOfDate: '2026-03-20',
    })
    expect(result.tranches[0].amount).toBe(0)
    expect(result.interestPaidUpto).toBe('2026-03-16')
    expect(result.isInterestOverdue).toBe(false)
  })
})
