import { describe, expect, it } from 'vitest'
import { assertReleaseAmount, quotePledgeItemRelease } from '../../shared/billing/pledgeRelease'

function item(
  id: number,
  itemValue: number,
  netWeight: number,
  released = false,
) {
  return { id, itemValue, netWeight, released }
}

const base = {
  active: true,
  assessedValue: 40000,
  principalOutstanding: 20000,
  interestDue: 400,
  payoff: 20400,
  ltvPct: 75,
  items: [item(1, 30000, 20), item(2, 10000, 8)],
  itemId: 2,
}

describe('quotePledgeItemRelease', () => {
  it('takes the jewel share of principal plus all interest due', () => {
    const quote = quotePledgeItemRelease(base)
    expect(quote.principalShare).toBe(5000)
    expect(quote.interestDue).toBe(400)
    expect(quote.extraPrincipal).toBe(0)
    expect(quote.requiredPrincipal).toBe(5000)
    expect(quote.requiredTotal).toBe(5400)
    expect(quote.remainingAssessedValue).toBe(30000)
  })

  it('splits by net weight when the jewel has no stored value', () => {
    const quote = quotePledgeItemRelease({
      ...base,
      assessedValue: 10000,
      principalOutstanding: 5000,
      interestDue: 0,
      payoff: 5000,
      items: [item(1, 0, 6), item(2, 0, 4)],
      itemId: 2,
    })
    expect(quote.principalShare).toBe(2000)
    expect(quote.itemValue).toBe(0)
    expect(quote.extraPrincipal).toBe(0)
    expect(quote.remainingAssessedValue).toBe(10000)
  })

  it('adds extra principal when the remaining loan would exceed LTV', () => {
    const quote = quotePledgeItemRelease({
      active: true,
      assessedValue: 10000,
      principalOutstanding: 8000,
      interestDue: 100,
      payoff: 8100,
      ltvPct: 50,
      items: [item(1, 6000, 6), item(2, 4000, 4)],
      itemId: 1,
    })
    expect(quote.principalShare).toBe(4800)
    expect(quote.extraPrincipal).toBe(1200)
    expect(quote.requiredPrincipal).toBe(6000)
    expect(quote.requiredTotal).toBe(6100)
    expect(quote.remainingAssessedValue).toBe(4000)
  })

  it('rejects the last jewel still pledged', () => {
    expect(() =>
      quotePledgeItemRelease({
        ...base,
        items: [item(1, 30000, 20, true), item(2, 10000, 8)],
        itemId: 2,
      }),
    ).toThrow(/full redeem/)
  })

  it('rejects a release that would clear the loan', () => {
    expect(() =>
      quotePledgeItemRelease({
        active: true,
        assessedValue: 1000,
        principalOutstanding: 1000,
        interestDue: 0,
        payoff: 1000,
        ltvPct: 0,
        items: [item(1, 900, 9), item(2, 100, 1)],
        itemId: 1,
      }),
    ).toThrow(/clear the loan/)
  })

  it('rejects an inactive loan and a missing jewel', () => {
    expect(() => quotePledgeItemRelease({ ...base, active: false })).toThrow(/active loan/)
    expect(() => quotePledgeItemRelease({ ...base, itemId: 99 })).toThrow(/not on this loan/)
  })
})

describe('assertReleaseAmount', () => {
  const quote = quotePledgeItemRelease(base)

  it('allows more than the required total while the loan stays open', () => {
    expect(() => assertReleaseAmount(quote, 5400)).not.toThrow()
    expect(() => assertReleaseAmount(quote, 10000)).not.toThrow()
  })

  it('rejects a short payment and a payment that would close the loan', () => {
    expect(() => assertReleaseAmount(quote, 5399)).toThrow(/at least 5400.00/)
    expect(() => assertReleaseAmount(quote, 20400)).toThrow(/close the loan/)
  })
})
