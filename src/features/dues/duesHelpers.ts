import type { DuesLedger } from '@shared/types'

export function emptyDuesLedger(): DuesLedger {
  return { columns: [], totalOutstanding: 0, adaguDues: [], adaguOutstanding: 0 }
}

/** The newest payment on a pledge returned by a collection call. */
export function latestPaymentId(pledge: { payments?: { id: number }[] }): number | null {
  const payments = pledge.payments ?? []
  return payments.reduce<number | null>((max, payment) => (max === null || payment.id > max ? payment.id : max), null)
}
