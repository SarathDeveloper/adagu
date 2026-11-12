import type { CustomerInput } from '@shared/types'

export const emptyCustomerInput: CustomerInput = {
  name: '',
  phone: '',
  address: '',
  guardianName: '',
  notes: '',
  gstin: '',
  aadhaar: '',
  pan: '',
  idProofType: '',
}

export function looksLikePhone(query: string): boolean {
  const digits = query.replace(/\D/g, '')
  return digits.length >= 6 && /^[\d\s+\-()]+$/.test(query.trim())
}

export function prefillFromSearch(query: string): CustomerInput {
  const trimmed = query.trim()
  if (!trimmed) return emptyCustomerInput
  if (looksLikePhone(trimmed)) {
    const digits = trimmed.replace(/\D/g, '').slice(0, 10)
    return { ...emptyCustomerInput, phone: digits }
  }
  return { ...emptyCustomerInput, name: trimmed }
}
