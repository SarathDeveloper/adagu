import { describe, expect, it } from 'vitest'
import {
  clampRepaymentDueDate,
  computePledgeInterest,
  daysBetween,
  defaultRepaymentDueDate,
  formatAdgReceiptNo,
  maxRepaymentDueDate,
  netPaidAmount,
  nextInterestDueDate,
  parseAdgSeq,
  suggestedLoanAmount,
  monthlyPledgeInterestAmount,
  totalPrincipalWithTopups,
  isInterestPeriodDue,
} from '../../shared/billing/pledgeMath'
import { payableAfterOneYear } from '../../shared/billing/pledgeLedger'

describe('pledgeMath', () => {
  it('computes simple interest and suggested loan', () => {
    expect(daysBetween('2026-08-01', '2026-08-31')).toBe(30)
    expect(computePledgeInterest(20000, 1.5, '2026-08-01', '2026-08-31')).toBe(300)
    expect(suggestedLoanAmount(40000, 75)).toBe(30000)
    expect(nextInterestDueDate('2026-08-01', '2026-08-15')).toBe('2026-08-31')
  })

  it('computes net paid and default repayment due', () => {
    expect(netPaidAmount(15000, 300)).toBe(14700)
    expect(netPaidAmount(1000, 1500)).toBe(0)
    expect(defaultRepaymentDueDate('2026-09-26')).toBe('2027-09-26')
  })

  it('computes monthly and one-year summary amounts', () => {
    expect(monthlyPledgeInterestAmount(100000, 2.1)).toBe(2100)
  })

  it('prices one year with the period engine, not days divided by 30', () => {
    // 365 days bills 12.5 months (12 full months plus a 5-day part-month), so
    // this is 50000 + 50000 * 2% * 12.5, not 50000 * 2% * 365/30.
    expect(payableAfterOneYear(50000, 2, '2026-01-01')).toBe(62500)
    expect(payableAfterOneYear(100000, 2.1, '2026-09-26')).toBe(126250)
  })

  it('adds top-up principal and interest from the top-up date only', () => {
    expect(totalPrincipalWithTopups(10000, [{ amount: 2500 }])).toBe(12500)
    expect(isInterestPeriodDue('2026-08-01', '2026-08-30')).toBe(false)
    expect(isInterestPeriodDue('2026-08-01', '2026-08-31')).toBe(true)
  })

  it('formats ADG receipt numbers and clamps due dates', () => {
    expect(formatAdgReceiptNo(1)).toBe('ADG0001')
    expect(formatAdgReceiptNo(12)).toBe('ADG0012')
    expect(formatAdgReceiptNo(10000)).toBe('ADG10000')
    expect(parseAdgSeq('ADG0001')).toBe(1)
    expect(parseAdgSeq('AD-2026-0001')).toBeNull()
    expect(maxRepaymentDueDate('2026-09-26')).toBe('2027-09-26')
    expect(clampRepaymentDueDate('2026-08-01', '2026-09-26')).toBe('2026-09-26')
    expect(clampRepaymentDueDate('2028-01-01', '2026-09-26')).toBe('2027-09-26')
    expect(clampRepaymentDueDate('2026-12-01', '2026-09-26')).toBe('2026-12-01')
  })
})
