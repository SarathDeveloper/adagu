import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../../lib/api'
import { GOLD_SAVINGS_VISIBLE } from '../goldSavings/visibility'

export const DEFAULT_APP_SUBTITLE = 'Adagu & Gold Savings'
const HIDDEN_GOLD_SAVINGS_SUBTITLE = 'Adagu'

function displayAppSubtitle(subtitle: string): string {
  if (!GOLD_SAVINGS_VISIBLE && subtitle === DEFAULT_APP_SUBTITLE) return HIDDEN_GOLD_SAVINGS_SUBTITLE
  return subtitle
}
export const DEFAULT_WINDOW_TITLE = 'AdaguTrackerPro'

interface ShopBranding {
  shopName: string
  appSubtitle: string
  logoImagePath: string
  /** False until the first settings load finishes. */
  ready: boolean
  /** True when settings loaded and the shop still has no name. */
  needsSetup: boolean
  refresh: () => Promise<boolean>
}

const ShopBrandingContext = createContext<ShopBranding>({
  shopName: '',
  appSubtitle: DEFAULT_APP_SUBTITLE,
  logoImagePath: '',
  ready: false,
  needsSetup: false,
  refresh: async () => false,
})

function applyWindowTitle(shopName: string) {
  document.title = shopName.trim() || DEFAULT_WINDOW_TITLE
}

export function ShopBrandingProvider({ children }: { children: ReactNode }) {
  const [shopName, setShopName] = useState('')
  const [appSubtitle, setAppSubtitle] = useState(DEFAULT_APP_SUBTITLE)
  const [logoImagePath, setLogoImagePath] = useState('')
  const [ready, setReady] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const settings = await api.getShopSettings()
      const nextName = settings.shopName.trim()
      setShopName(nextName)
      setAppSubtitle(settings.appSubtitle.trim() || DEFAULT_APP_SUBTITLE)
      setLogoImagePath(settings.logoImagePath.trim())
      setNeedsSetup(!nextName)
      setReady(true)
      applyWindowTitle(nextName)
      return true
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    applyWindowTitle('')

    async function load() {
      // The API can still be starting when the window opens. A failed first
      // read must not be treated as "this shop is already configured".
      for (let attempt = 0; attempt < 8 && !cancelled; attempt += 1) {
        if (await refresh()) return
        await new Promise((resolve) => window.setTimeout(resolve, 400))
      }
      if (!cancelled) setReady(true)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const value = useMemo(
    () => ({
      shopName,
      appSubtitle: displayAppSubtitle(appSubtitle),
      logoImagePath,
      ready,
      needsSetup,
      refresh,
    }),
    [shopName, appSubtitle, logoImagePath, ready, needsSetup, refresh],
  )

  return <ShopBrandingContext.Provider value={value}>{children}</ShopBrandingContext.Provider>
}

export function useShopBranding() {
  return useContext(ShopBrandingContext)
}
