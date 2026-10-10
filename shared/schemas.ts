import { z } from 'zod'
import { DEFAULT_ADAGU_REMINDER_TEMPLATE } from './adagu/reminders'
import { DEFAULT_CASH_VISIBILITY, DEFAULT_TAX_VISIBILITY } from './billTemplate'

export const idSchema = z.number().int().positive()

const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/

export const customerInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  phone: z
    .string()
    .regex(/^\d{10}$/, 'Mobile number must be exactly 10 digits'),
  address: z.string().trim().min(1, 'Address is required').max(500),
  guardianName: z.string().max(200).optional(),
  notes: z.string().max(1000).optional().default(''),
  gstin: z.string().max(20).optional(),
  aadhaar: z
    .string()
    .optional()
    .default('')
    .refine((value) => value === '' || /^\d{12}$/.test(value), {
      message: 'Aadhaar must be exactly 12 digits',
    }),
  pan: z
    .string()
    .optional()
    .default('')
    .transform((value) => value.trim().toUpperCase())
    .refine((value) => value === '' || panPattern.test(value), {
      message: 'PAN must be in format AAAAA9999A',
    }),
  idProofType: z.string().trim().max(50).optional().default(''),
})

export const pledgePaymentModeSchema = z.enum([
  'cash',
  'upi',
  'card',
  'bank_transfer',
  'transfer',
  'auction',
])
export const paperSizeSchema = z.enum(['a5', 'a4', 'thermal'])
export const printCopiesSchema = z.number().int().min(1).max(5)

const billLabel = z.string().max(80)

export const billTemplateSchema = z.object({
  cashTitle: billLabel,
  cashNoLabel: billLabel,
  cashDateLabel: billLabel,
  cashCustomerPrefix: billLabel,
  cashCustomerSign: billLabel,
  cashForPrefix: billLabel,
  taxTitle: billLabel,
  taxGstinLabel: billLabel,
  taxPhoneLabel: billLabel,
  taxMobileLabel: billLabel,
  taxBillNoLabel: billLabel,
  taxDateLabel: billLabel,
  taxBillToLabel: billLabel,
  taxColParticulars: billLabel,
  taxColTotWgt: billLabel,
  taxColGrsWgt: billLabel,
  taxColStnWgt: billLabel,
  taxColVamc: billLabel,
  taxColStoneRate: billLabel,
  taxColMetalRate: billLabel,
  taxColAmount: billLabel,
  taxItemCountLabel: billLabel,
  taxCgstLabel: billLabel,
  taxSgstLabel: billLabel,
  taxLessDiscountLabel: billLabel,
  taxThanks: z.string().max(200),
  taxCustomerSign: billLabel,
  marketRatesLabel: billLabel,
  goldRateLabel: billLabel,
  silverRateLabel: billLabel,
  amountInWordsLabel: z.string().max(120),
  discountBreakdownLabel: billLabel,
  netAmountLabel: billLabel,
  roundOffLabel: billLabel,
  totalLabel: billLabel,
  receivedLabel: billLabel,
  goodsReceivedLabel: z.string().max(200),
  thanksLabel: z.string().max(200),
})

export const cashVisibilitySchema = z.object({
  showLogo: z.boolean(),
  showTagline: z.boolean(),
  showGstin: z.boolean(),
  showBisLogo: z.boolean(),
  showQrCode: z.boolean(),
  showMarketRates: z.boolean(),
  showCustomerAddress: z.boolean(),
  showCustomerPhone: z.boolean(),
  showWastageCol: z.boolean(),
  showOtherCol: z.boolean(),
  showDiscountBreakdown: z.boolean(),
  showSignatures: z.boolean(),
  showThankYou: z.boolean(),
})

export const taxVisibilitySchema = z.object({
  showLogo: z.boolean(),
  showTagline: z.boolean(),
  showBisLogo: z.boolean(),
  showQrCode: z.boolean(),
  showMarketRates: z.boolean(),
  showCustomerAddress: z.boolean(),
  showWastageCol: z.boolean(),
  showOtherCol: z.boolean(),
  showDiscountBreakdown: z.boolean(),
  showSignatures: z.boolean(),
})

