import { useEffect, useState } from 'react'
import type { ShopDisplayInfo } from './mapShopDisplay'
import { shopSettingsToDisplay } from './mapShopDisplay'
import { applyPaperDataset } from './paperSize'
import { signalPrintReady, waitForPrintLayout } from './printPageUtils'
import { clearSampleBillPrint, peekSampleBillPrint } from '../settings/sampleBillPrintStore'
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
  // Read once without consuming it: StrictMode runs effects (and state
  // initialisers) twice in development, and a read that removes the sample
  // would leave the second pass with nothing to print.
  const [shop] = useState<ShopDisplayInfo | null>(() => {
    const settings = peekSampleBillPrint('adagu')
    return settings ? shopSettingsToDisplay(settings) : null
  })

  useEffect(() => {
    applyPaperDataset('a4')
    clearSampleBillPrint()
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
