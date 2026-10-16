import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, IndianRupee, Pencil } from 'lucide-react'
import type {
  AdaguDueSummary,
  Customer,
  DuesLedger,
  GoldSavingAccount,
  PledgeStatus,
} from '@shared/types'
import { DataTable } from '../../components/DataTable'
import { FilterBar } from '../../components/FilterBar'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'
import { useToast } from '../../components/toastContext'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { api } from '../../lib/api'
import { CollectPaymentModal } from '../goldSavings/collections/CollectPaymentModal'
import { GsStatusBadge } from '../goldSavings/GsStatusBadge'
import { GOLD_SAVINGS_VISIBLE } from '../goldSavings/visibility'
import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { CustomerAdaguLoanActions } from './CustomerAdaguLoanActions'
import { CustomerFormModal, emptyCustomerInput } from './CustomerFormModal'
import { buildCustomerProfile, type CustomerAdaguRow } from './customerProfile'

type DetailTab = 'overview' | 'adagu' | 'gold-savings' | 'history'

const TABS: { value: DetailTab; label: string }[] = GOLD_SAVINGS_VISIBLE
  ? [
      { value: 'overview', label: 'Overview' },
      { value: 'adagu', label: 'Adagu' },
      { value: 'gold-savings', label: 'Gold Savings' },
      { value: 'history', label: 'History' },
    ]
  : [
      { value: 'overview', label: 'Overview' },
      { value: 'adagu', label: 'Adagu' },
      { value: 'history', label: 'History' },
    ]

function isActiveAdagu(row: CustomerAdaguRow) {
  return row.status === 'active' && row.remaining > 0
}

function isOpenGsAccount(account: GoldSavingAccount) {
  return account.status === 'active' || account.status === 'matured'
}

function adaguStatusOf(status: PledgeStatus): { tone: PledgeStatus; label: string } {
  if (status === 'redeemed') return { tone: 'redeemed', label: 'Redeemed' }
  if (status === 'renewed') return { tone: 'renewed', label: 'Renewed' }
  if (status === 'forfeited') return { tone: 'forfeited', label: 'Forfeited' }
  if (status === 'draft') return { tone: 'draft', label: 'Draft' }
  return { tone: 'active', label: 'Active' }
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <p className="settings-row">
      <strong>{label}</strong> {value.trim() ? value : '—'}
    </p>
  )
}