export const shopSettingsSchema = z.object({
  shopName: z.string().min(1).max(200),
  tagline: z.string().max(200),
  appSubtitle: z.string().max(200),
  gstin: z.string().max(20),
  phone1: z.string().max(30),
  phone2: z.string().max(30),
  addressLine1: z.string().max(200),
  addressLine2: z.string().max(200),
  addressLine3: z.string().max(200),
  city: z.string().max(80),
  state: z.string().max(80),
  pincode: z.string().max(20),
  proprietorLine1: z.string().max(200).default(''),
  proprietorLine2: z.string().max(200).default(''),
  proprietorLine3: z.string().max(200).default(''),
  promoLine: z.string().max(500).default(''),
  logoImagePath: z.string().max(500),
  signatureImagePath: z.string().max(500),
  bisLogoPath: z.string().max(500).default(''),
  qrCodePath: z.string().max(500).default(''),
  passbookBannerPath: z.string().max(500).default(''),
  passbookSideImagePath: z.string().max(500).default(''),
  paperSizeCash: paperSizeSchema,
  copiesCash: printCopiesSchema,
  billTemplate: billTemplateSchema,
  cashVisibility: cashVisibilitySchema.default(DEFAULT_CASH_VISIBILITY),
  taxVisibility: taxVisibilitySchema.default(DEFAULT_TAX_VISIBILITY),
  pledgeLtvPct: z.number().nonnegative().max(100).default(75),
  adaguInterestPct: z.number().nonnegative().max(100).default(2.1),
  adaguAuctionNoticeDays: z.number().int().nonnegative().max(365).default(14),
  adaguRequireKyc: z.boolean().default(false),
  adaguReminderTemplate: z
    .string()
    .max(500)
    .default(DEFAULT_ADAGU_REMINDER_TEMPLATE),
  pawnbrokerLicenseNo: z.string().max(60).default(''),
})

export const metalRatesInputSchema = z.object({
  effectiveDate: z.string().min(1),
  gold22k: z.number().nonnegative(),
  gold24k: z.number().nonnegative(),
  gold20k: z.number().nonnegative().optional(),
  gold18k: z.number().nonnegative().optional(),
  silverFine: z.number().nonnegative(),
  silver925: z.number().nonnegative().optional(),
  gold22kBuy: z.number().nonnegative().optional(),
  gold24kBuy: z.number().nonnegative().optional(),
  gold20kBuy: z.number().nonnegative().optional(),
  gold18kBuy: z.number().nonnegative().optional(),
  silverFineBuy: z.number().nonnegative().optional(),
  silver925Buy: z.number().nonnegative().optional(),
})

export const exportDbSchema = z.object({
  destinationPath: z.string().min(1),
})

export const restoreDbSchema = z.object({
  sourcePath: z.string().min(1),
})

export const FEATURE_KEY_VALUES = [
  'dashboard',
  'adagu',
  'gold_savings',
  'customers',
  'dues',
  'reports',
  'rates',
  'settings',
] as const

export const featureKeySchema = z.enum(FEATURE_KEY_VALUES)

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(6).max(200),
})

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, numbers, dots, underscores, and hyphens'),
  password: z.string().min(6).max(200),
  role: z.enum(['admin', 'staff']),
  features: z.array(featureKeySchema).optional(),
})

export const updatePermissionsSchema = z.object({
  features: z.array(featureKeySchema),
})

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(6).max(200),
})

export const dueEntryKindSchema = z.enum(['due', 'payment'])

export const dueEntryInputSchema = z.object({
  customerId: z.number().int().positive(),
  entryDate: z.string().min(1),
  kind: dueEntryKindSchema,
  amount: z.number().positive(),
  note: z.string().max(500),
})

export const dueEntryUpdateInputSchema = z.object({
  id: idSchema,
  entryDate: z.string().min(1),
  kind: dueEntryKindSchema,
  amount: z.number().positive(),
  note: z.string().max(500),
})

export const duePaymentInputSchema = z.object({
  dueEntryId: idSchema,
  amount: z.number().positive(),
  entryDate: z.string().min(1),
  note: z.string().max(500).default(''),
  mode: pledgePaymentModeSchema.optional(),
})

export const reportErrorSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(20000).optional(),
  source: z.enum(['boundary', 'window', 'rejection']),
})

