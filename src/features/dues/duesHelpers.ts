import type { DuesLedger } from '@shared/types'

export function emptyDuesLedger(): DuesLedger {
  return { columns: [], totalOutstanding: 0, adaguDues: [], adaguOutstanding: 0 }
}
