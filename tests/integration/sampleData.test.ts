import { describe, expect, it } from 'vitest'
import { getDatabase } from '../../server/db'
import {
  countSeededGoldSavingAccounts,
  countSeededGoldSavingSchemes,
  seedSampleGoldSavingsIfEmpty,
} from '../../server/db/sampleGoldSavings'
import { useIntegrationEnv } from './helpers/testEnv'

describe('gold savings sample seed', () => {
  useIntegrationEnv()

  it('seeds two schemes and five demo accounts on an empty database', () => {
    const db = getDatabase()
    expect(seedSampleGoldSavingsIfEmpty(db)).toBe(true)
    expect(countSeededGoldSavingSchemes(db)).toBe(2)
    expect(countSeededGoldSavingAccounts(db)).toBe(5)

    const accounts = db
      .prepare(
        `SELECT c.name AS name, a.status AS status FROM gold_saving_accounts a JOIN customers c ON c.id = a.customer_id ORDER BY a.id`,
      )
      .all() as { name: string; status: string }[]
    expect(accounts.map((row) => row.name)).toEqual(['Ravi Kumar', 'Priya', 'Suresh', 'Meena', 'Kumar'])
    expect(accounts.find((row) => row.name === 'Kumar')?.status).toBe('cancelled')
  })

  it('does not seed again once accounts exist', () => {
    const db = getDatabase()
    expect(seedSampleGoldSavingsIfEmpty(db)).toBe(true)
    expect(seedSampleGoldSavingsIfEmpty(db)).toBe(false)
    expect(countSeededGoldSavingAccounts(db)).toBe(5)
  })
})
