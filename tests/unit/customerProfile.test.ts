import { describe, expect, it } from 'vitest'
import { buildCustomerProfile } from '../../src/features/customers/customerProfile'
import type {
  AdaguDueSummary,
  CustomerDuesColumn,
  DueEntry,
  GoldSavingAccount,
} from '../../shared/types'

function entry(overrides: Partial<DueEntry> = {}): DueEntry {
  return {
    id: 1,
    customerId: 1,
    entryDate: '2026-09-24',
    kind: 'due',
    amount: 500,
    note: '',
    pledgeId: null,
    pledgeReceiptNo: null,
    createdAt: '',
    balanceDue: null,
    ...overrides,
  }
}

function column(overrides: Partial<CustomerDuesColumn> = {}): CustomerDuesColumn {
  return {
    customerId: 1,
    customerName: 'Test',
    customerPhone: '999',
    balance: 0,
    entries: [],
    ...overrides,
  }
}

function adagu(overrides: Partial<AdaguDueSummary> = {}): AdaguDueSummary {
  return {
    pledgeId: 1,
    dueEntryId: null,
    customerId: 1,
    customerName: 'Test',
    customerPhone: '999',
    receiptNo: 'ADG-2026-0001',
    pledgeDate: '2026-09-20',
    principal: 10000,
    principalOutstanding: 8000,
    interestPct: 2,
    monthlyInterest: 200,
    daysActive: 10,
    interestDue: 150,
    interestPaidUpto: '2026-09-20',
    nextInterestDue: '2026-10-20',
    isInterestOverdue: false,
    totalDue: 8150,
    amountCollected: 0,
    remaining: 8150,
    status: 'active',
    topups: [],
    ...overrides,
  }
}

function account(overrides: Partial<GoldSavingAccount> = {}): GoldSavingAccount {
  return {
    id: 1,
    accountNo: 'GSA-2026-0001',
    customerId: 1,
    customerName: 'Test',
    customerPhone: '999',
    customerAddress: 'Salem',
    schemeId: 1,
    schemeName: 'Monthly Gold',
    schemeCode: 'MG',
    monthlyAmount: 2000,
    durationMonths: 11,
    purity: '22K',
    enrollmentDate: '2026-09-01',
    firstInstallmentDate: '2026-09-01',
    maturityDate: '2027-08-01',
    preferredPaymentDay: null,
    nomineeName: '',
    nomineeRelationship: '',
    nomineePhone: '',
    termsAccepted: true,
    status: 'active',
    closedAt: null,
    paidInstallments: 1,
    pendingInstallments: 10,
    totalPaid: 2000,
    goldAccumulated: 0.2,
    nextDueDate: '2026-10-01',
    createdAt: '',
    ...overrides,
  }
}

describe('buildCustomerProfile', () => {
  it('separates dues and payments from the ledger column', () => {
    const dues = column({
      balance: 700,
      entries: [
        entry({ id: 21, kind: 'due', amount: 1200, pledgeId: 5, pledgeReceiptNo: 'ADG-5' }),
        entry({
          id: 22,
          kind: 'payment',
          amount: 500,
          pledgeId: 5,
          pledgeReceiptNo: 'ADG-5',
          entryDate: '2026-09-25',
        }),
      ],
    })

    const profile = buildCustomerProfile(1, dues)

    expect(profile.outstanding).toBe(700)
    expect(profile.totalPaid).toBe(500)
    expect(profile.payments).toEqual([
      { id: 'due-22', date: '2026-09-25', amount: 500, reference: 'ADG-5' },
    ])
    expect(profile.dues).toEqual([{ id: 21, date: '2026-09-24', amount: 1200, reference: 'ADG-5' }])
  })

  it('keeps only this customer’s Adagu loans and counts the active ones', () => {
    const profile = buildCustomerProfile(1, undefined, [
      adagu({ pledgeId: 1, remaining: 5000 }),
      adagu({ pledgeId: 2, status: 'redeemed', remaining: 0, interestDue: 0 }),
      adagu({ pledgeId: 3, customerId: 2, remaining: 9000 }),
    ])

    expect(profile.adagu.map((row) => row.pledgeId)).toEqual([2, 1])
    expect(profile.activeLoans).toBe(1)
    expect(profile.interestDue).toBe(150)
  })

  it('keeps only this customer’s gold savings accounts', () => {
    const profile = buildCustomerProfile(1, undefined, [], [
      account({ id: 1 }),
      account({ id: 2, customerId: 2 }),
    ])

    expect(profile.schemes.map((row) => row.id)).toEqual([1])
  })
})
