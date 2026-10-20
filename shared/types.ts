import type { BillTemplateSettings, CashBillVisibility, TaxInvoiceVisibility } from './billTemplate'

export type { BillTemplateSettings, CashBillVisibility, TaxInvoiceVisibility } from './billTemplate'

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; referenceId?: string }

export interface PagedList<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type PaperSize = 'a5' | 'a4' | 'thermal'

export type LogCategory = 'application' | 'database' | 'printer' | 'crash' | 'backup'

export type DiagnosticSource = 'boundary' | 'window' | 'rejection'

export interface DiagnosticReport {
  referenceId: string
  timestamp: string
  version: string
  category: LogCategory
  message: string
  stack?: string
}

export interface RendererErrorInput {
  message: string
  stack?: string
  source: DiagnosticSource
}

export interface PrintReadyPayload {
  contentHeightMicrons?: number
}

export interface Customer {
  id: number
  name: string
  phone: string
  address: string
  guardianName: string
  notes: string
  gstin: string
  aadhaar: string
  pan: string
  idProofType: string
  createdAt: string
}

export interface CustomerInput {
  name: string
  phone: string
  address: string
  guardianName?: string
  notes?: string
  gstin?: string
  aadhaar?: string
  pan?: string
  idProofType?: string
}

export interface PledgeListQuery {
  page?: number
  pageSize?: number
  from?: string | null
  to?: string | null
  q?: string
  status?: string
  sort?: 'asc' | 'desc'
}

export interface ShopSettings {
  shopName: string
  tagline: string
  appSubtitle: string
  gstin: string
  phone1: string
  phone2: string
  addressLine1: string
  addressLine2: string
  addressLine3: string
  city: string
  state: string
  pincode: string
  proprietorLine1: string
  proprietorLine2: string
  proprietorLine3: string
  promoLine: string
  logoImagePath: string
  signatureImagePath: string
  bisLogoPath: string
  qrCodePath: string
  passbookBannerPath: string
  passbookSideImagePath: string
  paperSizeCash: PaperSize
  copiesCash: number
  billTemplate: BillTemplateSettings
  cashVisibility: CashBillVisibility
  taxVisibility: TaxInvoiceVisibility
  pledgeLtvPct: number
  adaguInterestPct: number
  adaguAuctionNoticeDays: number
  adaguRequireKyc: boolean
  adaguReminderTemplate: string
  pawnbrokerLicenseNo: string
  setupSkipped: boolean
}

export interface MetalRates {
  id: number
  effectiveDate: string
  gold22k: number
  gold24k: number
  gold20k: number
  gold18k: number
  silverFine: number
  silver925: number
  /** Buying rates for old gold. Zero or unset falls back to the matching selling rate. */
  gold22kBuy?: number
  gold24kBuy?: number
  gold20kBuy?: number
  gold18kBuy?: number
  silverFineBuy?: number
  silver925Buy?: number
  createdAt: string
}

export interface MetalRatesInput {
  effectiveDate: string
  gold22k: number
  gold24k: number
  gold20k?: number
  gold18k?: number
  silverFine: number
  silver925?: number
  gold22kBuy?: number
  gold24kBuy?: number
  gold20kBuy?: number
  gold18kBuy?: number
  silverFineBuy?: number
  silver925Buy?: number
}

export type DueEntryKind = 'due' | 'payment'

export interface DueEntry {
  id: number
  customerId: number
  entryDate: string
  kind: DueEntryKind
  amount: number
  note: string
  /** Payment mode for `payment` rows; `transfer` marks a renewal carry-over. */
  mode: string | null
  pledgeId: number | null
  pledgeReceiptNo: string | null
  createdAt: string
  /** Amount still owed on the linked Adagu pledge, when this entry is pledge-linked. */
  balanceDue: number | null
}

export interface DueEntryUpdateInput {
  id: number
  entryDate: string
  kind: DueEntryKind
  amount: number
  note: string
}

export interface DueEntryInput {
  customerId: number
  entryDate: string
  kind: DueEntryKind
  amount: number
  note: string
}

export interface DuePaymentInput {
  dueEntryId: number
  amount: number
  entryDate: string
  note: string
  mode?: PledgePaymentMode
}

