import { localDateIso } from '@shared/localDate'
import type { AdaguDueSummary, CustomerDocument, CustomerNote } from '@shared/types'
import { formatCurrency, formatWeight } from '../../lib/format'
import type { CustomerPaymentRow } from './customerProfile'

export type CustomerActivityKind = 'adagu' | 'payment' | 'note' | 'document' | 'profile'

export interface CustomerActivityItem {
  key: string
  kind: CustomerActivityKind
  title: string
  detail: string
  /** Local calendar date, YYYY-MM-DD. */
  date: string
  /** Sort key (ms). Date-only events sit at the end of their day. */
  at: number
}

const DOCUMENT_LABELS: Record<CustomerDocument['kind'], string> = {
  photo: 'Profile photo updated',
  aadhaar: 'Aadhaar scan uploaded',
  pan: 'PAN card scan uploaded',
}

/** SQLite `datetime('now')` stamps are UTC without a zone marker. */
export function parseUtcStamp(value: string): Date {
  const trimmed = value.trim()
  if (trimmed.includes('T')) return new Date(trimmed)
  return new Date(`${trimmed.replace(' ', 'T')}Z`)
}

function endOfLocalDay(isoDate: string): number {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1, 23, 59, 59, 999).getTime()
}

function stampItem(stamp: string): { date: string; at: number } {
  const date = parseUtcStamp(stamp)
  if (Number.isNaN(date.getTime())) return { date: stamp.slice(0, 10), at: endOfLocalDay(stamp) }
  return { date: localDateIso(date), at: date.getTime() }
}

function truncate(text: string, max = 80): string {
  const single = text.replace(/\s+/g, ' ').trim()
  return single.length > max ? `${single.slice(0, max - 1)}…` : single
}

export function buildCustomerActivity(input: {
  customerCreatedAt: string
  loans: AdaguDueSummary[]
  payments: CustomerPaymentRow[]
  notes: CustomerNote[]
  documents: CustomerDocument[]
}): CustomerActivityItem[] {
  const items: CustomerActivityItem[] = []

  for (const loan of input.loans) {
    const amount = formatCurrency(loan.loanAmount ?? loan.principal)
    const weight = loan.goldWeight ? ` against ${formatWeight(loan.goldWeight, 3)}` : ''
    items.push({
      key: `adagu-${loan.pledgeId}`,
      kind: 'adagu',
      title: `Adagu ${loan.receiptNo} opened`,
      detail: `${amount}${weight}`,
      date: loan.pledgeDate,
      // Later receipts on the same day sort above earlier ones.
      at: endOfLocalDay(loan.pledgeDate) - 1000 + (loan.pledgeId % 1000),
    })
  }

  for (const payment of input.payments) {
    items.push({
      key: `payment-${payment.id}`,
      kind: 'payment',
      title: `Payment received ${formatCurrency(payment.amount)}`,
      detail: payment.reference ? `On ${payment.reference}` : 'Account payment',
      date: payment.date,
      at: endOfLocalDay(payment.date) - 500,
    })
  }

  for (const note of input.notes) {
    items.push({
      key: `note-${note.id}`,
      kind: 'note',
      title: 'Note added',
      detail: truncate(note.body),
      ...stampItem(note.createdAt),
    })
  }

  for (const document of input.documents) {
    items.push({
      key: `document-${document.id}`,
      kind: 'document',
      title: DOCUMENT_LABELS[document.kind],
      detail: '',
      ...stampItem(document.createdAt),
    })
  }

  items.push({
    key: 'profile-created',
    kind: 'profile',
    title: 'Customer profile created',
    detail: '',
    ...stampItem(input.customerCreatedAt),
  })

  return items.sort((a, b) => b.at - a.at)
}

/** "14 Gandhi Road, Salem" → "Salem": the last comma- or newline-separated part. */
export function cityFromAddress(address: string): string {
  const parts = address
    .split(/[,\n]/)
    .map((part) => part.trim())
    // A trailing PIN code ("Salem - 636001" or "636001") is not the place name.
    .map((part) => part.replace(/[\s-]*\d{6}$/, '').trim())
    .filter(Boolean)
  if (parts.length > 1) return parts[parts.length - 1]
  // A one-part address is a place name only when it has no house number.
  return parts[0] && !/\d/.test(parts[0]) ? parts[0] : ''
}

/** "123456789012" → "XXXX XXXX 9012". */
export function maskAadhaar(aadhaar: string): string {
  const digits = aadhaar.replace(/\D/g, '')
  if (digits.length < 4) return aadhaar
  return `XXXX XXXX ${digits.slice(-4)}`
}

export function formatAadhaar(aadhaar: string): string {
  const digits = aadhaar.replace(/\D/g, '')
  return digits.length === 12 ? digits.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3') : aadhaar
}

export function customerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}
