import { useEffect, useRef, useState } from 'react'
import { localTodayIso } from '@shared/localDate'
import type {
  AdaguDueSummary,
  DueEntry,
  DuesLedger,
  PledgeAuctionInput,
  PledgePaymentMode,
  PledgePayoff,
} from '@shared/types'
import { DateInput } from '../../components/DateInput'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/toastContext'
import { useAuth } from '../auth/authContext'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { api } from '../../lib/api'
import { AdaguDueDetailDrawer } from '../dues/AdaguDueDetailDrawer'
import { AuctionModal } from '../dues/AuctionModal'
import { InterestCollectionModal } from '../dues/InterestCollectionModal'
import { PLEDGE_PAYMENT_MODES } from '../dues/pledgePaymentModes'
import { RenewModal } from '../dues/RenewModal'
import { ShortfallModal } from '../dues/ShortfallModal'
import { TopupModal } from '../dues/TopupModal'
import { PledgePreviewModal } from '../pledges/PledgePreviewModal'
import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { printPreviewPaths } from '../print/printPreviewPaths'

export function CustomerAdaguLoanActions({
  viewTarget,
  payments,
  onViewTargetChange,
  onReload,
  onError,
}: {
  viewTarget: AdaguDueSummary | null
  payments: DueEntry[]
  onViewTargetChange: (summary: AdaguDueSummary | null) => void
  onReload: () => Promise<DuesLedger>
  onError: (message: string | null) => void
}) {
  const { showToast } = useToast()
  const { isAdmin } = useAuth()
  const [busy, setBusy] = useState(false)
  const [redeemAction, setRedeemAction] = useState<'partial' | 'full' | null>(null)
  const [billTarget, setBillTarget] = useState<number | null>(null)
  const [releaseTarget, setReleaseTarget] = useState<number | null>(null)
  const [interestTarget, setInterestTarget] = useState<AdaguDueSummary | null>(null)
  const [topupTarget, setTopupTarget] = useState<AdaguDueSummary | null>(null)
  const [renewTarget, setRenewTarget] = useState<AdaguDueSummary | null>(null)
  const [shortfallTarget, setShortfallTarget] = useState<AdaguDueSummary | null>(null)
  const [renewedTarget, setRenewedTarget] = useState<number | null>(null)
  const [redeemTarget, setRedeemTarget] = useState<AdaguDueSummary | null>(null)
  const [auctionTarget, setAuctionTarget] = useState<AdaguDueSummary | null>(null)
  const [auctionMode, setAuctionMode] = useState<'notice' | 'auction'>('notice')
  const [noticePrintTarget, setNoticePrintTarget] = useState<number | null>(null)
  const [redeemDate, setRedeemDate] = useState(localTodayIso())
  const [redeemAmount, setRedeemAmount] = useState(0)
  const [redeemDiscount, setRedeemDiscount] = useState(0)
  const [redeemMode, setRedeemMode] = useState<PledgePaymentMode>('cash')
  const [redeemPayoff, setRedeemPayoff] = useState<{ key: string; payoff: PledgePayoff } | null>(null)
  const redeemDiscountRef = useRef(0)

  useEffect(() => {
    if (!redeemTarget) return
    const key = `${redeemTarget.pledgeId}|${redeemDate}`
    let active = true
    void api
      .getPledgePayoff(redeemTarget.pledgeId, redeemDate)
      .then((payoff) => {
        if (!active) return
        setRedeemPayoff({ key, payoff })
        setRedeemAmount(Math.max(0, payoff.payoff - redeemDiscountRef.current))
      })
      .catch((err) => {
        if (!active) return
        onError(err instanceof Error ? err.message : 'Failed to load payoff')
      })
    return () => {
      active = false
    }
  }, [redeemTarget, redeemDate, onError])

  const redeemRequestKey = redeemTarget ? `${redeemTarget.pledgeId}|${redeemDate}` : ''
  const activeRedeemPayoff =
    redeemPayoff && redeemPayoff.key === redeemRequestKey ? redeemPayoff.payoff : null
  const redeemPayoffValue = activeRedeemPayoff?.payoff ?? redeemTarget?.remaining ?? 0

  async function reloadAndSyncView(pledgeId: number) {
    const data = await onReload()
    onViewTargetChange(
      (data.adaguDues ?? []).find((row) => row.pledgeId === pledgeId) ?? null,
    )
    return data
  }

  function openRedeem(summary: AdaguDueSummary) {
    setRedeemTarget(summary)
    setRedeemDate(localTodayIso())
    setRedeemAmount(summary.remaining)
    setRedeemDiscount(0)
    redeemDiscountRef.current = 0
    setRedeemMode('cash')
  }

  async function collectInterest(input: {
    amount: number
    collectedDate: string
    mode: PledgePaymentMode
  }) {
    if (!interestTarget) return
    try {
      setBusy(true)
      onError(null)
      const updated = await api.collectPledge({
        id: interestTarget.pledgeId,
        collectedDate: input.collectedDate,
        amount: input.amount,
        mode: input.mode,
      })
      setInterestTarget(null)
      showToast(
        updated.status === 'redeemed' ? 'Loan closed and gold ready to release' : 'Interest collected',
        'success',
      )
      await reloadAndSyncView(interestTarget.pledgeId)
      if (updated.status === 'redeemed') setReleaseTarget(updated.id)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to collect interest')
    } finally {
      setBusy(false)
    }
  }

  async function addTopup(input: {
    amount: number
    topupDate: string
    note: string
    allowAboveLtv: boolean
  }) {
    if (!topupTarget) return
    try {
      setBusy(true)
      onError(null)
      await api.addPledgeTopup({
        pledgeId: topupTarget.pledgeId,
        topupDate: input.topupDate,
        amount: input.amount,
        note: input.note,
        allowAboveLtv: input.allowAboveLtv,
      })
      setTopupTarget(null)
      showToast('Extra loan added', 'success')
      await reloadAndSyncView(topupTarget.pledgeId)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to add extra loan')
    } finally {
      setBusy(false)
    }
  }

  async function renewLoan(input: {
    renewDate: string
    mode: PledgePaymentMode
    newLoanAmount: number
    note: string
    allowAboveLtv: boolean
  }) {
    if (!renewTarget) return
    try {
      setBusy(true)
      onError(null)
      const created = await api.renewPledge({
        id: renewTarget.pledgeId,
        renewDate: input.renewDate,
        mode: input.mode,
        newLoanAmount: input.newLoanAmount,
        note: input.note,
        allowAboveLtv: input.allowAboveLtv,
      })
      setRenewTarget(null)
      onViewTargetChange(null)
      showToast(`Loan renewed as ${created.receiptNo}`, 'success')
      await onReload()
      setRenewedTarget(created.id)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to renew loan')
    } finally {
      setBusy(false)
    }
  }

  async function undoLatestPayment() {
    if (!viewTarget) return
    try {
      setBusy(true)
      onError(null)
      await api.undoLatestPledgePayment(viewTarget.pledgeId)
      showToast('Last payment undone', 'success')
      await reloadAndSyncView(viewTarget.pledgeId)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to undo the payment')
      throw err
    } finally {
      setBusy(false)
    }
  }

  async function collectShortfall(input: {
    amount: number
    collectedDate: string
    mode: PledgePaymentMode
  }) {
    if (!shortfallTarget) return
    try {
      setBusy(true)
      onError(null)
      await api.collectPledgeShortfall({
        id: shortfallTarget.pledgeId,
        collectedDate: input.collectedDate,
        amount: input.amount,
        mode: input.mode,
      })
      setShortfallTarget(null)
      showToast('Auction shortfall collected', 'success')
      await reloadAndSyncView(shortfallTarget.pledgeId)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to collect the shortfall')
    } finally {
      setBusy(false)
    }
  }

  async function collectPartial() {
    if (!redeemTarget || redeemAmount <= 0) return
    try {
      setRedeemAction('partial')
      setBusy(true)
      onError(null)
      const updated = await api.collectPledge({
        id: redeemTarget.pledgeId,
        collectedDate: redeemDate,
        amount: redeemAmount,
        mode: redeemMode,
      })
      setRedeemTarget(null)
      showToast(
        updated.status === 'redeemed' ? 'Loan closed and gold ready to release' : 'Collection recorded',
        'success',
      )
      await reloadAndSyncView(redeemTarget.pledgeId)
      if (updated.status === 'redeemed') setReleaseTarget(updated.id)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to collect')
    } finally {
      setBusy(false)
      setRedeemAction(null)
    }
  }

  async function redeemFull() {
    if (!redeemTarget) return
    try {
      setRedeemAction('full')
      setBusy(true)
      onError(null)
      const updated = await api.redeemPledge({
        id: redeemTarget.pledgeId,
        redeemedDate: redeemDate,
        amountCollected: redeemAmount,
        discount: redeemDiscount,
        mode: redeemMode,
      })
      setRedeemTarget(null)
      showToast('Adagu loan closed', 'success')
      await reloadAndSyncView(redeemTarget.pledgeId)
      setReleaseTarget(updated.id)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to close loan')
    } finally {
      setBusy(false)
      setRedeemAction(null)
    }
  }

  async function sendAuctionNotice(input: { noticeDate: string }) {
    if (!auctionTarget) return
    try {
      setBusy(true)
      onError(null)
      await api.sendPledgeAuctionNotice({
        id: auctionTarget.pledgeId,
        noticeDate: input.noticeDate,
      })
      setAuctionTarget(null)
      showToast('Auction notice saved', 'success')
      await reloadAndSyncView(auctionTarget.pledgeId)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save auction notice')
    } finally {
      setBusy(false)
    }
  }

  async function recordAuction(input: Omit<PledgeAuctionInput, 'id'>) {
    if (!auctionTarget) return
    try {
      setBusy(true)
      onError(null)
      const updated = await api.recordPledgeAuction({
        id: auctionTarget.pledgeId,
        ...input,
      })
      setAuctionTarget(null)
      showToast(`Auction recorded for ${updated.receiptNo}`, 'success')
      await reloadAndSyncView(auctionTarget.pledgeId)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to record auction')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {viewTarget ? (
        <AdaguDueDetailDrawer
          summary={viewTarget}
          payments={payments}
          busy={busy}
          onClose={() => onViewTargetChange(null)}
          onCollectInterest={() => setInterestTarget(viewTarget)}
          onTopup={() => setTopupTarget(viewTarget)}
          onRedeem={() => openRedeem(viewTarget)}
          onRenew={() => setRenewTarget(viewTarget)}
          onAuctionNotice={() => {
            setAuctionMode('notice')
            setAuctionTarget(viewTarget)
          }}
          onRecordAuction={() => {
            setAuctionMode('auction')
            setAuctionTarget(viewTarget)
          }}
          onPrintNotice={() => setNoticePrintTarget(viewTarget.pledgeId)}
          onViewBill={() => setBillTarget(viewTarget.pledgeId)}
          onReleaseReceipt={() => setReleaseTarget(viewTarget.pledgeId)}
          onCollectShortfall={() => setShortfallTarget(viewTarget)}
          onUndoPayment={undoLatestPayment}
        />
      ) : null}

      {billTarget ? (
        <PledgePreviewModal pledgeId={billTarget} onClose={() => setBillTarget(null)} />
      ) : null}

      {releaseTarget != null ? (
        <PrintPreviewModal
          title="Print preview"
          path={printPreviewPaths.pledgeRelease(releaseTarget)}
          pdfFilename="pledge-release.pdf"
          onClose={() => setReleaseTarget(null)}
        />
      ) : null}

      {interestTarget ? (
        <InterestCollectionModal
          summary={interestTarget}
          busy={busy}
          onClose={() => setInterestTarget(null)}
          onSubmit={(input) => void collectInterest(input)}
        />
      ) : null}

      {topupTarget ? (
        <TopupModal
          summary={topupTarget}
          isAdmin={isAdmin}
          busy={busy}
          onClose={() => setTopupTarget(null)}
          onSubmit={(input) => void addTopup(input)}
        />
      ) : null}

      {shortfallTarget ? (
        <ShortfallModal
          summary={shortfallTarget}
          busy={busy}
          onClose={() => setShortfallTarget(null)}
          onSubmit={(input) => void collectShortfall(input)}
        />
      ) : null}

      {renewTarget ? (
        <RenewModal
          summary={renewTarget}
          isAdmin={isAdmin}
          busy={busy}
          onClose={() => setRenewTarget(null)}
          onSubmit={(input) => void renewLoan(input)}
        />
      ) : null}

      {renewedTarget != null ? (
        <PrintPreviewModal
          title="Renewal ticket"
          path={printPreviewPaths.pledge(renewedTarget)}
          pdfFilename="adagu-renewal.pdf"
          onClose={() => setRenewedTarget(null)}
        />
      ) : null}

      {redeemTarget ? (
        <Modal
          title={`Close Adagu loan · ${redeemTarget.receiptNo}`}
          entry
          onClose={() => setRedeemTarget(null)}
          footer={
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setRedeemTarget(null)} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={busy || !activeRedeemPayoff}
                onClick={() => void collectPartial()}
              >
                {redeemAction === 'partial' ? 'Recording…' : 'Record collection'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy || !activeRedeemPayoff}
                onClick={() => void redeemFull()}
              >
                {redeemAction === 'full' ? 'Closing…' : 'Full redeem'}
              </button>
            </div>
          }
        >
          <dl className="dues-detail-totals">
            <div>
              <dt>Principal outstanding</dt>
              <dd className="num">
                {formatCurrency(activeRedeemPayoff?.principalOutstanding ?? redeemTarget.principalOutstanding)}
              </dd>
            </div>
            <div>
              <dt>Interest due</dt>
              <dd className="num">{formatCurrency(activeRedeemPayoff?.interestDue ?? redeemTarget.interestDue)}</dd>
            </div>
            <div>
              <dt>Interest paid up to</dt>
              <dd>
                {formatDisplayDate(activeRedeemPayoff?.interestPaidUpto ?? redeemTarget.interestPaidUpto)}
              </dd>
            </div>
            <div>
              <dt>Payoff</dt>
              <dd className="num">
                <strong>{formatCurrency(redeemPayoffValue)}</strong>
              </dd>
            </div>
          </dl>
          <div className="form-grid">
            <label>
              Date
              <DateInput className="input" value={redeemDate} onChange={(value) => setRedeemDate(value || localTodayIso())} />
            </label>
            <label>
              Amount collected
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={redeemAmount || ''}
                onChange={(event) => setRedeemAmount(Number(event.target.value) || 0)}
              />
            </label>
            <label>
              Discount
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={redeemDiscount || ''}
                onChange={(event) => {
                  const discount = Math.max(0, Number(event.target.value) || 0)
                  redeemDiscountRef.current = discount
                  setRedeemDiscount(discount)
                  setRedeemAmount(Math.max(0, redeemPayoffValue - discount))
                }}
              />
            </label>
            <label>
              Mode
              <select
                className="input"
                value={redeemMode}
                onChange={(event) => setRedeemMode(event.target.value as PledgePaymentMode)}
              >
                {PLEDGE_PAYMENT_MODES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted">
            Collect {formatCurrency(redeemAmount)} and write off {formatCurrency(redeemDiscount)} to close. Discount
            applies to full redeem only.
          </p>
          <button
            type="button"
            className="btn ghost"
            style={{ marginTop: '0.5rem' }}
            onClick={() => {
              redeemDiscountRef.current = 0
              setRedeemDiscount(0)
              setRedeemAmount(redeemPayoffValue)
            }}
          >
            Fill payoff
          </button>
        </Modal>
      ) : null}

      {auctionTarget ? (
        <AuctionModal
          summary={auctionTarget}
          mode={auctionMode}
          busy={busy}
          onClose={() => setAuctionTarget(null)}
          onNotice={(input) => void sendAuctionNotice(input)}
          onAuction={(input) => void recordAuction(input)}
        />
      ) : null}

      {noticePrintTarget != null ? (
        <PrintPreviewModal
          title="Auction notice"
          path={printPreviewPaths.pledgeNotice(noticePrintTarget)}
          pdfFilename="adagu-auction-notice.pdf"
          onClose={() => setNoticePrintTarget(null)}
        />
      ) : null}
    </>
  )
}
