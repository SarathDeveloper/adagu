import { useEffect, useMemo, useState } from 'react'
import { monthlyPledgeInterestAmount, totalPrincipalWithTopups } from '@shared/billing/pledgeMath'
import { maxLoanForValue } from '@shared/billing/pledgeValuation'
import { localTodayIso } from '@shared/localDate'
import type { AdaguDueSummary } from '@shared/types'
import { DateInput } from '../../components/DateInput'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'
import { formatCurrency } from '../../lib/format'

export function TopupModal({
  summary,
  isAdmin,
  busy,
  onClose,
  onSubmit,
}: {
  summary: AdaguDueSummary
  isAdmin: boolean
  busy?: boolean
  onClose: () => void
  onSubmit: (input: { amount: number; topupDate: string; note: string; allowAboveLtv: boolean }) => void
}) {
  const [amount, setAmount] = useState(0)
  const [topupDate, setTopupDate] = useState(localTodayIso())
  const [note, setNote] = useState('')
  const [ltvPct, setLtvPct] = useState(0)
  const [allowAboveLtv, setAllowAboveLtv] = useState(false)

  useEffect(() => {
    let active = true
    void api
      .getShopSettings()
      .then((settings) => {
        if (active) setLtvPct(settings.pledgeLtvPct)
      })
      .catch(() => {
        // LTV is advisory in the UI; the server still enforces it.
      })
    return () => {
      active = false
    }
  }, [])

  const preview = useMemo(() => {
    const nextPrincipal = totalPrincipalWithTopups(summary.principal, [{ amount }])
    const monthlyInterest = monthlyPledgeInterestAmount(nextPrincipal, summary.interestPct)
    const maxPrincipal = maxLoanForValue(summary.assessedValue, ltvPct)
    const aboveLtv = ltvPct > 0 && nextPrincipal > maxPrincipal + 0.01
    return { nextPrincipal, monthlyInterest, maxPrincipal, aboveLtv }
  }, [amount, summary.interestPct, summary.principal, summary.assessedValue, ltvPct])

  const blocked = preview.aboveLtv && !(isAdmin && allowAboveLtv)

  return (
    <Modal
      title={`Extra loan · ${summary.receiptNo}`}
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
            disabled={busy || amount <= 0 || blocked}
            onClick={() => onSubmit({ amount, topupDate, note, allowAboveLtv: isAdmin && allowAboveLtv })}
          >
            {busy ? 'Adding…' : 'Add extra'}
          </button>
        </div>
      }
    >
      <p className="muted">
        Adds extra cash against the same pledged items. Interest on the extra starts from the
        top-up date.
      </p>
      <dl className="dues-detail-totals">
        <div>
          <dt>Current principal</dt>
          <dd className="num">{formatCurrency(summary.principal)}</dd>
        </div>
        <div>
          <dt>New principal</dt>
          <dd className="num">{formatCurrency(preview.nextPrincipal)}</dd>
        </div>
        <div>
          <dt>Monthly interest</dt>
          <dd className="num">{formatCurrency(preview.monthlyInterest)}</dd>
        </div>
        {ltvPct > 0 ? (
          <div>
            <dt>LTV limit ({ltvPct}%)</dt>
            <dd className="num">{formatCurrency(preview.maxPrincipal)}</dd>
          </div>
        ) : null}
      </dl>
      {preview.aboveLtv ? (
        <p className="muted" style={{ color: 'var(--danger, #b42318)' }}>
          The new principal is above the {ltvPct}% LTV limit for gold valued at{' '}
          {formatCurrency(summary.assessedValue)}.
        </p>
      ) : null}
      {isAdmin && preview.aboveLtv ? (
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
          Date
          <DateInput className="input" value={topupDate} onChange={(value) => setTopupDate(value || localTodayIso())} />
        </label>
        <label>
          Extra amount
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={amount || ''}
            onChange={(event) => setAmount(Number(event.target.value) || 0)}
          />
        </label>
        <label className="full">
          Note
          <input
            className="input"
            placeholder="Optional"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </div>
    </Modal>
  )
}
