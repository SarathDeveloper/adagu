import { describe, expect, it } from 'vitest'
import { REPORT_IDS, type ReportDefinition, type ReportResult } from '@shared/reportsCatalog'
import { getTestAgent, IPC_CHANNELS, invokeIpcForTests, ipc, useIntegrationEnv } from './helpers/testEnv'

async function seedActivePledge(customerId: number): Promise<{ id: number; receiptNo: string }> {
  const created = await getTestAgent().post('/api/pledges').send({
    customerId,
    pledgeDate: '2026-09-24',
    assessedValue: 20000,
    loanAmount: 10000,
    interestPct: 2.1,
    repaymentDueDate: '2026-10-24',
    items: [
      { description: 'Bangle', metal: 'Gold', purity: '22K', grossWeight: 8, netWeight: 8, pieces: 1 },
    ],
  })
  expect(created.status).toBe(201)
  const pledge = created.body as { id: number; receiptNo: string }
  const sanctioned = await getTestAgent().post(`/api/pledges/${pledge.id}/sanction`)
  expect(sanctioned.status).toBe(200)
  return pledge
}

describe('reports', () => {
  useIntegrationEnv()

  it('exposes only the Adagu and customer reports', async () => {
    const catalog = await ipc<ReportDefinition[]>(IPC_CHANNELS.REPORTS_CATALOG)
    expect(catalog.map((item) => item.id).sort()).toEqual([...REPORT_IDS].sort())
    expect(catalog.every((item) => item.available)).toBe(true)
    expect(catalog.every((item) => item.group === 'pledge' || item.group === 'customer')).toBe(true)
  })

  it('lists an active pledge in the active-pledges report', async () => {
    const customer = await ipc<{ id: number }>(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Buyer',
      phone: '9876543210',
      address: 'Salem',
      notes: '',
    })

    const empty = await ipc<ReportResult>(IPC_CHANNELS.REPORTS_RUN, { id: 'active-pledges' })
    expect(empty.rows).toHaveLength(0)

    const pledge = await seedActivePledge(customer.id)

    const report = await ipc<ReportResult>(IPC_CHANNELS.REPORTS_RUN, { id: 'active-pledges' })
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0]?.receipt).toBe(pledge.receiptNo)
    expect(report.rows[0]?.customer).toBe('Buyer')
    expect(report.rows[0]?.status).toBe('active')
    expect(report.totals.loan).toBe(10000)
  })

  it('rejects an unknown report id', async () => {
    const denied = await invokeIpcForTests(IPC_CHANNELS.REPORTS_RUN, {
      id: 'gross-profit',
      from: '2026-09-01',
      to: '2026-09-30',
    })
    expect(denied.ok).toBe(false)
  })

  it('runs every available report', async () => {
    const catalog = await ipc<ReportDefinition[]>(IPC_CHANNELS.REPORTS_CATALOG)
    const failures: string[] = []
    for (const report of catalog.filter((item) => item.available)) {
      const result = await invokeIpcForTests<ReportResult>(IPC_CHANNELS.REPORTS_RUN, {
        id: report.id,
        from: '2026-09-01',
        to: '2026-09-30',
      })
      if (!result.ok) {
        failures.push(`${report.id}: ${result.error}`)
        continue
      }
      if (result.data.columns.length === 0) {
        failures.push(`${report.id}: no columns`)
      }
    }
    expect(failures).toEqual([])
  })
})
