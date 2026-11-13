import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Pledge } from '@shared/types'
import { api } from '../../lib/api'
import { shopSettingsToDisplay, type ShopDisplayInfo } from '../print/mapShopDisplay'
import { applyPaperDataset, paperPageCss } from '../print/paperSize'
import { signalPrintReady, waitForPrintLayout } from '../print/printPageUtils'
import { PledgePrint } from './PledgePrint'
import '../print/printDocument.css'
import './PledgePrint.css'

export function PledgePrintPage() {
  const { id } = useParams()
  const [pledge, setPledge] = useState<Pledge | null>(null)
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)
  const [customerPhotoPath, setCustomerPhotoPath] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const pledgeId = Number(id)
        if (!Number.isInteger(pledgeId) || pledgeId <= 0) {
          throw new Error('Invalid pledge id')
        }
        const [data, settings] = await Promise.all([
          api.getPledge(pledgeId),
          api.getShopSettings(),
        ])
        if (!active) return
        // The profile photo is a fallback for loans without their own borrower
        // photo; staff without Customers access simply print without it.
        const documents = data.photos.some((photo) => photo.kind === 'customer')
          ? []
          : await api.listCustomerDocuments(data.customerId).catch(() => [])
        if (!active) return
        setCustomerPhotoPath(documents.find((doc) => doc.kind === 'photo')?.path ?? '')
        setShop(shopSettingsToDisplay(settings))
        applyPaperDataset('a4')
        setPledge(data)
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load pledge')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    if (!pledge && !error) return

    let cancelled = false
    void (async () => {
      try {
        if (pledge) {
          await waitForPrintLayout()
        }
        if (cancelled) return
        signalPrintReady(error)
      } catch (err) {
        if (!cancelled) {
          signalPrintReady(err instanceof Error ? err.message : 'Failed to prepare pledge')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pledge, error])

  return (
    <div className="pledge-print-page">
      <style>{paperPageCss('a4')}</style>
      {error && <p className="pledge-print-status pledge-print-error">{error}</p>}
      {!error && !pledge && <p className="pledge-print-status">Preparing pledge receipt…</p>}
      {pledge && <PledgePrint pledge={pledge} shop={shop ?? undefined} customerPhotoPath={customerPhotoPath} />}
    </div>
  )
}
