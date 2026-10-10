import {
  BILL_TEMPLATE_FIELDS,
  CASH_VISIBILITY_FIELDS,
  DEFAULT_BILL_TEMPLATE,
  DEFAULT_CASH_VISIBILITY,
  DEFAULT_TAX_VISIBILITY,
  TAX_VISIBILITY_FIELDS,
  templateSettingKey,
  visibilitySettingKey,
} from '@shared/billTemplate'
import type {
  BillTemplateSettings,
  CashBillVisibility,
  ShopSettings,
  TaxInvoiceVisibility,
} from '@shared/types'
import { DEFAULT_ADAGU_REMINDER_TEMPLATE } from '@shared/adagu/reminders'
import { getDatabase } from '../db'
import { clampCopies, parseBooleanSetting, parsePaperSize } from './printOptions'

const SHOP_KEYS = {
  shopName: 'shop_name',
  tagline: 'tagline',
  appSubtitle: 'app_subtitle',
  gstin: 'gstin',
  phone1: 'phone1',
  phone2: 'phone2',
  addressLine1: 'address_line1',
  addressLine2: 'address_line2',
  addressLine3: 'address_line3',
  city: 'city',
  state: 'state',
  pincode: 'pincode',
  proprietorLine1: 'proprietor_line1',
  proprietorLine2: 'proprietor_line2',
  proprietorLine3: 'proprietor_line3',
  promoLine: 'promo_line',
  logoImagePath: 'logo_image_path',
  signatureImagePath: 'signature_image_path',
  bisLogoPath: 'bis_logo_path',
  qrCodePath: 'qr_code_path',
  passbookBannerPath: 'passbook_banner_path',
  passbookSideImagePath: 'passbook_side_image_path',
  paperSizeCash: 'paper_size_cash',
  copiesCash: 'copies_cash',
  pledgeLtvPct: 'pledge_ltv_pct',
  adaguInterestPct: 'adagu_interest_pct',
  adaguAuctionNoticeDays: 'adagu_auction_notice_days',
  adaguRequireKyc: 'adagu_require_kyc',
  adaguReminderTemplate: 'adagu_reminder_template',
  pawnbrokerLicenseNo: 'pawnbroker_license_no',
} as const

const DEFAULT_PLEDGE_LTV_PCT = 75
const DEFAULT_ADAGU_INTEREST_PCT = 2.1
const DEFAULT_ADAGU_AUCTION_NOTICE_DAYS = 14
const DEFAULT_ADAGU_REQUIRE_KYC = false

function parsePledgeLtvPct(raw: string): number {
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value) || value < 0) return DEFAULT_PLEDGE_LTV_PCT
  return Math.min(100, value)
}

function parseAdaguInterestPct(raw: string): number {
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value) || value < 0) return DEFAULT_ADAGU_INTEREST_PCT
  return Math.min(100, value)
}

function parseAdaguAuctionNoticeDays(raw: string): number {
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value < 0) return DEFAULT_ADAGU_AUCTION_NOTICE_DAYS
  return Math.min(365, value)
}

function parseAdaguReminderTemplate(raw: string): string {
  const value = raw.trim()
  return value || DEFAULT_ADAGU_REMINDER_TEMPLATE
}

export function getShopSetting(db: ReturnType<typeof getDatabase>, key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM shop_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? fallback
}

