/**
 * Adagu (pledge) reminder helpers shared by the server and the UI.
 *
 * The WhatsApp link is the only outward channel, so the URL is built in one
 * place and validated again before it is opened.
 */

export const DEFAULT_ADAGU_REMINDER_TEMPLATE =
  'Dear {name}, your Adagu {receiptNo} has an interest of Rs.{interestDue} due on {dueDate}. Kindly pay to avoid further charges.'

export type AdaguReminderVars = {
  name: string
  receiptNo: string
  interestDue: number
  dueDate: string
  principal?: number
  shopName?: string
  /** Full payoff today (principal + interest). */
  totalDue?: number
  /** Shop UPI ID, e.g. `shop@okaxis`. */
  upiId?: string
}

export function renderAdaguReminder(template: string, vars: AdaguReminderVars): string {
  const money = (value: number) => value.toFixed(2)
  const replacements: Record<string, string> = {
    '{name}': vars.name,
    '{receiptNo}': vars.receiptNo,
    '{interestDue}': money(vars.interestDue),
    '{dueDate}': vars.dueDate,
    '{principal}': money(vars.principal ?? 0),
    '{shopName}': vars.shopName ?? '',
    '{totalDue}': money(vars.totalDue ?? 0),
    '{upiId}': vars.upiId ?? '',
  }
  return template.replace(
    /\{(?:name|receiptNo|interestDue|dueDate|principal|shopName|totalDue|upiId)\}/g,
    (token) => replacements[token] ?? token,
  )
}

/**
 * Indian WhatsApp numbers need a country code. Ten digits become `91XXXXXXXXXX`;
 * numbers that already carry the code are kept. Anything unusable returns null.
 */
export function normalizeWhatsAppPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return null
}

/**
 * Percent-encode a reminder body so the finished URL only contains characters
 * that are safe both for a browser and for the Windows `start` command.
 */
export function encodeWhatsAppText(text: string): string {
  return encodeURIComponent(text).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/** Build a `https://wa.me/<number>?text=<message>` link, or null when unusable. */
export function buildAdaguWhatsAppUrl(
  phone: string,
  template: string,
  vars: AdaguReminderVars,
): string | null {
  const number = normalizeWhatsAppPhone(phone)
  if (!number) return null
  const message = renderAdaguReminder(template, vars).trim()
  if (!message) return null
  return `https://wa.me/${number}?text=${encodeWhatsAppText(message)}`
}

/**
 * Only links this app builds are allowed to be opened. Keeping the allowlist
 * tight is what makes the Windows `start` call safe.
 */
export const WHATSAPP_URL_PATTERN = /^https:\/\/wa\.me\/\d{10,15}\?text=[A-Za-z0-9%._~-]+$/

export function isSafeWhatsAppUrl(url: string): boolean {
  return WHATSAPP_URL_PATTERN.test(url)
}

/**
 * When the shop has a UPI ID and the template does not already mention it, add
 * a payment line so every reminder tells the borrower how to pay.
 */
export function withUpiLine(template: string, upiId: string): string {
  if (!upiId.trim() || template.includes('{upiId}')) return template
  return `${template.trimEnd()}\nPay by UPI: {upiId}`
}

/**
 * The same chat opened in the WhatsApp Desktop app instead of a browser tab.
 * Only links that already passed {@link isSafeWhatsAppUrl} are converted.
 */
export function toWhatsAppDesktopUrl(url: string): string | null {
  const match = /^https:\/\/wa\.me\/(\d{10,15})\?text=([A-Za-z0-9%._~-]+)$/.exec(url)
  if (!match) return null
  return `whatsapp://send?phone=${match[1]}&text=${match[2]}`
}

/** Message text carried by a safe wa.me link (for the reminder log). */
export function whatsAppUrlText(url: string): string {
  const encoded = /\?text=([A-Za-z0-9%._~-]+)$/.exec(url)?.[1] ?? ''
  try {
    return decodeURIComponent(encoded)
  } catch {
    return ''
  }
}

/** Phone number a safe wa.me link points at, or null. */
export function whatsAppUrlPhone(url: string): string | null {
  return /^https:\/\/wa\.me\/(\d+)\?/.exec(url)?.[1] ?? null
}

/** Build a wa.me link for already-rendered text. */
export function buildWhatsAppTextUrl(phone: string, text: string): string | null {
  const number = normalizeWhatsAppPhone(phone)
  const message = text.trim()
  if (!number || !message) return null
  return `https://wa.me/${number}?text=${encodeWhatsAppText(message)}`
}

export type ReminderBucket = 'overdue' | 'today' | 'week' | 'later'

/** Morning-queue group for a reminder `daysUntil` days away. */
export function reminderBucket(daysUntil: number): ReminderBucket {
  if (daysUntil < 0) return 'overdue'
  if (daysUntil === 0) return 'today'
  if (daysUntil <= 7) return 'week'
  return 'later'
}

export const DEFAULT_ADAGU_RECEIPT_TEMPLATE =
  'Dear {name}, we received Rs.{amount} on {date} for Adagu {receiptNo}. Interest paid up to {paidUpto}. Balance principal Rs.{principal}. Receipt attached. - {shopName}'

export type AdaguReceiptVars = {
  name: string
  receiptNo: string
  amount: number
  date: string
  paidUpto: string
  principal: number
  shopName: string
  reference: string
}

export function renderAdaguReceiptMessage(template: string, vars: AdaguReceiptVars): string {
  const money = (value: number) => value.toFixed(2)
  const replacements: Record<string, string> = {
    '{name}': vars.name,
    '{receiptNo}': vars.receiptNo,
    '{amount}': money(vars.amount),
    '{date}': vars.date,
    '{paidUpto}': vars.paidUpto,
    '{principal}': money(vars.principal),
    '{shopName}': vars.shopName,
    '{reference}': vars.reference,
  }
  return template.replace(
    /\{(?:name|receiptNo|amount|date|paidUpto|principal|shopName|reference)\}/g,
    (token) => replacements[token] ?? token,
  )
}

/** VPA such as `shopname@okaxis` or `9876543210@ybl`. */
export const UPI_ID_PATTERN = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/

export function isValidUpiId(value: string): boolean {
  return UPI_ID_PATTERN.test(value.trim())
}

/**
 * `upi://pay` intent for an exact amount, as read by every Indian UPI app when
 * the QR is scanned. Returns null without a valid UPI ID or a positive amount.
 */
export function buildUpiPayUrl(input: {
  upiId: string
  payeeName: string
  amount: number
  note?: string
}): string | null {
  const upiId = input.upiId.trim()
  if (!isValidUpiId(upiId) || !(input.amount > 0)) return null
  const params = [
    `pa=${encodeURIComponent(upiId)}`,
    `pn=${encodeURIComponent(input.payeeName.trim().slice(0, 50) || upiId)}`,
    `am=${input.amount.toFixed(2)}`,
    'cu=INR',
  ]
  const note = input.note?.trim().slice(0, 50)
  if (note) params.push(`tn=${encodeURIComponent(note)}`)
  return `upi://pay?${params.join('&')}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `2026-11-13` → `13 Nov 2026` for customer-facing messages; other input is returned as-is. */
export function messageDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim())
  if (!match) return isoDate
  const month = MONTHS[Number(match[2]) - 1]
  return month ? `${Number(match[3])} ${month} ${match[1]}` : isoDate
}
