import { useState } from 'react'
import type { Customer, CustomerInput } from '@shared/types'
import { customerInputSchema } from '@shared/schemas'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'
import { emptyCustomerInput } from './customerFormDefaults'

function formFromCustomer(customer: Customer): CustomerInput {
  return {
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    guardianName: customer.guardianName ?? '',
    notes: customer.notes ?? '',
    gstin: customer.gstin ?? '',
    aadhaar: customer.aadhaar ?? '',
    pan: customer.pan ?? '',
    idProofType: customer.idProofType ?? '',
  }
}

function digitsOnly(value: string, maxLen: number): string {
  return value.replace(/\D/g, '').slice(0, maxLen)
}

type CustomerFormModalProps = {
  open: boolean
  editing?: Customer | null
  initialValues?: CustomerInput
  onClose: () => void
  onSaved: (customer: Customer) => void
  onError?: (message: string) => void
}

export function CustomerFormModal({
  open,
  editing = null,
  initialValues,
  onClose,
  onSaved,
  onError,
}: CustomerFormModalProps) {
  const [form, setForm] = useState<CustomerInput>(emptyCustomerInput)
  const [saving, setSaving] = useState(false)
  // Shown inside the modal: the parent's banner is behind the backdrop.
  const [formError, setFormError] = useState<string | null>(null)
  // What the form was last filled from. When the modal opens, or is pointed at
  // a different customer or prefill, it is refilled during render (React's
  // "adjust state when props change" pattern) rather than in an effect.
  const [filledFrom, setFilledFrom] = useState<{
    editing: Customer | null
    initialValues?: CustomerInput
  } | null>(null)
  if (!open && filledFrom) {
    setFilledFrom(null)
  } else if (
    open &&
    (!filledFrom || filledFrom.editing !== editing || filledFrom.initialValues !== initialValues)
  ) {
    setFilledFrom({ editing, initialValues })
    setForm(editing ? formFromCustomer(editing) : (initialValues ?? emptyCustomerInput))
    setFormError(null)
  }

  async function save() {
    const payload: CustomerInput = {
      name: form.name.trim(),
      phone: form.phone.replace(/\D/g, ''),
      address: form.address.trim(),
      guardianName: (form.guardianName ?? '').trim(),
      notes: (form.notes ?? '').trim(),
      gstin: (form.gstin ?? '').trim(),
      aadhaar: digitsOnly(form.aadhaar ?? '', 12),
      pan: (form.pan ?? '').trim().toUpperCase(),
      idProofType: (form.idProofType ?? '').trim(),
    }

    const parsed = customerInputSchema.safeParse(payload)
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Invalid customer details'
      setFormError(message)
      onError?.(message)
      return
    }

    try {
      setSaving(true)
      setFormError(null)
      const customer = editing
        ? await api.updateCustomer(editing.id, parsed.data)
        : await api.createCustomer(parsed.data)
      onSaved(customer)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save customer'
      setFormError(message)
      onError?.(message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <Modal
      title={editing ? 'Edit customer' : 'Add customer'}
      onClose={onClose}
      entry
      footer={
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn" data-entry-save="" title="Ctrl+S" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      {formError ? (
        <div className="error-banner" role="alert">
          {formError}
        </div>
      ) : null}
      <div className="form-grid">
        <label>
          <span className="field-label">
            Name <span className="req" aria-hidden="true">*</span>
          </span>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoComplete="name"
            aria-label="Name"
          />
        </label>
        <label>
          <span className="field-label">
            Mobile <span className="req" aria-hidden="true">*</span>
          </span>
          <input
            className="input"
            inputMode="numeric"
            maxLength={10}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: digitsOnly(e.target.value, 10) })}
            autoComplete="tel"
            aria-label="Mobile"
          />
        </label>
        <label>
          <span className="field-label">F / M / H Name</span>
          <input
            className="input"
            value={form.guardianName ?? ''}
            onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
            placeholder="Father / Mother / Husband"
            aria-label="F / M / H Name"
          />
        </label>
        <label>
          <span className="field-label">Aadhaar</span>
          <input
            className="input"
            inputMode="numeric"
            maxLength={12}
            value={form.aadhaar ?? ''}
            onChange={(e) => setForm({ ...form, aadhaar: digitsOnly(e.target.value, 12) })}
            placeholder="Optional"
            aria-label="Aadhaar"
          />
        </label>
        <label>
          <span className="field-label">PAN</span>
          <input
            className="input"
            maxLength={10}
            value={form.pan ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                pan: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10),
              })
            }
            placeholder="Optional"
            aria-label="PAN"
          />
        </label>
        <label>
          <span className="field-label">ID proof type</span>
          <select
            className="input"
            value={form.idProofType ?? ''}
            onChange={(e) => setForm({ ...form, idProofType: e.target.value })}
            aria-label="ID proof type"
          >
            <option value="">Not recorded</option>
            <option value="Aadhaar">Aadhaar</option>
            <option value="PAN">PAN</option>
            <option value="Voter ID">Voter ID</option>
            <option value="Driving Licence">Driving Licence</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label className="full">
          <span className="field-label">
            Address <span className="req" aria-hidden="true">*</span>
          </span>
          <textarea
            className="textarea"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            rows={2}
            aria-label="Address"
          />
        </label>
        <label className="full">
          <span className="field-label">Notes</span>
          <textarea
            className="textarea"
            value={form.notes ?? ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            placeholder="Optional"
            aria-label="Notes"
          />
        </label>
      </div>
    </Modal>
  )
}