export const businessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const pledgeStatusSchema = z.enum(['draft', 'active', 'redeemed', 'forfeited', 'renewed'])

export const pledgeItemInputSchema = z
  .object({
    description: z.string().trim().min(1).max(200),
    identification: z.string().max(500).optional(),
    metal: z.string().max(50),
    purity: z.string().max(50),
    grossWeight: z.number().nonnegative(),
    stoneWeight: z.number().nonnegative().optional(),
    netWeight: z.number().nonnegative(),
    pieces: z.number().int().positive(),
    ratePerGram: z.number().nonnegative().optional(),
    itemValue: z.number().nonnegative().optional(),
  })
  .refine((data) => (data.stoneWeight ?? 0) <= data.grossWeight, {
    message: 'Stone weight cannot exceed gross weight',
    path: ['stoneWeight'],
  })
  .refine((data) => data.netWeight <= data.grossWeight, {
    message: 'Net weight cannot exceed gross weight',
    path: ['netWeight'],
  })

const pledgeBaseSchema = z.object({
  customerId: z.number().int().positive(),
  pledgeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pledgeType: z.string().max(100).optional(),
  guardianName: z.string().max(200).optional(),
  customerAddress: z.string().max(500).optional(),
  assessedValue: z.number().nonnegative(),
  loanAmount: z.number().positive(),
  charges: z.number().nonnegative().optional(),
  interestPct: z.number().nonnegative(),
  repaymentDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  notes: z.string().max(1000).optional(),
  items: z.array(pledgeItemInputSchema).min(1),
  allowAboveLtv: z.boolean().optional(),
})

export const pledgeInputSchema = pledgeBaseSchema

export const pledgeUpdateInputSchema = pledgeBaseSchema.extend({
  id: z.number().int().positive(),
})

export const pledgeSanctionInputSchema = z.object({
  allowAboveLtv: z.boolean().optional(),
})

export const pledgeRedeemInputSchema = z.object({
  id: z.number().int().positive(),
  redeemedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountCollected: z.number().nonnegative(),
  discount: z.number().nonnegative().optional().default(0),
  mode: pledgePaymentModeSchema.optional().default('cash'),
})

export const pledgeCollectInputSchema = z.object({
  id: z.number().int().positive(),
  collectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  mode: pledgePaymentModeSchema.optional().default('cash'),
})