export function setShopSetting(db: ReturnType<typeof getDatabase>, key: string, value: string): void {
  db.prepare(
    `INSERT INTO shop_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value)
}

function loadBillTemplate(db: ReturnType<typeof getDatabase>): BillTemplateSettings {
  const template = { ...DEFAULT_BILL_TEMPLATE }
  for (const field of BILL_TEMPLATE_FIELDS) {
    template[field] = getShopSetting(db, templateSettingKey(field), DEFAULT_BILL_TEMPLATE[field])
  }
  return template
}

function parseVisibilityFlag(raw: string, fallback: boolean): boolean {
  if (raw === '1' || raw === 'true') return true
  if (raw === '0' || raw === 'false') return false
  return fallback
}

function loadCashVisibility(db: ReturnType<typeof getDatabase>): CashBillVisibility {
  const visibility = { ...DEFAULT_CASH_VISIBILITY }
  for (const field of CASH_VISIBILITY_FIELDS) {
    visibility[field] = parseVisibilityFlag(
      getShopSetting(db, visibilitySettingKey('cash', field), ''),
      DEFAULT_CASH_VISIBILITY[field],
    )
  }
  return visibility
}

function loadTaxVisibility(db: ReturnType<typeof getDatabase>): TaxInvoiceVisibility {
  const visibility = { ...DEFAULT_TAX_VISIBILITY }
  for (const field of TAX_VISIBILITY_FIELDS) {
    visibility[field] = parseVisibilityFlag(
      getShopSetting(db, visibilitySettingKey('tax', field), ''),
      DEFAULT_TAX_VISIBILITY[field],
    )
  }
  return visibility
}

const DEFAULT_SHOP_NAME = 'AMMAN JEWELLERS'
const DEFAULT_GSTIN = '33BKJPP1190A1ZJ'
const DEFAULT_PHONE1 = '8903457570'
const DEFAULT_PHONE2 = '9583512688'
const DEFAULT_ADDRESS_LINE1 = 'No. 4, Kavitha Complex'
const DEFAULT_ADDRESS_LINE2 = 'Karumandurai, Salem Main Road, Periya Karaiyan Hills, Vadakku Nadu'
const DEFAULT_CITY = 'Salem'
const DEFAULT_STATE = 'Tamil Nadu'
const DEFAULT_PINCODE = '636138'

export function loadShopSettings(db: ReturnType<typeof getDatabase>): ShopSettings {
  return {
    shopName: getShopSetting(db, SHOP_KEYS.shopName, DEFAULT_SHOP_NAME).trim() || DEFAULT_SHOP_NAME,
    tagline: getShopSetting(db, SHOP_KEYS.tagline, ''),
    appSubtitle:
      getShopSetting(db, SHOP_KEYS.appSubtitle, 'Adagu & Gold Savings').trim() || 'Adagu & Gold Savings',
    gstin: getShopSetting(db, SHOP_KEYS.gstin, DEFAULT_GSTIN),
    phone1: getShopSetting(db, SHOP_KEYS.phone1, DEFAULT_PHONE1),
    phone2: getShopSetting(db, SHOP_KEYS.phone2, DEFAULT_PHONE2),
    addressLine1: getShopSetting(db, SHOP_KEYS.addressLine1, DEFAULT_ADDRESS_LINE1),
    addressLine2: getShopSetting(db, SHOP_KEYS.addressLine2, DEFAULT_ADDRESS_LINE2),
    addressLine3: getShopSetting(db, SHOP_KEYS.addressLine3, ''),
    city: getShopSetting(db, SHOP_KEYS.city, DEFAULT_CITY),
    state: getShopSetting(db, SHOP_KEYS.state, DEFAULT_STATE),
    pincode: getShopSetting(db, SHOP_KEYS.pincode, DEFAULT_PINCODE),
    proprietorLine1: getShopSetting(db, SHOP_KEYS.proprietorLine1, ''),
    proprietorLine2: getShopSetting(db, SHOP_KEYS.proprietorLine2, ''),
    proprietorLine3: getShopSetting(db, SHOP_KEYS.proprietorLine3, ''),
    promoLine: getShopSetting(db, SHOP_KEYS.promoLine, ''),
    logoImagePath: getShopSetting(db, SHOP_KEYS.logoImagePath, ''),
    signatureImagePath: getShopSetting(db, SHOP_KEYS.signatureImagePath, ''),
    bisLogoPath: getShopSetting(db, SHOP_KEYS.bisLogoPath, ''),
    qrCodePath: getShopSetting(db, SHOP_KEYS.qrCodePath, ''),
    passbookBannerPath: getShopSetting(db, SHOP_KEYS.passbookBannerPath, ''),
    passbookSideImagePath: getShopSetting(db, SHOP_KEYS.passbookSideImagePath, ''),
    paperSizeCash: parsePaperSize(getShopSetting(db, SHOP_KEYS.paperSizeCash, 'a5')),
    copiesCash: clampCopies(getShopSetting(db, SHOP_KEYS.copiesCash, '1')),
    billTemplate: loadBillTemplate(db),
    cashVisibility: loadCashVisibility(db),
    taxVisibility: loadTaxVisibility(db),
    pledgeLtvPct: parsePledgeLtvPct(getShopSetting(db, SHOP_KEYS.pledgeLtvPct, String(DEFAULT_PLEDGE_LTV_PCT))),
    adaguInterestPct: parseAdaguInterestPct(
      getShopSetting(db, SHOP_KEYS.adaguInterestPct, String(DEFAULT_ADAGU_INTEREST_PCT)),
    ),
    adaguAuctionNoticeDays: parseAdaguAuctionNoticeDays(
      getShopSetting(
        db,
        SHOP_KEYS.adaguAuctionNoticeDays,
        String(DEFAULT_ADAGU_AUCTION_NOTICE_DAYS),
      ),
    ),
    adaguRequireKyc: parseBooleanSetting(
      getShopSetting(db, SHOP_KEYS.adaguRequireKyc, DEFAULT_ADAGU_REQUIRE_KYC ? '1' : '0'),
    ),
    adaguReminderTemplate: parseAdaguReminderTemplate(
      getShopSetting(db, SHOP_KEYS.adaguReminderTemplate, DEFAULT_ADAGU_REMINDER_TEMPLATE),
    ),
    pawnbrokerLicenseNo: getShopSetting(db, SHOP_KEYS.pawnbrokerLicenseNo, '').trim(),
  }
}

export function saveShopSettings(db: ReturnType<typeof getDatabase>, input: ShopSettings): ShopSettings {
  setShopSetting(db, SHOP_KEYS.shopName, input.shopName)
  setShopSetting(db, SHOP_KEYS.tagline, input.tagline)
  setShopSetting(db, SHOP_KEYS.appSubtitle, input.appSubtitle)
  setShopSetting(db, SHOP_KEYS.gstin, input.gstin)
  setShopSetting(db, SHOP_KEYS.phone1, input.phone1)
  setShopSetting(db, SHOP_KEYS.phone2, input.phone2)
  setShopSetting(db, SHOP_KEYS.addressLine1, input.addressLine1)
  setShopSetting(db, SHOP_KEYS.addressLine2, input.addressLine2)
  setShopSetting(db, SHOP_KEYS.addressLine3, input.addressLine3)
  setShopSetting(db, SHOP_KEYS.city, input.city)
  setShopSetting(db, SHOP_KEYS.state, input.state)
  setShopSetting(db, SHOP_KEYS.pincode, input.pincode)
  setShopSetting(db, SHOP_KEYS.proprietorLine1, input.proprietorLine1)
  setShopSetting(db, SHOP_KEYS.proprietorLine2, input.proprietorLine2)
  setShopSetting(db, SHOP_KEYS.proprietorLine3, input.proprietorLine3)
  setShopSetting(db, SHOP_KEYS.promoLine, input.promoLine)
  setShopSetting(db, SHOP_KEYS.logoImagePath, input.logoImagePath)
  setShopSetting(db, SHOP_KEYS.signatureImagePath, input.signatureImagePath)
  setShopSetting(db, SHOP_KEYS.bisLogoPath, input.bisLogoPath ?? '')
  setShopSetting(db, SHOP_KEYS.qrCodePath, input.qrCodePath ?? '')
  setShopSetting(db, SHOP_KEYS.passbookBannerPath, input.passbookBannerPath ?? '')
  setShopSetting(db, SHOP_KEYS.passbookSideImagePath, input.passbookSideImagePath ?? '')
  setShopSetting(db, SHOP_KEYS.paperSizeCash, input.paperSizeCash)
  setShopSetting(db, SHOP_KEYS.copiesCash, String(input.copiesCash))
  setShopSetting(
    db,
    SHOP_KEYS.pledgeLtvPct,
    String(input.pledgeLtvPct ?? DEFAULT_PLEDGE_LTV_PCT),
  )
  setShopSetting(
    db,
    SHOP_KEYS.adaguInterestPct,
    String(input.adaguInterestPct ?? DEFAULT_ADAGU_INTEREST_PCT),
  )
  setShopSetting(
    db,
    SHOP_KEYS.adaguAuctionNoticeDays,
    String(input.adaguAuctionNoticeDays ?? DEFAULT_ADAGU_AUCTION_NOTICE_DAYS),
  )
  setShopSetting(db, SHOP_KEYS.adaguRequireKyc, input.adaguRequireKyc ? '1' : '0')
  setShopSetting(
    db,
    SHOP_KEYS.adaguReminderTemplate,
    input.adaguReminderTemplate?.trim() || DEFAULT_ADAGU_REMINDER_TEMPLATE,
  )
  setShopSetting(db, SHOP_KEYS.pawnbrokerLicenseNo, (input.pawnbrokerLicenseNo ?? '').trim())
  for (const field of BILL_TEMPLATE_FIELDS) {
    setShopSetting(db, templateSettingKey(field), input.billTemplate[field])
  }
  const cashVisibility = { ...DEFAULT_CASH_VISIBILITY, ...input.cashVisibility }
  const taxVisibility = { ...DEFAULT_TAX_VISIBILITY, ...input.taxVisibility }
  for (const field of CASH_VISIBILITY_FIELDS) {
    setShopSetting(db, visibilitySettingKey('cash', field), cashVisibility[field] ? '1' : '0')
  }
  for (const field of TAX_VISIBILITY_FIELDS) {
    setShopSetting(db, visibilitySettingKey('tax', field), taxVisibility[field] ? '1' : '0')
  }
  return loadShopSettings(db)
}
