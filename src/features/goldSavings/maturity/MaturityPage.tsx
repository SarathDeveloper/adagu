import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { eligibleBonusGoldWeight, rateForPurity, roundGoldGrams } from '@shared/goldSavings/math'
import { localTodayIso } from '@shared/localDate'
import type { GoldSavingAccount, GoldSavingAccountDetail, GoldSavingPaymentMode, MetalRates } from '@shared/types'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { DateInput } from '../../../components/DateInput'
import { PageHeader } from '../../../components/PageHeader'
import { StatCard } from '../../../components/StatCard'
import { useToast } from '../../../components/toastContext'
import { formatCurrency, formatWeight } from '../../../lib/format'
import { api } from '../../../lib/api'
import { PrintPreviewModal } from '../../print/PrintPreviewModal'
import { printPreviewPaths } from '../../print/printPreviewPaths'
import { GsAccountSearch } from '../GsAccountSearch'

const PAYOUT_MODES: { value: GoldSavingPaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank transfer' },
]

/**
 * Maturity payout. The shop pays the customer in cash/UPI/bank for the gold
 * they accumulated: `(accumulated + bonus) x today's gold rate`. Nothing is
 * handed over as metal and no bill is raised.
 */
export function MaturityPage() {
  const { showToast } = useToast()
  const [params] = useSearchParams()
  const presetId = Number(params.get('accountId') ?? 0)
  const [account, setAccount] = useState<GoldSavingAccount | null>(null)
  const [detail, setDetail] = useState<GoldSavingAccountDetail | null>(null)
  const [rates, setRates] = useState<MetalRates | null>(null)
  const [date, setDate] = useState(localTodayIso())
  const [goldWeight, setGoldWeight] = useState('')
  const [paymentMode, setPaymentMode] = useState<GoldSavingPaymentMode>('cash')
  const [transactionRef, setTransactionRef] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [printId, setPrintId] = useState<number | null>(null)

  useEffect(() => {
    if (!presetId) return
    void api
      .listGsAccounts()
      .then((rows) => {
        const found = (rows ?? []).find((row) => row.id === presetId)
        if (found) setAccount(found)
      })
      .catch(() => undefined)
  }, [presetId])

  useEffect(() => {
    if (!account) return
    void Promise.all([api.getGsAccount(account.id), api.getLatestMetalRates()])
      .then(([next, latest]) => {
        setDetail(next)
        setRates(latest)
      })
      .catch(() => undefined)
  }, [account])

  async function payout() {
    if (!account) return
    try {
      setBusy(true)
      const redemption = await api.processGsRedemption({
        accountId: account.id,
        redemptionDate: date,
        redemptionKind: 'payout',
        goldWeight: goldWeight ? Number(goldWeight) : undefined,
        paymentMode,
        transactionRef: transactionRef.trim(),
      })
      showToast('Payout recorded', 'success')
      const next = await api.getGsAccount(account.id)
      setDetail(next)
      setAccount(next.account)
      setGoldWeight('')
      setTransactionRef('')
      setPrintId(redemption.id)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Payout failed', 'error')
    } finally {
      setBusy(false)
      setConfirm(false)
    }
  }

  const scheme = detail?.scheme
  const accumulated = detail?.account.goldAccumulated ?? 0
  const paid = detail?.account.paidInstallments ?? 0
  const duration = detail?.account.durationMonths ?? 0
  const rate = scheme && rates && detail ? rateForPurity(rates, detail.account.purity) : 0
  const bonusAlreadyCredited = Boolean(detail?.ledger.some((entry) => entry.entryType === 'bonus'))
  const bonusGold =
    scheme && !bonusAlreadyCredited
      ? eligibleBonusGoldWeight({
          bonusType: scheme.bonusType,
          bonusValue: scheme.bonusValue,
          accumulatedGrams: accumulated,
          paidInstallments: paid,
          durationMonths: duration,
          ratePerGram: rate,
        })
      : 0
  const eligibleGold = roundGoldGrams(accumulated + bonusGold)
  const requestedGold = goldWeight ? Number(goldWeight) : eligibleGold
  const payoutAmount = rate > 0 ? Math.round(requestedGold * rate * 100) / 100 : 0

  return (
    <div className="app-page">
      <PageHeader
        title="Maturity & payout"
        subtitle="Pay the accumulated scheme gold out in cash, UPI or bank transfer at the gold rate in force."
      />
      <section className="card padded card--search">
        <GsAccountSearch
          selected={account}
          onSelect={setAccount}
          onClear={() => {
            setAccount(null)
            setDetail(null)
          }}
        />
      </section>
      {detail ? (
        <>
          <div className="stat-card-grid">
            <StatCard label="Amount paid" value={formatCurrency(detail.account.totalPaid)} />
            <StatCard label="Accumulated gold" value={formatWeight(accumulated, 3)} />
            <StatCard
              label="Applicable bonus"
              value={
                bonusGold > 0
                  ? formatWeight(bonusGold, 3)
                  : scheme && scheme.bonusType !== 'none'
                    ? 'Not yet eligible'
                    : 'None'
              }
            />
            <StatCard label="Total eligible gold" value={formatWeight(eligibleGold, 3)} tone="brand" />
          </div>
          <section className="card padded" data-entry="">
            <h2 className="settings-section-title">Payout</h2>
            <p className="muted">
              The customer is paid for their gold at the rate below. No gold, jewellery or bill is issued. A payout
              voucher is printed for the customer to sign.
            </p>
            <div className="form-grid">
              <label>
                <span className="field-label">Payout date</span>
                <DateInput className="input" value={date} onChange={setDate} showIcon />
              </label>
              <label>
                <span className="field-label">Gold rate (per g)</span>
                <input className="input" value={rate > 0 ? formatCurrency(rate) : 'Not configured'} readOnly />
              </label>
              <label>
                <span className="field-label">Gold weight (blank = full eligible)</span>
                <input className="input" value={goldWeight} onChange={(e) => setGoldWeight(e.target.value)} />
              </label>
              <label>
                <span className="field-label">Payment mode</span>
                <select
                  className="input"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as GoldSavingPaymentMode)}
                >
                  {PAYOUT_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">Transaction reference</span>
                <input
                  className="input"
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  placeholder="UTR / receipt number"
                />
              </label>
            </div>
            <div className="payout-summary">
              <span>
                <strong>{formatWeight(requestedGold, 3)}</strong> gold
              </span>
              <span aria-hidden>×</span>
              <span>
                <strong>{rate > 0 ? formatCurrency(rate) : '—'}</strong> /g
              </span>
              <span aria-hidden>=</span>
              <span className="payout-summary-amount">{formatCurrency(payoutAmount)}</span>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                data-entry-save=""
                title="Ctrl+S"
                disabled={rate <= 0 || busy}
                onClick={() => setConfirm(true)}
              >
                Pay out {formatCurrency(payoutAmount)}
              </button>
            </div>
          </section>
        </>
      ) : null}
      {confirm ? (
        <ConfirmDialog
          title="Confirm payout"
          message={`Pay ${formatCurrency(payoutAmount)} for ${formatWeight(requestedGold, 3)} of gold? This closes ${requestedGold >= eligibleGold ? 'the scheme' : 'a part of the scheme balance'}.`}
          confirmLabel="Pay out"
          danger={false}
          busy={busy}
          onConfirm={() => void payout()}
          onCancel={() => setConfirm(false)}
        />
      ) : null}
      {printId !== null ? (
        <PrintPreviewModal
          title="Payout voucher"
          path={printPreviewPaths.gsPayout(printId)}
          pdfFilename={`payout-${printId}.pdf`}
          onClose={() => setPrintId(null)}
        />
      ) : null}
    </div>
  )
}