export const pledgeForfeitInputSchema = z.object({
  id: z.number().int().positive(),
  forfeitedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const pledgeRenewInputSchema = z.object({
  id: z.number().int().positive(),
  renewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: pledgePaymentModeSchema.optional().default('cash'),
  newLoanAmount: z.number().nonnegative().optional(),
  note: z.string().max(500).optional().default(''),
})

export const pledgeTopupInputSchema = z.object({
  pledgeId: z.number().int().positive(),
  topupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  note: z.string().max(500).optional().default(''),
})

export const pledgeAuctionNoticeInputSchema = z.object({
  id: z.number().int().positive(),
  noticeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const pledgeAuctionInputSchema = z.object({
  id: z.number().int().positive(),
  auctionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  buyerType: z.enum(['outside', 'shop']),
  buyerName: z.string().max(200).optional().default(''),
  saleAmount: z.number().nonnegative(),
  writeOffShortfall: z.boolean().optional().default(false),
  note: z.string().max(500).optional().default(''),
})

export const pledgeAuctionSurplusInputSchema = z.object({
  id: z.number().int().positive(),
  surplusPaidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: pledgePaymentModeSchema.optional().default('cash'),
})

export const pledgePhotoKindSchema = z.enum(['item', 'customer', 'id_proof'])

export const pledgeWhatsAppOpenSchema = z.object({
  pledgeId: z.number().int().positive(),
  url: z.string().trim().max(2000),
  kind: z.string().trim().max(50).optional().default('interest'),
})

export const restoreBackupNameSchema = z.object({
  name: z.string().trim().min(1).max(160),
})

export const inspectBackupSchema = z.object({
  name: z.string().trim().min(1).max(160),
})

export const backupSettingsSchema = z.object({
  frequency: z.enum(['daily', 'weekly']),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be HH:mm'),
  offsiteDir: z.string().trim().max(260).optional(),
})

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
const optionalIsoDateSchema = z
  .union([isoDateSchema, z.literal(''), z.null()])
  .optional()
  .transform((value) => (value ? value : null))

export const goldSavingPuritySchema = z.enum(['24K', '22K', '18K'])
export const goldSavingRateSourceSchema = z.enum(['configured', 'manual_allowed'])
export const goldSavingBonusTypeSchema = z.enum(['none', 'fixed_amount', 'percentage', 'additional_gold'])
export const goldSavingRedemptionTypeSchema = z.enum(['gold', 'jewellery', 'configurable'])
export const goldSavingSchemeStatusSchema = z.enum(['active', 'inactive'])
export const goldSavingPaymentModeSchema = z.enum(['cash', 'upi', 'card', 'bank_transfer', 'other'])
/** Maturity is paid out in cash/UPI/bank. The old kinds are read-only history. */
export const goldSavingRedemptionKindSchema = z.enum(['gold', 'jewellery', 'invoice', 'payout'])
export const goldSavingDeductionTypeSchema = z.enum(['none', 'percentage', 'fixed'])
export const goldSavingLateFeeTypeSchema = z.enum(['none', 'fixed', 'per_day'])
export const goldSavingReportIdSchema = z.enum([
  'daily-collections',
  'monthly-collections',
  'customer-ledger',
  'scheme-performance',
  'active-schemes',
  'matured-schemes',
  'overdue-installments',
  'overdue-aging',
  'cancelled-schemes',
  'gold-accumulation',
  'redemption-history',
  'outstanding-obligations',
])

export const goldSavingSchemeInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Scheme name is required').max(200),
    description: z.string().max(2000).optional().default(''),
    monthlyAmount: z.number().positive('Monthly installment must be greater than zero'),
    durationMonths: z.number().int().min(1).max(120),
    minInstallment: z.number().positive().nullable().optional(),
    maxInstallment: z.number().positive().nullable().optional(),
    purity: goldSavingPuritySchema,
    goldRateSource: goldSavingRateSourceSchema,
    bonusType: goldSavingBonusTypeSchema,
    bonusValue: z.number().nonnegative().optional().default(0),
    bonusEligibility: z.string().max(2000).optional().default(''),
    allowLatePayments: z.boolean().optional().default(true),
    gracePeriodDays: z.number().int().min(0).max(90).optional().default(0),
    allowMissedInstallments: z.boolean().optional().default(false),
    allowEarlyClosure: z.boolean().optional().default(false),
    allowPartialRedemption: z.boolean().optional().default(false),
    allowMultipleAccounts: z.boolean().optional().default(false),
    redemptionType: goldSavingRedemptionTypeSchema,
    makingChargeRules: z.string().max(2000).optional().default(''),
    wastageRules: z.string().max(2000).optional().default(''),
    availableFrom: optionalIsoDateSchema,
    availableTo: optionalIsoDateSchema,
    terms: z.string().max(8000).optional().default(''),
    status: goldSavingSchemeStatusSchema.optional().default('active'),
    cancelDeductionType: goldSavingDeductionTypeSchema.optional().default('none'),
    cancelDeductionValue: z.number().nonnegative().optional().default(0),
    lateFeeType: goldSavingLateFeeTypeSchema.optional().default('none'),
    lateFeeValue: z.number().nonnegative().optional().default(0),
  })
  .superRefine((data, ctx) => {
    if (data.minInstallment != null && data.minInstallment > data.monthlyAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Minimum installment cannot exceed the monthly amount',
        path: ['minInstallment'],
      })
    }
    if (data.maxInstallment != null && data.maxInstallment < data.monthlyAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Maximum installment cannot be below the monthly amount',
        path: ['maxInstallment'],
      })
    }
    if (data.bonusType !== 'none' && (data.bonusValue ?? 0) <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Bonus value is required when a bonus type is selected',
        path: ['bonusValue'],
      })
    }
    if (data.cancelDeductionType !== 'none' && (data.cancelDeductionValue ?? 0) <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cancellation deduction value is required when a deduction is selected',
        path: ['cancelDeductionValue'],
      })
    }
    if (
      data.cancelDeductionType === 'percentage' &&
      (data.cancelDeductionValue ?? 0) > 100
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cancellation deduction percentage cannot exceed 100',
        path: ['cancelDeductionValue'],
      })
    }
    if (data.lateFeeType !== 'none' && (data.lateFeeValue ?? 0) <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Late fee value is required when a late fee is selected',
        path: ['lateFeeValue'],
      })
    }
  })

