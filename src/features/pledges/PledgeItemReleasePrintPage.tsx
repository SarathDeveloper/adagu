import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Pledge, PledgeItem } from '@shared/types'
import { api } from '../../lib/api'
import { shopSettingsToDisplay, type ShopDisplayInfo } from '../print/mapShopDisplay'
import { applyPaperDataset, paperPageCss } from '../print/paperSize'
import { signalPrintReady, waitForPrintLayout } from '../print/printPageUtils'
import { PledgeItemReleasePrint } from './PledgeItemReleasePrint'
import '../print/printDocument.css'
import './PledgePrint.css'

export function PledgeItemReleasePrintPage() {
  const { pledgeId, itemId } = useParams()
  const [pledge, setPledge] = useState<Pledge | null>(null)
  const [item, setItem] = useState<PledgeItem | null>(null)
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const id = Number(pledgeId)
        const jewelId = Number(itemId)
        if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(jewelId) || jewelId <= 0) {
          throw new Error('Invalid release')
        }
        const [data, settings] = await Promise.all([api.getPledge(id), api.getShopSettings()])
        if (!active) return
        const released = data.items.find((row) => row.id === jewelId)
        if (!released) throw new Error('That jewel is not on this loan')
        setShop(shopSettingsToDisplay(settings))
        applyPaperDataset('a4')
        setPledge(data)
        setItem(released)
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load release')
      }
    })()
    return () => {
      active = false
    }
  }, [itemId, pledgeId])

  useEffect(() => {
    if ((!pledge || !item) && !error) return
    let cancelled = false
    void (async () => {
      try {
        if (pledge) await waitForPrintLayout()
        if (cancelled) return
        signalPrintReady(error)
      } catch (err) {
        if (!cancelled) {
          signalPrintReady(err instanceof Error ? err.message : 'Failed to prepare release slip')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [error, item, pledge])

  return (
    <div className="pledge-print-page">
      <style>{paperPageCss('a4')}</style>
      {error && <p className="pledge-print-status pledge-print-error">{error}</p>}
      {!error && !pledge && <p className="pledge-print-status">Preparing item release…</p>}
      {pledge && item ? <PledgeItemReleasePrint pledge={pledge} item={item} shop={shop ?? undefined} /> : null}
    </div>
  )
}
