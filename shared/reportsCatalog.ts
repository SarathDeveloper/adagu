export const REPORT_IDS = [
  'customer-list',
  'customer-outstanding',
  'active-pledges',
  'closed-pledges',
  'due-pledges',
  'customer-wise-pledges',
  'pledge-transactions',
  'adagu-interest-income',
  'adagu-collections-by-mode',
  'adagu-discounts',
  'adagu-auctions',
] as const

export type ReportId = (typeof REPORT_IDS)[number]

export type ReportGroupId = 'customer' | 'pledge'

export type ReportDateScope = 'range' | 'asOf' | 'none'

export type ReportFilter = 'customer'

export type ReportColumnFormat = 'text' | 'money' | 'weight' | 'qty' | 'date'

export interface ReportColumn {
  key: string
  label: string
  align?: 'left' | 'right'
  format?: ReportColumnFormat
  total?: boolean
}

export interface ReportResult {
  columns: ReportColumn[]
  rows: Record<string, string | number>[]
  totals: Record<string, number>
}

export interface ReportLookups {
  customers: { id: number; name: string }[]
}

export interface ReportDefinition {
  id: ReportId
  group: ReportGroupId
  title: string
  dateScope: ReportDateScope
  defaultToday?: boolean
  filters: ReportFilter[]
  available: boolean
  unavailableReason?: string
  note?: string
}

export const REPORT_GROUPS: { id: ReportGroupId; label: string }[] = [
  { id: 'pledge', label: 'Adagu / Pledge Reports' },
  { id: 'customer', label: 'Customer Reports' },
]

export const REPORTS: ReportDefinition[] = [
  { id: 'active-pledges', group: 'pledge', title: 'Active Pledges', dateScope: 'none', filters: ['customer'], available: true },
  { id: 'closed-pledges', group: 'pledge', title: 'Closed Pledges', dateScope: 'range', filters: ['customer'], available: true },
  { id: 'due-pledges', group: 'pledge', title: 'Due / Overdue Pledges', dateScope: 'asOf', filters: ['customer'], available: true },
  { id: 'customer-wise-pledges', group: 'pledge', title: 'Customer-wise Pledges', dateScope: 'none', filters: ['customer'], available: true },
  { id: 'pledge-transactions', group: 'pledge', title: 'Pledge Transactions', dateScope: 'range', filters: ['customer'], available: true },
  { id: 'adagu-interest-income', group: 'pledge', title: 'Adagu Interest Income', dateScope: 'range', filters: ['customer'], available: true },
  { id: 'adagu-collections-by-mode', group: 'pledge', title: 'Adagu Collections by Mode', dateScope: 'range', filters: ['customer'], available: true },
  { id: 'adagu-discounts', group: 'pledge', title: 'Adagu Discounts', dateScope: 'range', filters: ['customer'], available: true },
  { id: 'adagu-auctions', group: 'pledge', title: 'Adagu Auctions', dateScope: 'range', filters: ['customer'], available: true },
  { id: 'customer-list', group: 'customer', title: 'Customer List', dateScope: 'none', filters: [], available: true },
  { id: 'customer-outstanding', group: 'customer', title: 'Customer Outstanding', dateScope: 'none', filters: ['customer'], available: true },
]

export function findReport(id: string): ReportDefinition | undefined {
  return REPORTS.find((report) => report.id === id)
}

export function reportsInGroup(group: ReportGroupId): ReportDefinition[] {
  return REPORTS.filter((report) => report.group === group)
}
