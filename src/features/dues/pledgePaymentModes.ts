import type { PledgePaymentMode } from '@shared/types'

export const PLEDGE_PAYMENT_MODES: { value: PledgePaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'auction', label: 'Auction' },
]

/**
 * Modes a person can pick when collecting money. `transfer` and `auction` are
 * written by the server for renewals and auction sales and are refused as input.
 */
export const PLEDGE_COLLECTION_MODES = PLEDGE_PAYMENT_MODES.filter(
  (option) => option.value !== 'transfer' && option.value !== 'auction',
)

export function pledgePaymentModeLabel(mode: PledgePaymentMode): string {
  return PLEDGE_PAYMENT_MODES.find((option) => option.value === mode)?.label ?? mode
}
