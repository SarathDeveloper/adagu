import type { PledgeReminderEntry, PledgeReminderReason } from '@shared/types'

export function reasonInfo(reason: PledgeReminderReason): {
  label: string
  tone: 'urgent' | 'warn'
} {
  switch (reason) {
    case 'interest_overdue':
      return { label: 'Interest overdue', tone: 'urgent' }
    case 'interest_due':
      return { label: 'Interest due soon', tone: 'warn' }
    case 'auction_notice':
      return { label: 'Send auction notice', tone: 'urgent' }
    case 'auction_due':
      return { label: 'Ready to auction', tone: 'urgent' }
    default:
      return { label: 'Matures soon', tone: 'warn' }
  }
}

/** Still to send in today's queue: has a WhatsApp link and was neither sent nor skipped today. */
export function isQueueable(row: PledgeReminderEntry): boolean {
  return Boolean(row.whatsappUrl) && !row.remindedToday && !row.skippedToday
}
