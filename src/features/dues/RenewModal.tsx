import { useEffect, useState } from 'react'
import { maxLoanForValue } from '@shared/billing/pledgeValuation'
import { localTodayIso } from '@shared/localDate'
import type { PledgePaymentMode } from '@shared/types'
import { DateInput } from '../../components/DateInput'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { PLEDGE_PAYMENT_MODES } from './pledgePaymentModes'

export type RenewModalSummary = {
  receiptNo: string
  interestDue: number
  principalOutstanding: number
  interestPaidUpto: string
  remaining: number
  /** Old ticket's rate, shown so the shop rate change is visible. */
  interestPct: number
  /** Gold value the new loan is measured against. */
  assessedValue: number
}

export function RenewModal({
  summary,
  isAdmin,
  busy,
  onClose,
  onSubmit,
}: {
  summary: RenewModalSummary
  isAdmin: boolean
  busy?: boolean
  onClose: () => void
  onSubmit: (input: {
    renewDate: string
    mode: PledgePaymentMode
    newLoanAmount: number
    note: string
    allowAboveLtv: boolean
  }) => void
}) {
  const [renewDate, setRenewDate] = useState(localTodayIso())
  const [newLoanAmount, setNewLoanAmount] = useState(summary.principalOutstanding)
  const [mode, setMode] = useState<PledgePaymentMode>('cash')
  const [note, setNote] = useState('')
  const [allowAboveLtv, setAllowAboveLtv] = useState(false)
  const [shopRate, setShopRate] = useState(summary.interestPct)
  const [ltvPct, setLtvPct] = useState(0)

  useEffect(() => {
    let active = true
    void api
      .getShopSettings()
      .then((settings) => {
        if (!active) return
        setShopRate(settings.adaguInterestPct)
        setLtvPct(settings.pledgeLtvPct)
      })
      .catch(() => {
        // Falls back to the old ticket's rate; the server still applies LTV.
      })
    return () => {
      active = false
    }
  }, [])

  const difference = newLoanAmount - summary.principalOutstanding
  const maxPrincipal = ltvPct > 0 ? maxLoanForValue(summary.assessedValue, ltvPct) : 0
  const aboveLtv = ltvPct > 0 && newLoanAmount > maxPrincipal + 0.01
  const blocked = aboveLtv && !(isAdmin && allowAboveLtv)
  const rateChanged = Math.abs(shopRate - summary.interestPct) >= 0.01

  return (
    <Modal
      title={`Renew loan · ${summary.receiptNo}`}
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
            disabled={busy || newLoanAmount < 0 || blocked}
            onClick={() =>
              onSubmit({ renewDate, mode, newLoanAmount, note, allowAboveLtv: isAdmin && allowAboveLtv })
            }
          >
            {busy ? 'Renewing…' : 'Renew loan'}
          </button>
        </div>
      }
    >
      <p className="muted">
        The interest due is collected now and the balance moves to a new Adagu ticket. A new ADG
        receipt is generated.
      </p>
      <dl className="dues-detail-totals">
        <div>
          <dt>Interest due</dt>
          <dd className="num">{formatCurrency(summary.interestDue)}</dd>
        </div>
        <div>
          <dt>Outstanding principal</dt>
          <dd className="num">{formatCurrency(summary.principalOutstanding)}</dd>
        </div>
        <div>
          <dt>Interest paid up to</dt>
          <dd>{formatDisplayDate(summary.interestPaidUpto)}</dd>
        </div>
        <div>
          <dt>Total payoff</dt>
          <dd className="num">{formatCurrency(summary.remaining)}</dd>
        </div>
        <div>
          <dt>New ticket rate</dt>
          <dd className="num">{shopRate}% / month (shop rate)</dd>
        </div>
        {rateChanged ? (
          <div>
            <dt>Old ticket rate</dt>
            <dd className="num">{summary.interestPct}% / month</dd>
          </div>
        ) : null}
        {ltvPct > 0 ? (
          <div>
            <dt>LTV limit ({ltvPct}%)</dt>
            <dd className="num">{formatCurrency(maxPrincipal)}</dd>
          </div>
        ) : null}
      </dl>
      {aboveLtv ? (
        <p className="muted" style={{ color: 'var(--danger, #b42318)' }}>
          The new loan is above the {ltvPct}% LTV limit for gold valued at{' '}
          {formatCurrency(summary.assessedValue)}.
        </p>
      ) : null}
      {isAdmin && aboveLtv ? (
        <label className="adagu-banner-check">
          <input
            type="checkbox"
            checked={allowAboveLtv}
            onChange={(event) => setAllowAboveLtv(event.target.checked)}
          />
          Allow above LTV (admin override)
        </label>
      ) : null}
      <div className="form-grid">
        <label>
          Renewal date
          <DateInput
            className="input"
            value={renewDate}
            onChange={(value) => setRenewDate(value || localTodayIso())}
          />
        </label>
        <label>
          New loan amount
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={newLoanAmount || ''}
            onChange={(event) => setNewLoanAmount(Number(event.target.value) || 0)}
          />
        </label>
        <label>
          Interest mode
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
        <label>
          Note
          <input
            className="input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional note"
          />
        </label>
      </div>
      <p className="muted">
        {Math.abs(difference) < 0.01
          ? 'The new ticket carries the same principal.'
          : difference > 0
            ? `Extra ${formatCurrency(difference)} will be paid out on the new ticket.`
            : `${formatCurrency(-difference)} will be collected now as principal.`}
      </p>
      <button
        type="button"
        className="btn ghost"
        style={{ marginTop: '0.5rem' }}
        onClick={() => setNewLoanAmount(summary.principalOutstanding)}
      >
        Use outstanding principal
      </button>
    </Modal>
  )
}
