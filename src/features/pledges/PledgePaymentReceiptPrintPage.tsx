import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { PledgePaymentReceipt } from '@shared/types'
import { api } from '../../lib/api'
import { shopSettingsToDisplay, type ShopDisplayInfo } from '../print/mapShopDisplay'
import { applyPaperDataset, paperPageCss } from '../print/paperSize'
import { signalPrintReady, waitForPrintLayout } from '../print/printPageUtils'
import { PledgePaymentReceiptPrint } from './PledgePaymentReceiptPrint'
import '../print/printDocument.css'
import './PledgePrint.css'

export function PledgePaymentReceiptPrintPage() {
  const { id } = useParams()
  const [receipt, setReceipt] = useState<PledgePaymentReceipt | null>(null)
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const paymentId = Number(id)
        if (!Number.isInteger(paymentId) || paymentId <= 0) {
          throw new Error('Invalid payment id')
        }
        const [data, settings] = await Promise.all([
          api.getPledgePaymentReceipt(paymentId),
          api.getShopSettings(),
        ])
        if (!active) return
        setShop(shopSettingsToDisplay(settings))
        applyPaperDataset('a5')
        setReceipt(data)
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load payment')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    if (!receipt && !error) return

    let cancelled = false
    void (async () => {
      try {
        if (receipt) {
          await waitForPrintLayout()
        }
        if (cancelled) return
        signalPrintReady(error)
      } catch (err) {
        if (!cancelled) {
          signalPrintReady(err instanceof Error ? err.message : 'Failed to prepare payment receipt')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [receipt, error])

  return (
    <div className="pledge-print-page">
      <style>{paperPageCss('a5')}</style>
      {error && <p className="pledge-print-status pledge-print-error">{error}</p>}
      {!error && !receipt && <p className="pledge-print-status">Preparing payment receipt…</p>}
      {receipt && <PledgePaymentReceiptPrint receipt={receipt} shop={shop ?? undefined} />}
    </div>
  )
}
