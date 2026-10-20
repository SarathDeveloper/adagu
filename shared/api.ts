import type {
  AppInfo,
  AuthUser,
  BackupFile,
  BackupStatus,
  ChangePasswordInput,
  CreateUserInput,
  Customer,
  CustomerInput,
  DashboardSearchResult,
  MainDashboard,
  DueEntry,
  DueEntryInput,
  DueEntryUpdateInput,
  DuePaymentInput,
  DuesLedger,
  LoginInput,
  MetalRates,
  MetalRatesInput,
  PagedList,
  Pledge,
  PledgeCollectInput,
  PledgeForfeitInput,
  PledgeInput,
  PledgeListQuery,
  PledgePayment,
  PledgePayoff,
  PledgeRedeemInput,
  PledgeShortfallInput,
  PledgeTopup,
  PledgeTopupInput,
  PledgeUpdateInput,
  ResetPasswordInput,
  RecordCounts,
  ShopSettings,
  UpdatePermissionsInput,
  User,
  GoldSavingAccount,
  GoldSavingAccountDetail,
  GoldSavingAccountInput,
  GoldSavingAuditLog,
  GoldSavingCancelInput,
  GoldSavingDashboard,
  GoldSavingLedgerEntry,
  GoldSavingPassbook,
  GoldSavingPayment,
  GoldSavingPaymentInput,
  GoldSavingRedemption,
  GoldSavingRedemptionInput,
  GoldSavingRefund,
  GoldSavingReportId,
  GoldSavingReportResult,
  GoldSavingScheme,
  GoldSavingSchemeInput,
} from './types'
import type { ReportDefinition, ReportId, ReportLookups, ReportResult } from './reportsCatalog'

export interface JewelTrackerProApi {
  getVersion: () => Promise<AppInfo>
  login: (input: LoginInput) => Promise<AuthUser>
  logout: () => Promise<void>
  me: () => Promise<AuthUser>
  changePassword: (input: ChangePasswordInput) => Promise<AuthUser>
  listUsers: () => Promise<User[]>
  createUser: (input: CreateUserInput) => Promise<User>
  updateUserPermissions: (id: number, input: UpdatePermissionsInput) => Promise<User>
  resetUserPassword: (id: number, input: ResetPasswordInput) => Promise<User>
  deleteUser: (id: number) => Promise<void>
  exportDatabase: () => Promise<void>
  exportExcel: () => Promise<void>
  restoreDatabase: (file: File) => Promise<BackupStatus>
  getBackupStatus: () => Promise<BackupStatus>
  updateBackupSettings: (input: {
    frequency: BackupStatus['frequency']
    time: string
    offsiteDir?: string
  }) => Promise<BackupStatus>
  copyBackupOffsite: () => Promise<BackupStatus>
  listBackups: () => Promise<BackupFile[]>
  createBackup: () => Promise<BackupFile>
  restoreBackupByName: (name: string) => Promise<BackupStatus>
  deleteBackup: (name: string) => Promise<void>

  getDashboard: () => Promise<MainDashboard>
  searchDashboard: (q: string) => Promise<DashboardSearchResult>

  listCustomers: (search?: string) => Promise<Customer[]>
  getCustomer: (id: number) => Promise<Customer>
  createCustomer: (input: CustomerInput) => Promise<Customer>
  updateCustomer: (id: number, input: CustomerInput) => Promise<Customer>
  deleteCustomer: (id: number) => Promise<void>

  listDues: (search?: string) => Promise<DuesLedger>
  createDueEntry: (input: DueEntryInput) => Promise<DueEntry>
  updateDueEntry: (input: DueEntryUpdateInput) => Promise<DueEntry>
  deleteDueEntry: (id: number) => Promise<void>
  recordDuePayment: (input: DuePaymentInput) => Promise<DueEntry>
  markDuePaid: (id: number) => Promise<DueEntry>

