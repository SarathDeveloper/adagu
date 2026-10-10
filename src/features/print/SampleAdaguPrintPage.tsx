import { useEffect, useState } from 'react'
import type { ShopDisplayInfo } from './mapShopDisplay'
import { shopSettingsToDisplay } from './mapShopDisplay'
import { applyPaperDataset } from './paperSize'
import { signalPrintReady, waitForPrintLayout } from './printPageUtils'
import { takeSampleBillPrint } from '../settings/sampleBillPrintStore'
import { SAMPLE_ADAGU_PLEDGE } from './sampleAdaguPledge'
import { PledgePrint } from '../pledges/PledgePrint'
import './printDocument.css'
import '../pledges/PledgePrint.css'

/**
 * Settings > Invoice Settings > Test Print. Renders the Adagu receipt template
 * with sample data and the shop details the user just saved, so the layout can
 * be checked without creating a real pledge.
 */
export function SampleAdaguPrintPage() {
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)

  useEffect(() => {
    const settings = takeSampleBillPrint('adagu')
    applyPaperDataset('a4')
    setShop(settings ? shopSettingsToDisplay(settings) : null)
  }, [])

  useEffect(() => {
    if (!shop) return
    let active = true
    void (async () => {
      await waitForPrintLayout()
      if (active) signalPrintReady(null)
    })()
    return () => {
      active = false
    }
  }, [shop])

  if (!shop) return null
  return <PledgePrint pledge={SAMPLE_ADAGU_PLEDGE} shop={shop} />
}