export function CustomerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [ledger, setLedger] = useState<DuesLedger>({ columns: [], totalOutstanding: 0 })
  const [gsAccounts, setGsAccounts] = useState<GoldSavingAccount[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<DetailTab>('overview')
  const [editing, setEditing] = useState(false)
  const [viewTarget, setViewTarget] = useState<AdaguDueSummary | null>(null)
  const [collectAccountId, setCollectAccountId] = useState<number | null>(null)
  const [printPaymentId, setPrintPaymentId] = useState<number | null>(null)

  const reloadLedger = useCallback(async () => {
    const dues = await api.listDues()
    setLedger(dues)
    return dues
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const customerId = Number(id)
        if (!Number.isInteger(customerId) || customerId <= 0) {
          throw new Error('Invalid customer')
        }
        const [next, dues, accounts] = await Promise.all([
          api.getCustomer(customerId),
          api.listDues(),
          GOLD_SAVINGS_VISIBLE ? api.listGsAccounts().catch(() => [] as GoldSavingAccount[]) : Promise.resolve([]),
        ])
        if (active) {
          setCustomer(next)
          setLedger(dues)
          setGsAccounts(accounts)
          setError(null)
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load customer')
      }
    })()
    return () => {
      active = false
    }
  }, [id])

  const summary = customer
    ? buildCustomerProfile(
        customer.id,
        ledger.columns.find((column) => column.customerId === customer.id),
        ledger.adaguDues ?? [],
        gsAccounts,
      )
    : null

  const adaguByPledgeId = useMemo(() => {
    const map = new Map<number, AdaguDueSummary>()
    if (!customer) return map
    for (const row of ledger.adaguDues ?? []) {
      if (row.customerId === customer.id) map.set(row.pledgeId, row)
    }
    return map
  }, [customer, ledger.adaguDues])

  const viewPayments = viewTarget
    ? (ledger.columns
        .find((column) => column.customerId === viewTarget.customerId)
        ?.entries.filter((entry) => entry.pledgeId === viewTarget.pledgeId && entry.kind === 'payment') ?? [])
    : []

  if (!customer || !summary) {
    if (error) {
      return (
        <div className="app-page">
          <div className="error-banner">{error}</div>
          <Link className="btn ghost" to="/customers">
            <ArrowLeft size={16} strokeWidth={2} aria-hidden />
            Customers
          </Link>
        </div>
      )
    }
    return (
      <div className="app-page">
        <LoadingState />
      </div>
    )
  }

  const activeLoans = summary.adagu.filter(isActiveAdagu)
  const historicalLoans = summary.adagu.filter((row) => !isActiveAdagu(row))
  const openSchemes = summary.schemes.filter(isOpenGsAccount)
  const closedSchemes = summary.schemes.filter((account) => !isOpenGsAccount(account))

  function openLoan(row: CustomerAdaguRow) {
    const detail = adaguByPledgeId.get(row.pledgeId)
    if (detail) setViewTarget(detail)
    else navigate(`/adagu/${row.pledgeId}`)
  }

  return (
    <div className="app-page app-page-fill">
      <PageHeader
        title={customer.name}
        subtitle={customer.phone || undefined}
        actions={
          <>
            <Link className="btn ghost" to="/customers">
              <ArrowLeft size={16} strokeWidth={2} aria-hidden />
              Customers
            </Link>
            <button type="button" className="btn secondary" onClick={() => setEditing(true)}>
              <Pencil size={16} strokeWidth={1.75} aria-hidden />
              Edit
            </button>
          </>
        }
      />

      {error ? <div className="error-banner">{error}</div> : null}

      <FilterBar value={tab} onChange={setTab} options={TABS} />

      <div className="customer-detail-stack">
        {tab === 'overview' ? (
          <>
            <div className="stat-card-grid">
              <StatCard label="Total Paid" value={formatCurrency(summary.totalPaid)} />
              <StatCard
                label="Outstanding"
                value={formatCurrency(summary.outstanding)}
                tone={summary.outstanding > 0 ? 'danger' : undefined}
              />
              <StatCard label="Active Adagu loans" value={summary.activeLoans} />
              <StatCard label="Interest due" value={formatCurrency(summary.interestDue)} />
            </div>
            <section className="card padded">
              <h2 className="settings-section-title">Customer Profile</h2>
              <ProfileField label="Name" value={customer.name} />
              <ProfileField label="Phone" value={customer.phone} />
              <ProfileField label="Address" value={customer.address} />
              <ProfileField label="Guardian" value={customer.guardianName} />
              <ProfileField label="Notes" value={customer.notes} />
              <ProfileField label="GSTIN" value={customer.gstin} />
              <ProfileField label="Aadhaar" value={customer.aadhaar} />
              <ProfileField label="PAN" value={customer.pan} />
              <ProfileField label="ID proof" value={customer.idProofType} />
              <ProfileField label="Created" value={formatDisplayDate(customer.createdAt)} />
            </section>
          </>
        ) : null}

        {tab === 'adagu' ? (
          <>
            <AdaguLoanTable
              title="Active Adagu loans"
              empty="No active Adagu loans."
              rows={activeLoans}
              onOpen={openLoan}
            />
            <AdaguLoanTable
              title="Historical Adagu loans"
              empty="No historical Adagu loans."
              rows={historicalLoans}
              onOpen={openLoan}
            />
          </>
        ) : null}

        {GOLD_SAVINGS_VISIBLE && tab === 'gold-savings' ? (
          <>
            <GsAccountTable
              title="Gold Savings accounts"
              empty="No Gold Savings accounts yet."
              rows={openSchemes}
              onCollect={(accountId) => setCollectAccountId(accountId)}
            />
            {closedSchemes.length > 0 ? (
              <GsAccountTable
                title="Closed accounts"
                empty="No closed accounts."
                rows={closedSchemes}
              />
            ) : null}
          </>
        ) : null}

        {tab === 'history' ? (
          <>
            <section className="card padded">
              <h2 className="settings-section-title">Payment History</h2>
              {summary.payments.length === 0 ? (
                <p className="muted">No payments recorded.</p>
              ) : (
                <div className="dues-detail-history">
                  <ul>
                    {summary.payments.map((payment) => (
                      <li key={payment.id}>
                        <span>{formatDisplayDate(payment.date)}</span>
                        <span className="num">− {formatCurrency(payment.amount)}</span>
                        {payment.reference ? <span>{payment.reference}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
            <section className="card padded">
              <h2 className="settings-section-title">Due History</h2>
              {summary.dues.length === 0 ? (
                <p className="muted">No due history.</p>
              ) : (
                <div className="dues-detail-history">
                  <ul>
                    {summary.dues.map((due) => (
                      <li key={due.id}>
                        <span>{formatDisplayDate(due.date)}</span>
                        <span className="num">{formatCurrency(due.amount)}</span>
                        {due.reference ? <span>{due.reference}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>

      <CustomerFormModal
        open={editing}
        editing={customer}
        initialValues={emptyCustomerInput}
        onClose={() => setEditing(false)}
        onSaved={(updated) => {
          showToast('Customer updated', 'success')
          setCustomer(updated)
        }}
        onError={(message) => setError(message)}
      />

      <CustomerAdaguLoanActions
        viewTarget={viewTarget}
        payments={viewPayments}
        onViewTargetChange={setViewTarget}
        onReload={reloadLedger}
        onError={setError}
      />

      {GOLD_SAVINGS_VISIBLE && collectAccountId ? (
        <CollectPaymentModal
          accountId={collectAccountId}
          onClose={() => setCollectAccountId(null)}
          onCollected={(paymentId) => {
            setCollectAccountId(null)
            setPrintPaymentId(paymentId)
            void api
              .listGsAccounts()
              .then(setGsAccounts)
              .catch(() => undefined)
          }}
        />
      ) : null}

      {GOLD_SAVINGS_VISIBLE && printPaymentId ? (
        <PrintPreviewModal
          title="Collection receipt"
          path={`/print/gs-batch-receipt/${printPaymentId}`}
          pdfFilename="gs-receipt.pdf"
          onClose={() => setPrintPaymentId(null)}
        />
      ) : null}
    </div>
  )
}

function AdaguLoanTable({
  title,
  empty,
  rows,
  onOpen,
}: {
  title: string
  empty: string
  rows: CustomerAdaguRow[]
  onOpen: (row: CustomerAdaguRow) => void
}) {
  return (
    <section>
      <h2 className="settings-section-title">{title}</h2>
      {rows.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <DataTable>
          <table>
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Date</th>
                <th className="num">Principal</th>
                <th className="num">Remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = adaguStatusOf(row.status)
                const viewPath = `/adagu/${row.pledgeId}`
                return (
                  <tr
                    key={row.pledgeId}
                    className="customers-list-row"
                    tabIndex={0}
                    onClick={() => onOpen(row)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onOpen(row)
                      }
                    }}
                  >
                    <td>
                      <Link
                        to={viewPath}
                        className="billing-bill-no"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {row.receiptNo}
                      </Link>
                    </td>
                    <td>{formatDisplayDate(row.pledgeDate)}</td>
                    <td className="num">{formatCurrency(row.principal)}</td>
                    <td className={`num ${row.remaining > 0 ? 'due-amount' : 'paid-amount'}`}>
                      {formatCurrency(row.remaining)}
                    </td>
                    <td>
                      <span className={`adagu-status adagu-status--${status.tone}`}>
                        <span className="adagu-status-dot" aria-hidden />
                        {status.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </DataTable>
      )}
    </section>
  )
}

function GsAccountTable({
  title,
  empty,
  rows,
  onCollect,
}: {
  title: string
  empty: string
  rows: GoldSavingAccount[]
  onCollect?: (accountId: number) => void
}) {
  const navigate = useNavigate()
  return (
    <section>
      <h2 className="settings-section-title">{title}</h2>
      {rows.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <DataTable>
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Scheme</th>
                <th className="num">Total paid</th>
                <th>Next due</th>
                <th>Status</th>
                {onCollect ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((account) => {
                const path = `/gold-savings/accounts/${account.id}`
                const canCollect = isOpenGsAccount(account)
                return (
                  <tr
                    key={account.id}
                    className="customers-list-row"
                    tabIndex={0}
                    onClick={() => navigate(path)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        navigate(path)
                      }
                    }}
                  >
                    <td>
                      <Link to={path} className="billing-bill-no" onClick={(event) => event.stopPropagation()}>
                        {account.accountNo}
                      </Link>
                    </td>
                    <td>{account.schemeName}</td>
                    <td className="num">{formatCurrency(account.totalPaid)}</td>
                    <td>{account.nextDueDate ? formatDisplayDate(account.nextDueDate) : '—'}</td>
                    <td>
                      <GsStatusBadge status={account.status} />
                    </td>
                    {onCollect ? (
                      <td onClick={(event) => event.stopPropagation()}>
                        {canCollect ? (
                          <button type="button" className="btn ghost" onClick={() => onCollect(account.id)}>
                            <IndianRupee size={16} />
                            Collect
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </DataTable>
      )}
    </section>
  )
}