export interface CustomerDuesColumn {
  customerId: number
  customerName: string
  customerPhone: string
  balance: number
  entries: DueEntry[]
}

export interface AdaguDueSummary {
  pledgeId: number
  dueEntryId: number | null
  customerId: number
  customerName: string
  customerPhone: string
  receiptNo: string
  pledgeDate: string
  principal: number
  principalOutstanding: number
  /** Value on which the LTV band is measured (the pledge's assessed value). */
  assessedValue: number
  interestPct: number
  monthlyInterest: number
  daysActive: number
  interestDue: number
  interestPaidUpto: string
  nextInterestDue: string
  isInterestOverdue: boolean
  totalDue: number
  amountCollected: number
  remaining: number
  status: PledgeStatus
  auctionNoticeDate?: string | null
  auctionDate?: string | null
  topups: PledgeTopup[]
}

export interface DuesLedger {
  columns: CustomerDuesColumn[]
  totalOutstanding: number
  adaguDues?: AdaguDueSummary[]
  adaguOutstanding?: number
}

export interface AppInfo {
  version: string
  dbPath: string
  logsPath: string
}

export interface RecordCounts {
  customers: number
}

export interface BackupStatus {
  lastBackupAt: string | null
  frequency: 'daily' | 'weekly'
  time: string
  nextBackupAt: string | null
  offsiteDir: string
  lastOffsiteAt: string | null
  lastOffsiteError: string | null
  lastBackupError: string | null
}

export type BackupKind = 'daily' | 'manual' | 'dayclose' | 'prerestore' | 'premigrate'

export interface BackupFile {
  name: string
  createdAt: string
  sizeBytes: number
  kind: BackupKind
}

export interface BackupInspection {
  name: string
  schemaVersion: number
  appSchemaVersion: number
  restorable: boolean
  counts: {
    customers: number
    pledges: number
    goldSavingAccounts: number
  }
  issues: string[]
}

export type UserRole = 'admin' | 'staff'

export type FeatureKey =
  | 'dashboard'
  | 'adagu'
  | 'customers'
  | 'dues'
  | 'reports'
  | 'settings'
  | 'gold_savings'

export const FEATURE_KEYS: FeatureKey[] = [
  'dashboard',
  'adagu',
  'gold_savings',
  'customers',
  'dues',
  'reports',
  'settings',
]

export interface User {
  id: number
  username: string
  role: UserRole
  mustChangePassword: boolean
  active: boolean
  features: FeatureKey[]
  createdAt: string
}

export type AuthUser = User

