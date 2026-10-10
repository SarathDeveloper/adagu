import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { GoldSavingRedemption } from '@shared/types'
import { api } from '../../../lib/api'
import { shopSettingsToDisplay, type ShopDisplayInfo } from '../../print/mapShopDisplay'
import { applyPaperDataset } from '../../print/paperSize'
import { signalPrintReady, waitForPrintLayout } from '../../print/printPageUtils'
import { GsPayoutPrint } from './GsPayoutPrint'
import './GsReceiptPrint.css'

export function GsPayoutPrintPage() {
  const { id } = useParams()
  const [redemption, setRedemption] = useState<GoldSavingRedemption | null>(null)
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const redemptionId = Number(id)
        if (!Number.isInteger(redemptionId) || redemptionId <= 0) throw new Error('Invalid payout receipt')
        const [next, settings] = await Promise.all([api.getGsRedemption(redemptionId), api.getShopSettings()])
        if (!active) return
        setRedemption(next)
        setShop(shopSettingsToDisplay(settings))
        applyPaperDataset('a4')
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load payout voucher')
      }
    })()
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    if (!redemption && !error) return
    let cancelled = false
    void (async () => {
      if (redemption) await waitForPrintLayout()
      if (!cancelled) signalPrintReady(error)
    })()
    return () => {
      cancelled = true
    }
  }, [redemption, error])

  return (
    <div className="gs-receipt-print-page">
      {error ? <p className="gs-receipt-print-status gs-receipt-print-error">{error}</p> : null}
      {!error && !redemption ? <p className="gs-receipt-print-status">Preparing payout voucher…</p> : null}
      {redemption ? <GsPayoutPrint redemption={redemption} shop={shop ?? undefined} /> : null}
    </div>
  )
}