export const goldSavingInitialPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentDate: isoDateSchema,
  paymentMode: goldSavingPaymentModeSchema,
  transactionRef: z.string().max(120).optional().default(''),
  goldRate: z.number().positive().optional(),
  goldRateOverrideReason: z.string().max(500).optional().default(''),
  acceptRateDate: z.boolean().optional(),
  remarks: z.string().max(500).optional().default(''),
  idempotencyKey: z.string().max(80).optional(),
})

export const goldSavingAccountInputSchema = z.object({
  customerId: z.number().int().positive(),
  schemeId: z.number().int().positive(),
  monthlyAmount: z.number().positive().optional(),
  enrollmentDate: isoDateSchema,
  firstInstallmentDate: isoDateSchema,
  preferredPaymentDay: z.number().int().min(1).max(28).nullable().optional(),
  nomineeName: z.string().max(200).optional().default(''),
  nomineeRelationship: z.string().max(80).optional().default(''),
  nomineePhone: z
    .string()
    .optional()
    .default('')
    .refine((value) => value === '' || /^\d{10}$/.test(value), {
      message: 'Nominee mobile number must be exactly 10 digits',
    }),
  termsAccepted: z.boolean().refine((value) => value === true, {
    message: 'Scheme terms must be accepted',
  }),
  acceptRateDate: z.boolean().optional(),
  initialPayment: goldSavingInitialPaymentSchema.optional(),
})

export const goldSavingPaymentInputSchema = z.object({
  accountId: z.number().int().positive(),
  installmentId: z.number().int().positive().optional(),
  installmentCount: z.number().int().min(1).max(120).optional(),
  paymentDate: isoDateSchema,
  amount: z.number().positive(),
  lateFee: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional().default(0),
  paymentMode: goldSavingPaymentModeSchema,
  transactionRef: z.string().max(120).optional().default(''),
  goldRate: z.number().positive().optional(),
  goldRateOverrideReason: z.string().max(500).optional().default(''),
  acceptRateDate: z.boolean().optional(),
  remarks: z.string().max(500).optional().default(''),
  idempotencyKey: z.string().max(80).optional(),
})

export const goldSavingReversePaymentSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(500),
})

export const goldSavingWaiveInstallmentSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(500),
})

export const goldSavingCancelAccountSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(500),
  refundDate: isoDateSchema.optional(),
  paymentMode: goldSavingPaymentModeSchema.optional().default('cash'),
  transactionRef: z.string().max(120).optional().default(''),
  deductionOverride: z.number().nonnegative().optional(),
})

export const goldSavingRedemptionInputSchema = z.object({
  accountId: z.number().int().positive(),
  redemptionDate: isoDateSchema,
  redemptionKind: z.literal('payout'),
  goldWeight: z.number().positive().optional(),
  paymentMode: z.enum(['cash', 'upi', 'bank_transfer']),
  transactionRef: z.string().max(120).optional().default(''),
  acceptRateDate: z.boolean().optional().default(false),
  notes: z.string().max(1000).optional().default(''),
})

const emptyToUndefined = (value: unknown) =>
  value === '' || value === undefined || value === null ? undefined : value

const optionalPositiveId = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().positive().optional(),
)

export const reportQuerySchema = z.object({
  from: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid from date').optional(),
  ),
  to: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid to date').optional(),
  ),
  customerId: optionalPositiveId,
})

/**
 * A fatal error the web layer caught: an error boundary, a window error, or an
 * unhandled promise rejection.
 */
export const clientCrashReportSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  stack: z.string().max(20_000).optional(),
  source: z.enum(['boundary', 'window', 'rejection']),
})

/**
 * A failure the desktop shell caught, such as a dead WebView2 process. `fatal`
 * marks one the app could not recover from, which the next launch reports.
 */
export const hostCrashReportSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  detail: z.string().max(20_000).optional().default(''),
  fatal: z.boolean().optional().default(false),
})
