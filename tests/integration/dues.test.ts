import { describe, expect, it } from 'vitest'
import { getTestAgent, invokeIpcForTests } from './helpers/testEnv'
import { IPC_CHANNELS, ipc, useIntegrationEnv } from './helpers/testEnv'

describe('dues IPC', () => {
  useIntegrationEnv()

  it('posts Adagu pledge outstanding onto the dues ledger and accepts collection', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Adagu Due Customer',
      phone: '9000000012',
      address: 'Salem',
      notes: '',
    })

    const created = await getTestAgent().post('/api/pledges').send({
      customerId: customer.id,
      pledgeDate: '2026-09-26',
      assessedValue: 20000,
      loanAmount: 10000,
      interestPct: 2.1,
      repaymentDueDate: '2026-10-26',
      items: [
        {
          description: 'Bangle',
          metal: 'Gold',
          purity: '22K',
          grossWeight: 8,
          netWeight: 8,
          pieces: 1,
        },
      ],
    })
    expect(created.status).toBe(201)
    expect(created.body.status).toBe('draft')
    const pledge = created.body as { id: number; receiptNo: string; loanAmount: number }

    const ledgerBefore = await ipc(IPC_CHANNELS.DUES_LIST)
    const columnBefore = ledgerBefore.columns.find((entry) => entry.customerId === customer.id)
    expect(columnBefore?.entries.some((e) => e.pledgeId === pledge.id)).toBeFalsy()

    const sanctioned = await getTestAgent().post(`/api/pledges/${pledge.id}/sanction`)
    expect(sanctioned.status).toBe(200)
    expect(sanctioned.body.status).toBe('active')

    const ledger = await ipc(IPC_CHANNELS.DUES_LIST)
    const column = ledger.columns.find((entry) => entry.customerId === customer.id)
    expect(column).toBeDefined()
    const dueEntry = column?.entries.find((e) => e.pledgeId === pledge.id && e.kind === 'due')
    expect(dueEntry).toBeDefined()
    expect(dueEntry?.pledgeReceiptNo).toBe(pledge.receiptNo)
    expect(dueEntry?.amount).toBeGreaterThanOrEqual(pledge.loanAmount)
    expect(dueEntry?.balanceDue).toBeGreaterThan(0)
    expect(column?.balance).toBeGreaterThan(0)

    const partial = Math.min(2500, dueEntry!.balanceDue ?? 0)
    const payment = await ipc(IPC_CHANNELS.DUES_RECORD_PAYMENT, {
      dueEntryId: dueEntry!.id,
      amount: partial,
      entryDate: '2026-09-26',
      note: 'Adagu partial',
    })
    expect(payment.kind).toBe('payment')
    expect(payment.amount).toBe(partial)
    expect(payment.pledgeId).toBe(pledge.id)

    const afterPay = await getTestAgent().get(`/api/pledges/${pledge.id}`)
    expect(afterPay.status).toBe(200)
    expect(afterPay.body.amountCollected).toBe(partial)
    expect(afterPay.body.status).toBe('active')

    const afterLedger = await ipc(IPC_CHANNELS.DUES_LIST)
    const colAfter = afterLedger.columns.find((c) => c.customerId === customer.id)
    const dueAfter = colAfter?.entries.find((e) => e.id === dueEntry!.id)
    expect(dueAfter?.balanceDue).toBeLessThan(dueEntry!.balanceDue!)
    expect(colAfter?.balance).toBeLessThan(column!.balance)

    const collected = await getTestAgent().post(`/api/pledges/${pledge.id}/collect`).send({
      amount: 1000,
      collectedDate: '2026-09-26',
    })
    expect(collected.status).toBe(200)
    expect(collected.body.amountCollected).toBe(partial + 1000)

    const afterCollect = await ipc(IPC_CHANNELS.DUES_LIST)
    const colCollect = afterCollect.columns.find((c) => c.customerId === customer.id)
    const payments = colCollect?.entries.filter((e) => e.pledgeId === pledge.id && e.kind === 'payment') ?? []
    const paidSum = payments.reduce((sum, e) => sum + e.amount, 0)
    expect(paidSum).toBe(partial + 1000)

    const adagu = afterCollect.adaguDues?.find((row) => row.pledgeId === pledge.id)
    expect(adagu).toBeDefined()
    expect(adagu?.receiptNo).toBe(pledge.receiptNo)
    expect(adagu?.monthlyInterest).toBeGreaterThan(0)
    expect(adagu?.remaining).toBeGreaterThan(0)
  })

  it('records a manual due entry, takes a payment, and allows editing the entry', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Manual Due Customer',
      phone: '9000000013',
      address: 'Salem',
      notes: '',
    })

    const due = await ipc(IPC_CHANNELS.DUES_CREATE, {
      customerId: customer.id,
      entryDate: '2026-09-24',
      kind: 'due',
      amount: 1500,
      note: 'Opening balance',
    })
    expect(due.kind).toBe('due')
    expect(due.pledgeId).toBeNull()

    const edited = await ipc(IPC_CHANNELS.DUES_UPDATE, {
      id: due.id,
      entryDate: '2026-09-24',
      kind: 'due',
      amount: 1200,
      note: 'Corrected balance',
    })
    expect(edited.amount).toBe(1200)

    const payment = await ipc(IPC_CHANNELS.DUES_RECORD_PAYMENT, {
      dueEntryId: due.id,
      amount: 500,
      entryDate: '2026-09-25',
      note: 'Part payment',
    })
    expect(payment.kind).toBe('payment')

    const ledger = await ipc(IPC_CHANNELS.DUES_LIST)
    const column = ledger.columns.find((entry) => entry.customerId === customer.id)
    expect(column?.balance).toBe(700)

    await ipc(IPC_CHANNELS.DUES_DELETE, payment.id)
    const afterDelete = await ipc(IPC_CHANNELS.DUES_LIST)
    const colAfterDelete = afterDelete.columns.find((entry) => entry.customerId === customer.id)
    expect(colAfterDelete?.balance).toBe(1200)
  })

  it('blocks editing or deleting an Adagu-linked due entry', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Adagu Guard Customer',
      phone: '9000000014',
      address: 'Salem',
      notes: '',
    })

    const created = await getTestAgent().post('/api/pledges').send({
      customerId: customer.id,
      pledgeDate: '2026-09-26',
      assessedValue: 20000,
      loanAmount: 10000,
      interestPct: 2.1,
      repaymentDueDate: '2026-10-26',
      items: [
        { description: 'Chain', metal: 'Gold', purity: '22K', grossWeight: 8, netWeight: 8, pieces: 1 },
      ],
    })
    const pledge = created.body as { id: number }
    await getTestAgent().post(`/api/pledges/${pledge.id}/sanction`)

    const ledger = await ipc(IPC_CHANNELS.DUES_LIST)
    const column = ledger.columns.find((entry) => entry.customerId === customer.id)
    const dueEntry = column?.entries.find((e) => e.pledgeId === pledge.id && e.kind === 'due')!

    const editDue = await invokeIpcForTests(IPC_CHANNELS.DUES_UPDATE, {
      id: dueEntry.id,
      entryDate: '2026-09-24',
      kind: 'due',
      amount: 100,
      note: 'Changed',
    })
    expect(editDue.ok).toBe(false)
    expect(editDue.error).toMatch(/Adagu-linked entries cannot be edited/i)

    const deleteDue = await invokeIpcForTests(IPC_CHANNELS.DUES_DELETE, dueEntry.id)
    expect(deleteDue.ok).toBe(false)
    expect(deleteDue.error).toMatch(/Adagu-linked due entries cannot be deleted/i)
  })
})
