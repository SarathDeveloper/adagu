import { maxLoanForValue } from './pledgeValuation'
import { roundMoney } from './pricing'

const EPSILON = 0.01

export type ReleaseQuoteItem = {
  id: number
  itemValue: number
  netWeight: number
  released: boolean
}

export type ReleaseQuoteInput = {
  active: boolean
  assessedValue: number
  principalOutstanding: number
  interestDue: number
  payoff: number
  ltvPct: number
  items: ReleaseQuoteItem[]
  itemId: number
}

export type ReleaseQuote = {
  itemValue: number
  principalShare: number
  interestDue: number
  extraPrincipal: number
  requiredPrincipal: number
  requiredTotal: number
  remainingAssessedValue: number
  payoff: number
}

/**
 * What the customer must pay to take one jewel back. The last jewel is a full
 * redeem. Interest due is collected in full; principal is that jewel's share,
 * plus enough extra to keep the rest of the loan inside the shop LTV.
 */
export function quotePledgeItemRelease(input: ReleaseQuoteInput): ReleaseQuote {
  if (!input.active) {
    throw new Error('Only an active loan can release an item')
  }
  const held = input.items.filter((item) => !item.released)
  if (held.length < 2) {
    throw new Error('The last jewel is a full redeem, not a partial release')
  }
  const item = held.find((row) => row.id === input.itemId)
  if (!item) {
    throw new Error('That jewel is not on this loan')
  }

  const assessed = roundMoney(Math.max(0, input.assessedValue))
  const principal = roundMoney(Math.max(0, input.principalOutstanding))
  const interest = roundMoney(Math.max(0, input.interestDue))

  let share = 0
  let valueDropped = 0
  if (item.itemValue > EPSILON && assessed > EPSILON) {
    share = roundMoney((Math.min(item.itemValue, assessed) / assessed) * principal)
    valueDropped = roundMoney(Math.min(assessed, item.itemValue))
  } else {
    const weight = held.reduce((sum, row) => sum + Math.max(0, row.netWeight), 0)
    if (weight <= EPSILON) {
      throw new Error('This jewel has no value to release against')
    }
    share = roundMoney((Math.max(0, item.netWeight) / weight) * principal)
  }
  if (share > principal) share = principal

  const remainingAssessed = roundMoney(Math.max(0, assessed - valueDropped))
  const remainingPrincipal = roundMoney(Math.max(0, principal - share))
  const maxRemaining = maxLoanForValue(remainingAssessed, input.ltvPct)
  const extra = roundMoney(Math.max(0, remainingPrincipal - maxRemaining))
  const requiredPrincipal = roundMoney(share + extra)

  if (requiredPrincipal + EPSILON >= principal && principal > EPSILON) {
    throw new Error('Releasing this jewel would clear the loan. Use full redeem.')
  }

  return {
    itemValue: valueDropped,
    principalShare: share,
    interestDue: interest,
    extraPrincipal: extra,
    requiredPrincipal,
    requiredTotal: roundMoney(interest + requiredPrincipal),
    remainingAssessedValue: remainingAssessed,
    payoff: roundMoney(Math.max(0, input.payoff)),
  }
}

/** Staff may pay more principal, but not enough to close the loan. */
export function assertReleaseAmount(quote: ReleaseQuote, amount: number): void {
  const paid = roundMoney(amount)
  if (paid + EPSILON < quote.requiredTotal) {
    throw new Error(`Amount must be at least ${quote.requiredTotal.toFixed(2)}`)
  }
  if (paid + EPSILON >= quote.payoff) {
    throw new Error('That amount would close the loan. Use full redeem.')
  }
}
