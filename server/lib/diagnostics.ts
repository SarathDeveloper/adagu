import { ZodError } from 'zod'
import type { LogCategory } from '@shared/types'

const EXPECTED_MESSAGE_PATTERNS = [
  /^Export cancelled$/,
  /^Restore cancelled$/,
  /^Image selection cancelled$/,
  /already used$/,
  /already exists$/,
  /already settled$/,
  /cannot be (modified|finalized|edited|deleted)/i,
  /^Cannot delete customer/,
  /^Cannot close/,
  /^Payments can only be recorded/,
  /^Payment exceeds remaining/,
  /^Image must be 2MB/,
  /^This due is already settled$/,
  /^Choose a printer in Settings\.$/,
  /^Scheme not found$/,
  /^Scheme account not found$/,
  /^Payment not found$/,
  /^No gold rate is configured/,
  /^No gold rate is saved for/,
  /^Manual gold rates are not allowed/,
  /^Late payments are not allowed/,
  /^Customer already has an active account/,
  /^This installment is not eligible/,
  /^No eligible installment remains/,
  /^Only \d+ installment\(s\) remain on this account$/,
  /^Payments cannot be recorded/,
  /^This payment is already reversed$/,
  /^Partial redemption is not allowed/,
  /^Early closure is not allowed/,
  /^Requested gold weight exceeds/,
  /^No accumulated gold is available/,
  /^This scheme account cannot be redeemed/,
  /^Cannot enroll into an inactive scheme$/,
  /^This scheme is not yet available$/,
  /^This scheme is no longer available$/,
  /^Cannot delete customer with existing gold savings/,
  /^A reason is required when overriding/,
  /^Permission denied to override/,
  /^Only administrators can apply/,
  /^Collect the next unpaid installment/,
  /^Monthly installment is below the scheme minimum$/,
  /^Monthly installment exceeds the scheme maximum$/,
  /^Installment amount is below the scheme minimum$/,
  /^Installment amount exceeds the scheme maximum$/,
  /^This scheme account is already closed$/,
  /^This payment was reversed/,
  /^Cannot reverse a payment/,
  /^Cancellation is not allowed after a redemption$/,
  /^Only administrators can override the cancellation deduction$/,
  /^Only administrators can reduce the late fee$/,
  /^Only administrators can waive an installment$/,
  /^This installment is already (paid|waived)$/,
  /^This scheme account cannot be modified$/,
]

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error ?? '')
}

function isSqliteError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const candidate = error as { name?: string; code?: string }
  if (candidate.name === 'SqliteError') {
    return true
  }
  return typeof candidate.code === 'string' && candidate.code.startsWith('SQLITE_')
}

function isSqliteConstraint(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const code = (error as { code?: string }).code
  return code === 'SQLITE_CONSTRAINT' || Boolean(code?.startsWith('SQLITE_CONSTRAINT'))
}

export function isExpectedError(error: unknown): boolean {
  if (error instanceof ZodError) {
    return true
  }
  if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
    return true
  }
  if (isSqliteConstraint(error)) {
    return true
  }

  const message = errorMessage(error)
  if (/^Backup file (was not found|is damaged)/.test(message)) {
    return false
  }
  if (/not found/i.test(message)) {
    return true
  }
  return EXPECTED_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
}

export function classifyFailure(area: string, error: unknown): LogCategory | null {
  if (isExpectedError(error)) {
    return null
  }
  if (isSqliteError(error) || /Database not initialized/.test(errorMessage(error))) {
    return 'database'
  }
  if (area.includes('backup')) {
    return 'backup'
  }
  return 'application'
}