  listPledges: (input?: PledgeListQuery) => Promise<PagedList<Pledge>>
  getNextPledgeReceiptNo: () => Promise<{ receiptNo: string }>
  getPledge: (id: number) => Promise<Pledge>
  createPledge: (input: PledgeInput) => Promise<Pledge>
  updatePledge: (input: PledgeUpdateInput) => Promise<Pledge>
  sanctionPledge: (id: number) => Promise<Pledge>
  redeemPledge: (input: PledgeRedeemInput) => Promise<Pledge>
  collectPledge: (input: PledgeCollectInput) => Promise<Pledge>
  forfeitPledge: (input: PledgeForfeitInput) => Promise<Pledge>
  listPledgeTopups: (id: number) => Promise<PledgeTopup[]>
  addPledgeTopup: (input: PledgeTopupInput) => Promise<Pledge>
  collectPledgeShortfall: (input: PledgeShortfallInput) => Promise<Pledge>
  undoLatestPledgePayment: (id: number) => Promise<Pledge>
  listPledgePayments: (id: number) => Promise<PledgePayment[]>
  getPledgePayoff: (id: number, date?: string) => Promise<PledgePayoff>

  getShopSettings: () => Promise<ShopSettings>
  getRecordCounts: () => Promise<RecordCounts>
  updateShopSettings: (input: ShopSettings) => Promise<ShopSettings>
  skipShopSetup: () => Promise<ShopSettings>
  uploadShopImage: (file: File) => Promise<{ path: string }>
  getLatestMetalRates: () => Promise<MetalRates | null>
  listMetalRates: (days?: number) => Promise<MetalRates[]>
  upsertMetalRates: (input: MetalRatesInput) => Promise<MetalRates>
  getReportCatalog: () => Promise<ReportDefinition[]>
  getReportLookups: () => Promise<ReportLookups>
  runReport: (
    id: ReportId,
    query: {
      from?: string
      to?: string
      customerId?: number
    },
  ) => Promise<ReportResult>

  listGsSchemes: () => Promise<GoldSavingScheme[]>
  getGsScheme: (id: number) => Promise<GoldSavingScheme>
  createGsScheme: (input: GoldSavingSchemeInput) => Promise<GoldSavingScheme>
  updateGsScheme: (id: number, input: GoldSavingSchemeInput) => Promise<GoldSavingScheme>
  listGsAccounts: (search?: string) => Promise<GoldSavingAccount[]>
  getGsAccount: (id: number) => Promise<GoldSavingAccountDetail>
  createGsAccount: (input: GoldSavingAccountInput) => Promise<GoldSavingAccountDetail>
  cancelGsAccount: (id: number, input: GoldSavingCancelInput) => Promise<GoldSavingAccountDetail>
  getGsRefund: (id: number) => Promise<GoldSavingRefund>
  collectGsPayment: (input: GoldSavingPaymentInput) => Promise<GoldSavingPayment>
  getGsPayment: (id: number) => Promise<GoldSavingPayment>
  reverseGsPayment: (id: number, reason: string) => Promise<GoldSavingPayment>
  waiveGsInstallment: (installmentId: number, reason: string) => Promise<GoldSavingAccountDetail>
  getGsLedger: (accountId: number, query?: { from?: string; to?: string }) => Promise<GoldSavingLedgerEntry[]>
  getGsPassbook: (accountId: number) => Promise<GoldSavingPassbook>
  getGsAudit: (accountId: number) => Promise<GoldSavingAuditLog[]>
  processGsRedemption: (input: GoldSavingRedemptionInput) => Promise<GoldSavingRedemption>
  listGsRedemptions: (accountId?: number) => Promise<GoldSavingRedemption[]>
  getGsDashboard: () => Promise<GoldSavingDashboard>
  runGsReport: (
    id: GoldSavingReportId,
    query?: { from?: string; to?: string; schemeId?: number; q?: string; customerId?: number },
  ) => Promise<GoldSavingReportResult>
}
