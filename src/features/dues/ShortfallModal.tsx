import { useState } from 'react'
import { localTodayIso } from '@shared/localDate'
import type { AdaguDueSummary, PledgePaymentMode } from '@shared/types'
import { DateInput } from '../../components/DateInput'
import { Modal } from '../../components/Modal'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { PLEDGE_PAYMENT_MODES } from './pledgePaymentModes'

/**
 * Collects whatever the auction sale did not recover. Interest is frozen at the
 * auction date, so this settles the books without reopening the loan.
 */
export function ShortfallModal({
  summary,
  busy,
  onClose,
  onSubmit,
}: {
  summary: AdaguDueSummary
  busy?: boolean
  onClose: () => void
  onSubmit: (input: { amount: number; collectedDate: string; mode: PledgePaymentMode }) => void
}) {
  const remaining = Math.max(0, summary.remaining)
  const [amount, setAmount] = useState(remaining)
  const [collectedDate, setCollectedDate] = useState(localTodayIso())
  const [mode, setMode] = useState<PledgePaymentMode>('cash')
  const tooMuch = amount > remaining + 0.01

  return (
    <Modal
      title={`Collect shortfall · ${summary.receiptNo}`}
      onClose={onClose}
      busy={busy}
      entry
      footer={
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            data-entry-save=""
            title="Ctrl+S"
            disabled={busy || amount <= 0 || tooMuch}
            onClick={() => onSubmit({ amount, collectedDate, mode })}
          >
            {busy ? 'Recording…' : 'Record collection'}
          </button>
        </div>
      }
    >
      <p className="muted">
        This loan was forfeited on {formatDisplayDate(summary.auctionDate ?? summary.interestPaidUpto)}.
        Interest stopped there, so the shortfall stays fixed until it is collected.
      </p>
      <dl className="dues-detail-totals">
        <div>
          <dt>Outstanding principal</dt>
          <dd className="num">{formatCurrency(summary.principalOutstanding)}</dd>
        </div>
        <div>
          <dt>Interest due</dt>
          <dd className="num">{formatCurrency(summary.interestDue)}</dd>
        </div>
        <div>
          <dt>Shortfall remaining</dt>
          <dd className="num">
            <strong>{formatCurrency(remaining)}</strong>
          </dd>
        </div>
      </dl>
      {tooMuch ? (
        <p className="muted" style={{ color: 'var(--danger, #b42318)' }}>
          The amount is more than the {formatCurrency(remaining)} shortfall.
        </p>
      ) : null}
      <div className="form-grid">
        <label>
          Date
          <DateInput
            className="input"
            value={collectedDate}
            onChange={(value) => setCollectedDate(value || localTodayIso())}
          />
        </label>
        <label>
          Amount
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            max={remaining}
            value={amount || ''}
            autoFocus
            onChange={(event) => setAmount(Number(event.target.value) || 0)}
          />
        </label>
        <label>
          Mode
          <select
            className="input"
            value={mode}
            onChange={(event) => setMode(event.target.value as PledgePaymentMode)}
          >
            {PLEDGE_PAYMENT_MODES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        className="btn ghost"
        style={{ marginTop: '0.5rem' }}
        onClick={() => setAmount(remaining)}
      >
        Fill shortfall
      </button>
    </Modal>
  )
}