export interface LoginInput {
  username: string
  password: string
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

export interface CreateUserInput {
  username: string
  password: string
  role: UserRole
  features?: FeatureKey[]
}

export interface UpdatePermissionsInput {
  features: FeatureKey[]
}

export interface ResetPasswordInput {
  newPassword: string
}

export type PledgeStatus = 'draft' | 'active' | 'redeemed' | 'forfeited' | 'renewed'

export type PledgePaymentKind =
  | 'interest'
  | 'part'
  | 'redeem'
  | 'renewal'
  | 'transfer'
  | 'auction'
  | 'legacy'

export type PledgePaymentMode =
  | 'cash'
  | 'upi'
  | 'card'
  | 'bank_transfer'
  | 'transfer'
  | 'auction'

export interface PledgePayment {
  id: number
  pledgeId: number
  paymentDate: string
  kind: PledgePaymentKind
  mode: PledgePaymentMode
  amount: number
  interestPart: number
  principalPart: number
  discount: number
  note: string
  createdAt: string
}

/** Replayed interest state of a pledge at a given date. */
export interface PledgePayoff {
  asOfDate: string
  principalOutstanding: number
  assessedInterest: number
  currentInterest: number
  interestCredit: number
  interestDue: number
  totalDiscount: number
  grossDue: number
  payoff: number
  daysActive: number
  interestPaidUpto: string
  nextInterestDue: string
  isInterestOverdue: boolean
  monthlyInterest: number
}

export interface PledgeItem {
  id: number
  pledgeId: number
  description: string
  identification: string
  metal: string
  purity: string
  grossWeight: number
  stoneWeight: number
  netWeight: number
  pieces: number
  ratePerGram: number
  itemValue: number
}

export interface PledgeItemInput {
  description: string
  identification?: string
  metal: string
  purity: string
  grossWeight: number
  stoneWeight?: number
  netWeight: number
  pieces: number
  ratePerGram?: number
  itemValue?: number
}

export type PledgePhotoKind = 'item' | 'customer' | 'id_proof'

export interface PledgePhoto {
  id: number
  pledgeId: number
  kind: PledgePhotoKind
  path: string
  createdAt: string
}

export interface PledgeReminder {
  id: number
  pledgeId: number
  kind: string
  channel: string
  sentAt: string
}

/** Why a loan appears in the reminder list. */
export type PledgeReminderReason =
  | 'interest_due'
  | 'interest_overdue'
  | 'maturity'
  | 'auction_notice'
  | 'auction_due'

export interface PledgeReminderEntry {
  pledgeId: number
  receiptNo: string
  customerId: number
  customerName: string
  customerPhone: string
  status: PledgeStatus
  reason: PledgeReminderReason
  /** The date that drives the reminder (next interest due or repayment due). */
  dueDate: string | null
  /** Negative when the date is already in the past. */
  daysUntil: number
  interestDue: number
  principalOutstanding: number
  totalDue: number
  nextInterestDue: string
  isInterestOverdue: boolean
  lastRemindedAt: string | null
  /** Ready-to-open WhatsApp link built from the shop reminder template. */
  whatsappUrl: string | null
}

export interface PledgeWhatsAppOpenInput {
  pledgeId: number
  url: string
  kind?: string
}

export interface Pledge {
  id: number
  customerId: number
  customerName: string
  customerPhone: string
  customerAddress: string
  guardianName: string
  /** Borrower KYC, echoed for printing (Aadhaar is masked on the print). */
  customerAadhaar?: string
  customerPan?: string
  customerIdProofType?: string
  receiptNo: string
  pledgeDate: string
  pledgeType: string
  assessedValue: number
  loanAmount: number
  charges: number
  interestPct: number
  repaymentDueDate: string | null
  status: PledgeStatus
  redeemedDate: string | null
  amountCollected: number
  notes: string
  renewedFromId: number | null
  renewedToId: number | null
  renewedFromReceiptNo?: string
  renewedToReceiptNo?: string
  createdAt: string
  items: PledgeItem[]
  itemCount?: number
  totalNetWeight?: number
  /** Live payoff for an active loan in the list, including top-ups. */
  outstanding?: number
  topups: PledgeTopup[]
  payments: PledgePayment[]
  photos: PledgePhoto[]
}

export interface PledgeTopup {
  id: number
  pledgeId: number
  topupDate: string
  amount: number
  interestPct: number
  note: string
  createdAt: string
}

export interface PledgeTopupInput {
  pledgeId: number
  topupDate: string
  amount: number
  note?: string
  /** Admin-only override that lets the top-up push the loan above shop LTV. */
  allowAboveLtv?: boolean
}

export interface PledgeInput {
  customerId: number
  pledgeDate: string
  pledgeType?: string
  guardianName?: string
  customerAddress?: string
  assessedValue: number
  loanAmount: number
  charges?: number
  interestPct: number
  repaymentDueDate?: string | null
  notes?: string
  items: PledgeItemInput[]
  allowAboveLtv?: boolean
}

export interface PledgeUpdateInput extends PledgeInput {
  id: number
}

export interface PledgeRedeemInput {
  id: number
  redeemedDate: string
  amountCollected: number
  discount?: number
  mode?: PledgePaymentMode
}

export interface PledgeCollectInput {
  id: number
  collectedDate: string
  amount: number
  mode?: PledgePaymentMode
}

export interface PledgeForfeitInput {
  id: number
  forfeitedDate: string
}

export interface PledgeRenewInput {
  id: number
  renewDate: string
  mode?: PledgePaymentMode
  newLoanAmount?: number
  note?: string
  /** Admin-only override that lets the renewal push above shop LTV. */
  allowAboveLtv?: boolean
}

export type PledgeAuctionBuyerType = 'outside' | 'shop'

export interface PledgeAuction {
  id: number
  pledgeId: number
  noticeDate: string
  auctionDate: string | null
  buyerType: PledgeAuctionBuyerType | null
  buyerName: string
  saleAmount: number
  payoffAtAuction: number
  surplusAmount: number
  surplusPaidDate: string | null
  surplusMode: PledgePaymentMode | null
  shortfallAmount: number
  shortfallWrittenOff: boolean
  note: string
  /** Days of notice required before an auction (today's shop setting). */
  noticeDays: number
  /** Last date on which the auction may be recorded (noticeDate + noticeDays). */
  auctionEligibleDate: string
}

export interface PledgeAuctionNoticeInput {
  id: number
  noticeDate: string
}

export interface PledgeAuctionInput {
  id: number
  auctionDate: string
  buyerType: PledgeAuctionBuyerType
  buyerName?: string
  saleAmount: number
  writeOffShortfall?: boolean
  note?: string
}

export interface PledgeAuctionSurplusInput {
  id: number
  surplusPaidDate: string
  mode?: PledgePaymentMode
}

export interface PledgeShortfallInput {
  id: number
  collectedDate: string
  amount: number
  mode?: PledgePaymentMode
}

export type GoldSavingSchemeStatus = 'active' | 'inactive'
export type GoldSavingGoldRateSource = 'configured' | 'manual_allowed'
export type GoldSavingBonusType = 'none' | 'fixed_amount' | 'percentage' | 'additional_gold'
export type GoldSavingRedemptionType = 'gold' | 'jewellery' | 'configurable'
export type GoldSavingAccountStatus = 'active' | 'matured' | 'redeemed' | 'cancelled' | 'closed'
export type GoldSavingInstallmentStatus = 'upcoming' | 'due' | 'paid' | 'overdue' | 'waived'
export type GoldSavingPaymentStatus = 'posted' | 'reversed'
export type GoldSavingPaymentMode = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'other'
export type GoldSavingLedgerType = 'payment' | 'reversal' | 'bonus' | 'redemption' | 'correction' | 'refund'
export type GoldSavingCancelDeductionType = 'none' | 'percentage' | 'fixed'
export type GoldSavingLateFeeType = 'none' | 'fixed' | 'per_day'
export type GoldSavingRedemptionKind = 'gold' | 'jewellery' | 'invoice' | 'payout'
export type GoldSavingReportId =
  | 'daily-collections'
  | 'monthly-collections'
  | 'customer-ledger'
  | 'scheme-performance'
  | 'active-schemes'
  | 'matured-schemes'
  | 'overdue-installments'
  | 'overdue-aging'
  | 'cancelled-schemes'
  | 'gold-accumulation'
  | 'redemption-history'
  | 'outstanding-obligations'

export interface GoldSavingScheme {
  id: number
  name: string
  code: string
  description: string
  monthlyAmount: number
  durationMonths: number
  minInstallment: number | null
  maxInstallment: number | null
  purity: string
  goldRateSource: GoldSavingGoldRateSource
  goldRateUnit: string
  bonusType: GoldSavingBonusType
  bonusValue: number
  bonusEligibility: string
  allowLatePayments: boolean
  gracePeriodDays: number
  allowMissedInstallments: boolean
  allowEarlyClosure: boolean
  allowPartialRedemption: boolean
  allowMultipleAccounts: boolean
  redemptionType: GoldSavingRedemptionType
  makingChargeRules: string
  wastageRules: string
  availableFrom: string | null
  availableTo: string | null
  terms: string
  status: GoldSavingSchemeStatus
  cancelDeductionType: GoldSavingCancelDeductionType
  cancelDeductionValue: number
  lateFeeType: GoldSavingLateFeeType
  lateFeeValue: number
  createdAt: string
  updatedAt: string
}

export interface GoldSavingSchemeInput {
  name: string
  description?: string
  monthlyAmount: number
  durationMonths: number
  minInstallment?: number | null
  maxInstallment?: number | null
  purity: string
  goldRateSource: GoldSavingGoldRateSource
  bonusType: GoldSavingBonusType
  bonusValue?: number
  bonusEligibility?: string
  allowLatePayments?: boolean
  gracePeriodDays?: number
  allowMissedInstallments?: boolean
  allowEarlyClosure?: boolean
  allowPartialRedemption?: boolean
  allowMultipleAccounts?: boolean
  redemptionType: GoldSavingRedemptionType
  makingChargeRules?: string
  wastageRules?: string
  availableFrom?: string | null
  availableTo?: string | null
  terms?: string
  status?: GoldSavingSchemeStatus
  cancelDeductionType?: GoldSavingCancelDeductionType
  cancelDeductionValue?: number
  lateFeeType?: GoldSavingLateFeeType
  lateFeeValue?: number
}

export interface GoldSavingRefund {
  id: number
  accountId: number
  accountNo: string
  customerId: number
  customerName: string
  customerPhone: string
  schemeName: string
  durationMonths: number
  voucherNo: string
  refundDate: string
  totalPaid: number
  deduction: number
  refundAmount: number
  paymentMode: GoldSavingPaymentMode
  transactionRef: string
  goldForfeited: number
  reason: string
  createdAt: string
}

export interface GoldSavingCancelInput {
  reason: string
  refundDate?: string
  paymentMode?: GoldSavingPaymentMode
  transactionRef?: string
  deductionOverride?: number
}

export interface GoldSavingAccount {
  id: number
  accountNo: string
  customerId: number
  customerName: string
  customerPhone: string
  customerAddress: string
  schemeId: number
  schemeName: string
  schemeCode: string
  monthlyAmount: number
  durationMonths: number
  purity: string
  enrollmentDate: string
  firstInstallmentDate: string
  maturityDate: string
  preferredPaymentDay: number | null
  nomineeName: string
  nomineeRelationship: string
  nomineePhone: string
  termsAccepted: boolean
  status: GoldSavingAccountStatus
  closedAt: string | null
  paidInstallments: number
  pendingInstallments: number
  totalPaid: number
  goldAccumulated: number
  nextDueDate: string | null
  createdAt: string
}

export interface GoldSavingInitialPaymentInput {
  amount: number
  paymentDate: string
  paymentMode: GoldSavingPaymentMode
  transactionRef?: string
  goldRate?: number
  goldRateOverrideReason?: string
  acceptRateDate?: boolean
  remarks?: string
  idempotencyKey?: string
}

export interface GoldSavingAccountInput {
  customerId: number
  schemeId: number
  monthlyAmount?: number
  enrollmentDate: string
  firstInstallmentDate: string
  preferredPaymentDay?: number | null
  nomineeName?: string
  nomineeRelationship?: string
  nomineePhone?: string
  termsAccepted: boolean
  acceptRateDate?: boolean
  initialPayment?: GoldSavingInitialPaymentInput
}

export interface GoldSavingInstallment {
  id: number
  accountId: number
  installmentNo: number
  dueDate: string
  amount: number
  status: GoldSavingInstallmentStatus
  paidAt: string | null
}

export interface GoldSavingPayment {
  id: number
  accountId: number
  accountNo: string
  customerId: number
  customerName: string
  customerPhone: string
  schemeName: string
  durationMonths: number
  installmentId: number | null
  receiptNo: string
  installmentNo: number
  paymentDate: string
  dueDate: string
  amount: number
  lateFee: number
  discount: number
  totalReceived: number
  goldRate: number
  goldWeight: number
  goldRateSource: string
  goldRateOverrideReason: string
  purity: string
  paymentMode: GoldSavingPaymentMode
  transactionRef: string
  remarks: string
  status: GoldSavingPaymentStatus
  /** Shared by every payment written in one multi-installment collection. */
  batchNo: string
  /** Sibling payments of the same batch, present only when the batch has more than one row. */
  batchPayments?: GoldSavingPayment[]
  createdAt: string
  totalPaidToDate: number
  goldAccumulatedToDate: number
}

export interface GoldSavingPaymentInput {
  accountId: number
  installmentId?: number
  /** How many installments to collect in order, starting at `installmentId` or the next unpaid one. */
  installmentCount?: number
  paymentDate: string
  amount: number
  lateFee?: number
  discount?: number
  paymentMode: GoldSavingPaymentMode
  transactionRef?: string
  goldRate?: number
  goldRateOverrideReason?: string
  acceptRateDate?: boolean
  remarks?: string
  idempotencyKey?: string
}

/** Gold rate that applies on a requested date, with its effective date. */
export interface GoldSavingRate {
  rate: number
  effectiveDate: string
  /** True when a rate row exists exactly on the requested date. */
  matchesDate: boolean
  purity: string
}

export interface GoldSavingLedgerEntry {
  id: number
  accountId: number
  entryDate: string
  entryType: GoldSavingLedgerType
  paymentId: number | null
  redemptionId: number | null
  receiptNo: string
  installmentNo: number | null
  amount: number
  goldRate: number
  goldWeight: number
  cumulativeGold: number
  paymentMode: string
  paymentStatus: string
  txnRef: string
  notes: string
  createdAt: string
}

export interface GoldSavingRedemption {
  id: number
  accountId: number
  accountNo: string
  customerName: string
  receiptNo: string
  redemptionDate: string
  redemptionKind: GoldSavingRedemptionKind
  goldWeight: number
  bonusGoldWeight: number
  invoiceId: number | null
  invoiceNo: string
  makingCharges: number
  wastage: number
  taxes: number
  invoiceValue: number
  remainingGold: number
  closesAccount: boolean
  notes: string
  /** Payout valuation: rate applied, amount paid, mode and reference. */
  goldRate: number
  payoutAmount: number
  paymentMode: string
  transactionRef: string
  createdAt: string
}

export interface GoldSavingRedemptionInput {
  accountId: number
  redemptionDate: string
  redemptionKind: 'payout'
  goldWeight?: number
  paymentMode: GoldSavingPaymentMode
  transactionRef?: string
  acceptRateDate?: boolean
  notes?: string
}

export interface GoldSavingAuditLog {
  id: number
  entityType: string
  entityId: number
  action: string
  changedBy: number | null
  beforeJson: string
  afterJson: string
  createdAt: string
}

export interface GoldSavingAccountDetail {
  account: GoldSavingAccount
  scheme: GoldSavingScheme
  installments: GoldSavingInstallment[]
  payments: GoldSavingPayment[]
  ledger: GoldSavingLedgerEntry[]
  redemptions: GoldSavingRedemption[]
  refund: GoldSavingRefund | null
  audit: GoldSavingAuditLog[]
}

export interface GoldSavingDashboardChartPoint {
  key: string
  label: string
  amount: number
}

export interface GoldSavingAgingBucket {
  bucket: string
  count: number
  amount: number
}

export interface GoldSavingMaturityPipelineBucket {
  bucket: string
  count: number
  gold: number
}

export interface GoldSavingDashboard {
  activeSchemes: number
  enrolledCustomers: number
  todayCollections: number
  monthCollections: number
  monthTarget: number
  totalCollected: number
  totalGold: number
  upcomingMaturities: number
  overdueInstallments: number
  overdueAging: GoldSavingAgingBucket[]
  maturityPipeline: GoldSavingMaturityPipelineBucket[]
  monthlyChart: GoldSavingDashboardChartPoint[]
  schemeEnrollments: { schemeName: string; count: number }[]
  upcomingDues: GoldSavingAccount[]
  recentCollections: GoldSavingPayment[]
  recentEnrollments: GoldSavingAccount[]
  maturingAccounts: GoldSavingAccount[]
}

/** Due-soon rows stay "active"; only a past repayment date is "overdue". */
export type DashboardAttentionStatus = 'overdue' | 'active'

export interface DashboardAttentionRow {
  pledgeId: number
  receiptNo: string
  customerId: number
  customerName: string
  /** Principal: sanctioned loan plus later top-ups. */
  amount: number
  startDate: string
  dueDate: string
  status: DashboardAttentionStatus
}

export interface MainDashboard {
  totalCustomers: number
  newCustomersThisWeek: number
  activePledges: number
  newActivePledgesThisWeek: number
  todayPledges: number
  todayPledgesValue: number
  dueSoon: number
  overdue: number
  attention: DashboardAttentionRow[]
}

export interface DashboardSearchPledge {
  id: number
  receiptNo: string
  customerName: string
  status: PledgeStatus
}

export interface DashboardSearchResult {
  customers: Customer[]
  pledges: DashboardSearchPledge[]
}

export interface GoldSavingReportResult {
  id: GoldSavingReportId
  title: string
  generatedAt: string
  columns: string[]
  rows: Array<Record<string, string | number>>
}

export interface GoldSavingPassbook {
  account: GoldSavingAccount
  scheme: GoldSavingScheme
  rows: GoldSavingLedgerEntry[]
}
