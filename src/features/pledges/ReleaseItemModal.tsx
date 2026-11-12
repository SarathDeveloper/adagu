import { useEffect, useRef, useState } from 'react'
import { quotePledgeItemRelease, type ReleaseQuote } from '@shared/billing/pledgeRelease'
import { localTodayIso } from '@shared/localDate'
import type { Pledge, PledgeItem, PledgePaymentMode } from '@shared/types'
import { DateInput } from '../../components/DateInput'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import { PLEDGE_COLLECTION_MODES } from '../dues/pledgePaymentModes'

const PAY_MODES = PLEDGE_COLLECTION_MODES

export function ReleaseItemModal({
  pledgeId,
  item,
  assessedValue,
  items,
  onClose,
  onReleased,
}: {
  pledgeId: number
  item: PledgeItem
  assessedValue: number
  items: PledgeItem[]
  onClose: () => void
  onReleased: (pledge: Pledge) => void
}) {
  const [date, setDate] = useState(localTodayIso())
  const [mode, setMode] = useState<PledgePaymentMode>('cash')
  const [amount, setAmount] = useState(0)
  // Once the person types an amount, a re-price must not overwrite it. A ref,
  // because typing must not trigger another price fetch.
  const amountTouchedRef = useRef(false)
  const [priced, setPriced] = useState<{
    key: string
    quote: ReleaseQuote | null
    error: string | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Only the price for the current jewel and date is shown; a new date shows
  // "Calculating…" until its price arrives.
  const quoteKey = `${pledgeId}|${item.id}|${date}|${assessedValue}`
  const current = priced?.key === quoteKey ? priced : null
  const quote = current?.quote ?? null
  const quoteError = current?.error ?? null

  useEffect(() => {
    let active = true
    const key = quoteKey
    void Promise.all([api.getPledgePayoff(pledgeId, date), api.getShopSettings()])
      .then(([payoff, settings]) => {
        if (!active) return
        try {
          const next = quotePledgeItemRelease({
            active: true,
            assessedValue,
            principalOutstanding: payoff.principalOutstanding,
            interestDue: payoff.interestDue,
            payoff: payoff.payoff,
            ltvPct: settings.pledgeLtvPct,
            itemId: item.id,
            items: items.map((row) => ({
              id: row.id,
              itemValue: row.itemValue,
              netWeight: row.netWeight,
              released: Boolean(row.releasedAt),
            })),
          })
          setPriced({ key, quote: next, error: null })
          if (!amountTouchedRef.current) setAmount(next.requiredTotal)
        } catch (err) {
          setPriced({
            key,
            quote: null,
            error: err instanceof Error ? err.message : 'Cannot release this jewel',
          })
        }
      })
      .catch((err) => {
        if (active) {
          setPriced({
            key,
            quote: null,
            error: err instanceof Error ? err.message : 'Could not price this release',
          })
        }
      })
    return () => {
      active = false
    }
  }, [quoteKey, assessedValue, date, item.id, items, pledgeId])

  async function release() {
    if (!quote) return
    setBusy(true)
    setError(null)
    try {
      const saved = await api.releasePledgeItem(pledgeId, item.id, { date, amount, mode })
      onReleased(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not release this jewel')
    } finally {
      setBusy(false)
    }
  }

  const label = item.description.trim() || 'jewel'

  return (
    <Modal
      title={`Release ${label}`}
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
            disabled={busy || !quote}
            onClick={() => void release()}
          >
            {busy ? 'Releasing…' : 'Release item'}
          </button>
        </div>
      }
    >
      <p className="muted">
        The rest of the loan stays on this receipt. Interest due is collected in full, plus this jewel&apos;s share of
        the principal.
      </p>
      <div className="form-grid">
        <label>
          Date
          <DateInput className="input" value={date} onChange={(value) => setDate(value || localTodayIso())} />
        </label>
        <label>
          Payment mode
          <select
            className="input"
            value={mode}
            onChange={(event) => setMode(event.target.value as PledgePaymentMode)}
          >
            {PAY_MODES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Amount
          <input
            className="input"
            type="number"
            step="0.01"
            min={0}
            value={amount}
            onChange={(event) => {
              amountTouchedRef.current = true
              setAmount(Number(event.target.value))
            }}
          />
        </label>
      </div>
      {quote ? (
        <dl className="dues-detail-totals">
          <div>
            <dt>Jewel value</dt>
            <dd className="num">{formatCurrency(item.itemValue)}</dd>
          </div>
          <div>
            <dt>Principal share</dt>
            <dd className="num">{formatCurrency(quote.principalShare)}</dd>
          </div>
          <div>
            <dt>Interest due</dt>
            <dd className="num">{formatCurrency(quote.interestDue)}</dd>
          </div>
          {quote.extraPrincipal > 0 ? (
            <div>
              <dt>Extra principal to stay within LTV</dt>
              <dd className="num">{formatCurrency(quote.extraPrincipal)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Required</dt>
            <dd className="num">
              <strong>{formatCurrency(quote.requiredTotal)}</strong>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="muted">{quoteError ?? 'Calculating…'}</p>
      )}
      {error ? <p className="error-banner">{error}</p> : null}
    </Modal>
  )
}
