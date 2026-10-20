import { describe, expect, it } from 'vitest'
import { DEFAULT_BILL_TEMPLATE, templateSettingKey } from '@shared/billTemplate'
import type { ShopSettings } from '@shared/types'
import { getDatabase } from '../../server/db'
import { loadShopSettings, markShopSetupSkipped } from '../../server/lib/settingsStore'
import { IPC_CHANNELS, ipc, useIntegrationEnv } from './helpers/testEnv'
import { invokeIpcForTests } from './helpers/testEnv'

describe('settings IPC', () => {
  useIntegrationEnv()

  it('returns default bill template labels on get', async () => {
    const settings = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(settings.billTemplate).toEqual(DEFAULT_BILL_TEMPLATE)
  })

  it('persists bill template labels through update and reloads from SQLite', async () => {
    const current = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    const updated = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_UPDATE, {
      ...current,
      shopName: 'Template Shop',
      billTemplate: {
        ...current.billTemplate,
        cashTitle: 'ESTIMATE',
        cashCustomerPrefix: 'Mr',
        taxThanks: 'Visit again soon',
      },
    })

    expect(updated.billTemplate.cashTitle).toBe('ESTIMATE')
    expect(updated.billTemplate.cashCustomerPrefix).toBe('Mr')
    expect(updated.billTemplate.taxThanks).toBe('Visit again soon')

    const db = getDatabase()
    expect(
      db
        .prepare('SELECT value FROM shop_settings WHERE key = ?')
        .get(templateSettingKey('cashTitle')) as { value: string },
    ).toEqual({ value: 'ESTIMATE' })

    const reloaded = loadShopSettings(db)
    expect(reloaded.billTemplate.cashTitle).toBe('ESTIMATE')
    expect(reloaded.billTemplate.cashCustomerPrefix).toBe('Mr')

    const viaIpc = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(viaIpc.billTemplate.cashTitle).toBe('ESTIMATE')
  })

  it('starts with a blank shop identity', async () => {
    const settings = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(settings.shopName).toBe('')
    expect(settings.tagline).toBe('')
    expect(settings.gstin).toBe('')
    expect(settings.phone1).toBe('')
    expect(settings.phone2).toBe('')
    expect(settings.addressLine1).toBe('')
    expect(settings.addressLine2).toBe('')
    expect(settings.city).toBe('')
    expect(settings.state).toBe('')
    expect(settings.pincode).toBe('')
    expect(settings.proprietorLine1).toBe('')
    expect(settings.promoLine).toBe('')
    expect(settings.logoImagePath).toBe('')
    expect(settings.pawnbrokerLicenseNo).toBe('')
    expect(settings.setupSkipped).toBe(false)
  })

  it('persists proprietor and promo lines', async () => {
    const current = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    const updated = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_UPDATE, {
      ...current,
      shopName: 'Test Shop',
      proprietorLine1: 'A. Owner',
      proprietorLine2: 'Partner',
      promoLine: 'Hallmarked jewellery',
    })
    expect(updated.proprietorLine1).toBe('A. Owner')
    expect(updated.proprietorLine2).toBe('Partner')
    expect(updated.promoLine).toBe('Hallmarked jewellery')

    const reloaded = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(reloaded.proprietorLine1).toBe('A. Owner')
    expect(reloaded.promoLine).toBe('Hallmarked jewellery')
  })

  it('returns Adagu & Gold Savings as the default app subtitle', async () => {
    const settings = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(settings.appSubtitle).toBe('Adagu & Gold Savings')
  })

  it('persists app subtitle for sidebar branding', async () => {
    const current = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)

    const updated = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_UPDATE, {
      ...current,
      shopName: 'Sample Jewellers',
      appSubtitle: 'Gold and silver',
    })
    expect(updated.shopName).toBe('Sample Jewellers')
    expect(updated.appSubtitle).toBe('Gold and silver')

    const db = getDatabase()
    expect(
      db.prepare('SELECT value FROM shop_settings WHERE key = ?').get('app_subtitle') as {
        value: string
      },
    ).toEqual({ value: 'Gold and silver' })

    const reloaded = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(reloaded.appSubtitle).toBe('Gold and silver')
  })

  it('persists printer paper size and copies', async () => {
    const current = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(current.paperSizeCash).toBe('a5')
    expect(current.copiesCash).toBe(1)

    const updated = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_UPDATE, {
      ...current,
      shopName: 'Printer Shop',
      paperSizeCash: 'thermal',
      copiesCash: 2,
    })

    expect(updated.paperSizeCash).toBe('thermal')
    expect(updated.copiesCash).toBe(2)

    const reloaded = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(reloaded.paperSizeCash).toBe('thermal')
    expect(reloaded.copiesCash).toBe(2)
  })

  it('persists Adagu and Gold Savings template visibility', async () => {
    const current = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(current.cashVisibility.showWastageCol).toBe(true)
    expect(current.taxVisibility.showWastageCol).toBe(true)

    const updated = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_UPDATE, {
      ...current,
      shopName: 'Visibility Shop',
      cashVisibility: { ...current.cashVisibility, showWastageCol: false, showOtherCol: false },
      taxVisibility: { ...current.taxVisibility, showWastageCol: false, showMarketRates: false },
    })

    expect(updated.cashVisibility.showWastageCol).toBe(false)
    expect(updated.taxVisibility.showWastageCol).toBe(false)

    const reloaded = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(reloaded.cashVisibility.showWastageCol).toBe(false)
    expect(reloaded.cashVisibility.showOtherCol).toBe(false)
    expect(reloaded.taxVisibility.showWastageCol).toBe(false)
    expect(reloaded.taxVisibility.showMarketRates).toBe(false)
  })

  it('persists the Adagu pledge defaults', async () => {
    const current = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(current.pledgeLtvPct).toBe(75)
    expect(current.adaguInterestPct).toBe(2.1)
    expect(current.adaguAuctionNoticeDays).toBe(14)

    const updated = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_UPDATE, {
      ...current,
      shopName: 'Adagu Shop',
      pledgeLtvPct: 70,
      adaguInterestPct: 2.5,
      adaguAuctionNoticeDays: 21,
      adaguRequireKyc: true,
    })

    expect(updated.pledgeLtvPct).toBe(70)
    expect(updated.adaguInterestPct).toBe(2.5)
    expect(updated.adaguAuctionNoticeDays).toBe(21)
    expect(updated.adaguRequireKyc).toBe(true)

    const reloaded = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(reloaded.pledgeLtvPct).toBe(70)
    expect(reloaded.adaguInterestPct).toBe(2.5)
    expect(reloaded.adaguAuctionNoticeDays).toBe(21)
    expect(reloaded.adaguRequireKyc).toBe(true)
  })

  it('persists logo image path through update and reloads from SQLite', async () => {
    const current = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    const updated = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_UPDATE, {
      ...current,
      shopName: 'Logo Shop',
      logoImagePath: '/uploads/test-logo.png',
    })

    expect(updated.logoImagePath).toBe('/uploads/test-logo.png')

    const db = getDatabase()
    expect(
      db.prepare('SELECT value FROM shop_settings WHERE key = ?').get('logo_image_path') as {
        value: string
      },
    ).toEqual({ value: '/uploads/test-logo.png' })

    const reloaded = loadShopSettings(db)
    expect(reloaded.logoImagePath).toBe('/uploads/test-logo.png')

    const viaIpc = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(viaIpc.logoImagePath).toBe('/uploads/test-logo.png')
  })

  it('persists gold savings passbook image paths', async () => {
    const current = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    const updated = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_UPDATE, {
      ...current,
      shopName: 'Passbook Shop',
      passbookBannerPath: '/uploads/passbook-banner.png',
      passbookSideImagePath: '/uploads/passbook-side.png',
    })

    expect(updated.passbookBannerPath).toBe('/uploads/passbook-banner.png')
    expect(updated.passbookSideImagePath).toBe('/uploads/passbook-side.png')

    const reloaded = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(reloaded.passbookBannerPath).toBe('/uploads/passbook-banner.png')
    expect(reloaded.passbookSideImagePath).toBe('/uploads/passbook-side.png')
  })

  it('keeps a skipped setup after shop details are saved later', async () => {
    const db = getDatabase()
    const skipped = markShopSetupSkipped(db)
    expect(skipped.setupSkipped).toBe(true)
    expect(skipped.shopName).toBe('')

    const updated = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_UPDATE, {
      ...skipped,
      shopName: 'Later Shop',
    })
    expect(updated.shopName).toBe('Later Shop')
    expect(updated.setupSkipped).toBe(true)

    const reloaded = loadShopSettings(getDatabase())
    expect(reloaded.setupSkipped).toBe(true)
  })

  it('returns the customer count from SQLite', async () => {
    const counts = await ipc<{ customers: number }>(IPC_CHANNELS.SETTINGS_COUNTS)
    const db = getDatabase()
    const customers = db.prepare('SELECT COUNT(*) AS n FROM customers').get() as { n: number }
    expect(counts.customers).toBe(customers.n)
  })

  it('rejects shop settings updates without billTemplate', async () => {
    const current = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    const { billTemplate: _removed, ...withoutTemplate } = current

    const result = await invokeIpcForTests<ShopSettings>(
      IPC_CHANNELS.SETTINGS_UPDATE,
      withoutTemplate,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0)
    }
  })
})
