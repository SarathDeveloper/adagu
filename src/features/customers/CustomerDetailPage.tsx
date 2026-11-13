import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  FileText,
  IndianRupee,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Printer,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react'
import { localTodayIso } from '@shared/localDate'
import type {
  AdaguDueSummary,
  Customer,
  CustomerDocument,
  CustomerDocumentKind,
  CustomerNote,
  DuesLedger,
  GoldSavingAccount,
  PledgeStatus,
} from '@shared/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DataTable } from '../../components/DataTable'
import { LoadingState } from '../../components/LoadingState'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/toastContext'
import { formatCurrency, formatDisplayDate, formatDisplayDateTime, formatWeight } from '../../lib/format'
import { api } from '../../lib/api'
import { CollectPaymentModal } from '../goldSavings/collections/CollectPaymentModal'
import { GsStatusBadge } from '../goldSavings/GsStatusBadge'
import { GOLD_SAVINGS_VISIBLE } from '../goldSavings/visibility'
import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { printPreviewPaths } from '../print/printPreviewPaths'
import { CustomerAdaguLoanActions } from './CustomerAdaguLoanActions'
import {
  buildCustomerActivity,
  cityFromAddress,
  customerInitials,
  formatAadhaar,
  maskAadhaar,
  type CustomerActivityItem,
} from './customerActivity'
import { CustomerFormModal } from './CustomerFormModal'
import { emptyCustomerInput } from './customerFormDefaults'
import { buildCustomerProfile, type CustomerAdaguRow } from './customerProfile'

type DetailTab = 'overview' | 'adagu' | 'gold-savings' | 'history'

const RECENT_ACTIVITY_LIMIT = 5

function isActiveAdagu(row: { status: PledgeStatus; remaining: number }) {
  return row.status === 'active' && row.remaining > 0
}

function isOpenGsAccount(account: GoldSavingAccount) {
  return account.status === 'active' || account.status === 'matured'
}

function adaguStatusOf(status: PledgeStatus): { tone: PledgeStatus; label: string } {
  if (status === 'redeemed') return { tone: 'redeemed', label: 'Released' }
  if (status === 'renewed') return { tone: 'renewed', label: 'Renewed' }
  if (status === 'forfeited') return { tone: 'forfeited', label: 'Forfeited' }
  if (status === 'draft') return { tone: 'draft', label: 'Draft' }
  return { tone: 'active', label: 'Active' }
}

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

function formatPct(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0+$/, '')}%`
}

export function CustomerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [ledger, setLedger] = useState<DuesLedger>({ columns: [], totalOutstanding: 0 })
  const [gsAccounts, setGsAccounts] = useState<GoldSavingAccount[]>([])
  const [documents, setDocuments] = useState<CustomerDocument[]>([])
  const [notes, setNotes] = useState<CustomerNote[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<DetailTab>('overview')
  const [editing, setEditing] = useState(false)
  const [viewTarget, setViewTarget] = useState<AdaguDueSummary | null>(null)
  const [collectRequest, setCollectRequest] = useState<AdaguDueSummary | null>(null)
  const [printPledgeId, setPrintPledgeId] = useState<number | null>(null)
  const [collectAccountId, setCollectAccountId] = useState<number | null>(null)
  const [printPaymentId, setPrintPaymentId] = useState<number | null>(null)

  const customerId = Number(id)

  const reloadLedger = useCallback(async () => {
    const dues = await api.listDues()
    setLedger(dues)
    return dues
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (!Number.isInteger(customerId) || customerId <= 0) {
          throw new Error('Invalid customer')
        }
        const [next, dues, accounts, docs, noteList] = await Promise.all([
          api.getCustomer(customerId),
          api.listDues(),
          GOLD_SAVINGS_VISIBLE ? api.listGsAccounts().catch(() => [] as GoldSavingAccount[]) : Promise.resolve([]),
          api.listCustomerDocuments(customerId),
          api.listCustomerNotes(customerId),
        ])
        if (active) {
          setCustomer(next)
          setLedger(dues)
          setGsAccounts(accounts)
          setDocuments(docs)
          setNotes(noteList)
          setError(null)
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load customer')
      }
    })()
    return () => {
      active = false
    }
  }, [customerId])

  const summary = customer
    ? buildCustomerProfile(
        customer.id,
        ledger.columns.find((column) => column.customerId === customer.id),
        ledger.adaguDues ?? [],
        gsAccounts,
      )
    : null

  const loans = useMemo(
    () =>
      customer
        ? (ledger.adaguDues ?? [])
            .filter((row) => row.customerId === customer.id)
            .sort((a, b) =>
              a.pledgeDate !== b.pledgeDate ? (a.pledgeDate < b.pledgeDate ? 1 : -1) : b.pledgeId - a.pledgeId,
            )
        : [],
    [customer, ledger.adaguDues],
  )

  const activity = useMemo(
    () =>
      customer && summary
        ? buildCustomerActivity({
            customerCreatedAt: customer.createdAt,
            loans,
            payments: summary.payments,
            notes,
            documents,
          })
        : [],
    // `summary` is rebuilt every render; its payments follow the ledger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customer, loans, ledger, notes, documents],
  )

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

  const activeLoans = loans.filter(isActiveAdagu)
  const activeLoanRows = summary.adagu.filter(isActiveAdagu)
  const historicalLoanRows = summary.adagu.filter((row) => !isActiveAdagu(row))
  const openSchemes = summary.schemes.filter(isOpenGsAccount)
  const closedSchemes = summary.schemes.filter((account) => !isOpenGsAccount(account))

  const principalOutstanding = activeLoans.reduce((sum, row) => sum + row.principalOutstanding, 0)
  const goldPledged = activeLoans.reduce((sum, row) => sum + (row.goldWeight ?? 0), 0)
  const itemsPledged = activeLoans.reduce((sum, row) => sum + (row.itemCount ?? 0), 0)
  const interestRates = [...new Set(activeLoans.map((row) => row.interestPct))]

  const tabs: { value: DetailTab; label: string; count?: number }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'adagu', label: 'Adagu', count: summary.adagu.length },
    ...(GOLD_SAVINGS_VISIBLE
      ? [{ value: 'gold-savings' as const, label: 'Gold Savings', count: summary.schemes.length }]
      : []),
    { value: 'history', label: 'History' },
  ]

  function openLoan(row: CustomerAdaguRow) {
    const detail = loans.find((loan) => loan.pledgeId === row.pledgeId)
    if (detail) setViewTarget(detail)
    else navigate(`/adagu/${row.pledgeId}`)
  }

  async function copyPhone() {
    if (!customer?.phone) return
    try {
      await navigator.clipboard.writeText(customer.phone)
      showToast(`Copied ${customer.phone}`, 'success')
    } catch {
      showToast('Could not copy the number', 'error')
    }
  }

  async function uploadDocument(kind: CustomerDocumentKind, file: File) {
    try {
      const created = await api.uploadCustomerDocument(customerId, kind, file)
      setDocuments((current) => [...current.filter((doc) => kind !== 'photo' || doc.kind !== 'photo'), created])
      showToast(kind === 'photo' ? 'Photo updated' : 'Scan uploaded', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed', 'error')
    }
  }

  async function removeDocument(document: CustomerDocument) {
    try {
      await api.deleteCustomerDocument(customerId, document.id)
      setDocuments((current) => current.filter((doc) => doc.id !== document.id))
      showToast('File removed', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not remove the file', 'error')
    }
  }

  async function addNote(body: string) {
    const created = await api.addCustomerNote(customerId, body)
    setNotes((current) => [created, ...current])
    showToast('Note added', 'success')
  }

  async function removeNote(note: CustomerNote) {
    try {
      await api.deleteCustomerNote(customerId, note.id)
      setNotes((current) => current.filter((item) => item.id !== note.id))
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete the note', 'error')
    }
  }

  const photo = documents.find((doc) => doc.kind === 'photo') ?? null
  const city = cityFromAddress(customer.address)

  return (
    <div className="app-page customer-profile">
      <Link className="customer-profile-back" to="/customers">
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        Customers
      </Link>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="card customer-hero">
        <AvatarUpload
          name={customer.name}
          photo={photo}
          onPick={(file) => void uploadDocument('photo', file)}
        />
        <div className="customer-hero-main">
          <div className="customer-hero-title">
            <h1>{customer.name}</h1>
            {activeLoans.length > 0 ? (
              <span className="customer-pill customer-pill--brand">
                <span className="customer-pill-dot" aria-hidden />
                {plural(activeLoans.length, 'active loan')}
              </span>
            ) : null}
          </div>
          <div className="customer-hero-meta">
            {customer.phone ? (
              <span>
                <Phone size={14} aria-hidden />
                {customer.phone}
              </span>
            ) : null}
            {city ? (
              <span>
                <MapPin size={14} aria-hidden />
                {city}
              </span>
            ) : null}
            <span>
              <CalendarDays size={14} aria-hidden />
              Customer since {formatDisplayDate(customer.createdAt)}
            </span>
          </div>
        </div>
        <div className="customer-hero-actions">
          {customer.phone ? (
            <button type="button" className="btn secondary" onClick={() => void copyPhone()} title="Copy mobile number">
              <Phone size={16} strokeWidth={1.75} aria-hidden />
              Call
            </button>
          ) : null}
          <button type="button" className="btn secondary" onClick={() => setEditing(true)}>
            <Pencil size={16} strokeWidth={1.75} aria-hidden />
            Edit
          </button>
          <Link className="btn" to={`/adagu/new?customer=${customer.id}`}>
            <Plus size={16} strokeWidth={2} aria-hidden />
            New Adagu
          </Link>
        </div>
      </section>

      <div className="customer-tabs" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            className={`customer-tab${tab === item.value ? ' active' : ''}`}
            onClick={() => setTab(item.value)}
          >
            {item.label}
            {item.count !== undefined ? <span className="customer-tab-count">({item.count})</span> : null}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <>
          <div className="customer-stats">
            <StatTile
              label="Outstanding"
              tone={summary.outstanding > 0 ? 'danger' : undefined}
              value={formatCurrency(summary.outstanding)}
              hint={
                activeLoans.length > 0
                  ? `${formatCurrency(principalOutstanding)} principal + ${formatCurrency(summary.interestDue)} interest`
                  : 'Nothing owed'
              }
            />
            <StatTile
              label="Interest due"
              value={formatCurrency(summary.interestDue)}
              hint={
                activeLoans.length === 0
                  ? 'No active loans'
                  : activeLoans.length === 1
                    ? `At ${formatPct(activeLoans[0].interestPct)} / month on ${activeLoans[0].receiptNo}`
                    : interestRates.length === 1
                      ? `At ${formatPct(interestRates[0])} / month on ${activeLoans.length} loans`
                      : `Across ${activeLoans.length} loans`
              }
            />
            <StatTile
              label="Total paid"
              tone={summary.totalPaid > 0 ? 'success' : undefined}
              value={formatCurrency(summary.totalPaid)}
              hint="Across all receipts"
            />
            <StatTile
              label="Gold pledged"
              value={formatWeight(goldPledged, 3)}
              hint={`${plural(activeLoans.length, 'active Adagu loan')} · ${plural(itemsPledged, 'item')}`}
            />
          </div>

          <div className="customer-overview">
            <div className="customer-overview-main">
              <ProfileCard title="Personal & contact" action={<CardLink onClick={() => setEditing(true)}>Edit</CardLink>}>
                <dl className="customer-fields">
                  <Field label="Full name" value={customer.name} />
                  <Field label="Guardian" value={customer.guardianName} />
                  <Field label="Mobile" value={customer.phone} />
                  <Field label="Customer since" value={formatDisplayDate(customer.createdAt)} />
                  <Field label="Address" value={customer.address} wide />
                </dl>
              </ProfileCard>

              <KycCard
                customer={customer}
                documents={documents}
                onUpload={(kind, file) => void uploadDocument(kind, file)}
                onRemove={(document) => void removeDocument(document)}
              />

              <NotesCard notes={notes} onAdd={addNote} onRemove={(note) => void removeNote(note)} />
            </div>

            <aside className="customer-overview-side">
              <ProfileCard
                title="Active Adagu"
                action={summary.adagu.length > 0 ? <CardLink onClick={() => setTab('adagu')}>View all</CardLink> : null}
              >
                {activeLoans.length === 0 ? (
                  <div className="customer-empty">
                    <p>No active Adagu loans.</p>
                    <Link className="btn secondary" to={`/adagu/new?customer=${customer.id}`}>
                      <Plus size={16} aria-hidden />
                      New Adagu
                    </Link>
                  </div>
                ) : (
                  activeLoans.map((loan) => (
                    <ActiveLoanCard
                      key={loan.pledgeId}
                      loan={loan}
                      onOpen={() => setViewTarget(loan)}
                      onCollect={() => setCollectRequest({ ...loan })}
                      onPrint={() => setPrintPledgeId(loan.pledgeId)}
                    />
                  ))
                )}
              </ProfileCard>

              <ProfileCard title="Recent activity" action={<CardLink onClick={() => setTab('history')}>Full history</CardLink>}>
                <ActivityList items={activity.slice(0, RECENT_ACTIVITY_LIMIT)} />
              </ProfileCard>
            </aside>
          </div>
        </>
      ) : null}

      {tab === 'adagu' ? (
        <div className="customer-detail-stack">
          <AdaguLoanTable
            title="Active Adagu loans"
            empty="No active Adagu loans."
            rows={activeLoanRows}
            onOpen={openLoan}
          />
          <AdaguLoanTable
            title="Historical Adagu loans"
            empty="No historical Adagu loans."
            rows={historicalLoanRows}
            onOpen={openLoan}
          />
        </div>
      ) : null}

      {GOLD_SAVINGS_VISIBLE && tab === 'gold-savings' ? (
        <div className="customer-detail-stack">
          <GsAccountTable
            title="Gold Savings accounts"
            empty="No Gold Savings accounts yet."
            rows={openSchemes}
            onCollect={(accountId) => setCollectAccountId(accountId)}
          />
          {closedSchemes.length > 0 ? (
            <GsAccountTable title="Closed accounts" empty="No closed accounts." rows={closedSchemes} />
          ) : null}
        </div>
      ) : null}

      {tab === 'history' ? (
        <div className="customer-history">
          <ProfileCard title="Activity">
            <ActivityList items={activity} />
          </ProfileCard>
          <div className="customer-history-side">
            <ProfileCard title="Payment history">
              {summary.payments.length === 0 ? (
                <p className="customer-muted">No payments recorded.</p>
              ) : (
                <ul className="customer-ledger">
                  {summary.payments.map((payment) => (
                    <li key={payment.id}>
                      <span>{formatDisplayDate(payment.date)}</span>
                      <span className="customer-ledger-ref">{payment.reference ?? '—'}</span>
                      <span className="num paid-amount">− {formatCurrency(payment.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ProfileCard>
            <ProfileCard title="Due history">
              {summary.dues.length === 0 ? (
                <p className="customer-muted">No due history.</p>
              ) : (
                <ul className="customer-ledger">
                  {summary.dues.map((due) => (
                    <li key={due.id}>
                      <span>{formatDisplayDate(due.date)}</span>
                      <span className="customer-ledger-ref">{due.reference ?? '—'}</span>
                      <span className="num">{formatCurrency(due.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ProfileCard>
          </div>
        </div>
      ) : null}

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
        collectRequest={collectRequest}
      />

      {printPledgeId ? (
        <PrintPreviewModal
          title="Adagu receipt"
          path={printPreviewPaths.pledge(printPledgeId)}
          pdfFilename="adagu-receipt.pdf"
          onClose={() => setPrintPledgeId(null)}
        />
      ) : null}

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

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint: string
  tone?: 'danger' | 'success'
}) {
  return (
    <div className="card customer-stat">
      <span className="customer-stat-label">{label}</span>
      <span className={`customer-stat-value${tone ? ` tone-${tone}` : ''}`}>{value}</span>
      <span className="customer-stat-hint">{hint}</span>
    </div>
  )
}

function ProfileCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card customer-card">
      <header className="customer-card-head">
        <h2>{title}</h2>
        {action}
      </header>
      <div className="customer-card-body">{children}</div>
    </section>
  )
}

function CardLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="customer-card-link" onClick={onClick}>
      {children}
    </button>
  )
}

function Field({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  const empty = typeof value === 'string' && !value.trim()
  return (
    <div className={`customer-field${wide ? ' wide' : ''}`}>
      <dt>{label}</dt>
      <dd className={empty ? 'customer-muted' : undefined}>{empty ? 'Not provided' : value}</dd>
    </div>
  )
}

function AvatarUpload({
  name,
  photo,
  onPick,
}: {
  name: string
  photo: CustomerDocument | null
  onPick: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="customer-avatar">
      {photo ? (
        <img src={photo.path} alt={`${name}'s photo`} />
      ) : (
        <span className="customer-avatar-initials" aria-hidden>
          {customerInitials(name)}
        </span>
      )}
      <button
        type="button"
        className="customer-avatar-camera"
        onClick={() => inputRef.current?.click()}
        aria-label={photo ? 'Change photo' : 'Add photo'}
        title={photo ? 'Change photo' : 'Add photo'}
      >
        <Camera size={14} strokeWidth={2} aria-hidden />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onPick(file)
        }}
      />
    </div>
  )
}

function KycCard({
  customer,
  documents,
  onUpload,
  onRemove,
}: {
  customer: Customer
  documents: CustomerDocument[]
  onUpload: (kind: CustomerDocumentKind, file: File) => void
  onRemove: (document: CustomerDocument) => void
}) {
  const [showAadhaar, setShowAadhaar] = useState(false)
  return (
    <ProfileCard title="KYC & identity">
      <dl className="customer-fields">
        <Field
          label="Aadhaar"
          value={
            customer.aadhaar ? (
              <span className="customer-aadhaar">
                <span className="num">{showAadhaar ? formatAadhaar(customer.aadhaar) : maskAadhaar(customer.aadhaar)}</span>
                <button type="button" className="customer-chip-btn" onClick={() => setShowAadhaar((value) => !value)}>
                  {showAadhaar ? 'Hide' : 'Show'}
                </button>
              </span>
            ) : (
              ''
            )
          }
        />
        <Field label="PAN" value={customer.pan} />
        <Field label="GSTIN" value={customer.gstin} />
      </dl>
      <div className="customer-doc-grid">
        <DocumentTile
          kind="aadhaar"
          title="Aadhaar scan"
          hint="Upload front & back"
          documents={documents.filter((doc) => doc.kind === 'aadhaar')}
          onUpload={(file) => onUpload('aadhaar', file)}
          onRemove={onRemove}
        />
        <DocumentTile
          kind="pan"
          title="PAN card scan"
          hint="Upload image or PDF"
          documents={documents.filter((doc) => doc.kind === 'pan')}
          onUpload={(file) => onUpload('pan', file)}
          onRemove={onRemove}
        />
      </div>
    </ProfileCard>
  )
}

const MAX_SCANS_PER_KIND = 2

function DocumentTile({
  kind,
  title,
  hint,
  documents,
  onUpload,
  onRemove,
}: {
  kind: CustomerDocumentKind
  title: string
  hint: string
  documents: CustomerDocument[]
  onUpload: (file: File) => void
  onRemove: (document: CustomerDocument) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [viewing, setViewing] = useState<CustomerDocument | null>(null)
  const [removing, setRemoving] = useState<CustomerDocument | null>(null)
  const canAdd = documents.length < MAX_SCANS_PER_KIND
  const sideLabel = (index: number) => (documents.length > 1 ? (index === 0 ? 'Front' : 'Back') : 'Scan')

  return (
    <div className={`customer-doc${documents.length > 0 ? ' has-files' : ''}`}>
      {documents.length === 0 ? (
        <button type="button" className="customer-doc-empty" onClick={() => inputRef.current?.click()}>
          <span className="customer-doc-icon" aria-hidden>
            <Upload size={16} strokeWidth={2} />
          </span>
          <span>
            <strong>{title}</strong>
            <small>{hint}</small>
          </span>
        </button>
      ) : (
        <>
          <div className="customer-doc-head">
            <strong>{title}</strong>
            {canAdd ? (
              <button type="button" className="customer-card-link" onClick={() => inputRef.current?.click()}>
                <Plus size={14} aria-hidden />
                {kind === 'aadhaar' ? 'Add back' : 'Add'}
              </button>
            ) : null}
          </div>
          <div className="customer-doc-files">
            {documents.map((document, index) => (
              <div key={document.id} className="customer-doc-file">
                <button
                  type="button"
                  className="customer-doc-thumb"
                  onClick={() => setViewing(document)}
                  aria-label={`View ${title} ${sideLabel(index).toLowerCase()}`}
                >
                  {document.mimeType === 'application/pdf' ? (
                    <FileText size={22} strokeWidth={1.5} aria-hidden />
                  ) : (
                    <img src={document.path} alt="" />
                  )}
                </button>
                <span className="customer-doc-file-label">{sideLabel(index)}</span>
                <button
                  type="button"
                  className="customer-doc-remove"
                  onClick={() => setRemoving(document)}
                  aria-label={`Remove ${title} ${sideLabel(index).toLowerCase()}`}
                  title="Remove"
                >
                  <X size={12} strokeWidth={2.5} aria-hidden />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,application/pdf"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onUpload(file)
        }}
      />
      {viewing ? (
        <Modal title={title} onClose={() => setViewing(null)} className="customer-doc-viewer">
          {viewing.mimeType === 'application/pdf' ? (
            <iframe src={viewing.path} title={title} />
          ) : (
            <img src={viewing.path} alt={title} />
          )}
        </Modal>
      ) : null}
      {removing ? (
        <ConfirmDialog
          title={`Remove ${title.toLowerCase()}?`}
          message="The file is deleted from this computer. Backups taken earlier still have it."
          confirmLabel="Remove"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            onRemove(removing)
            setRemoving(null)
          }}
        />
      ) : null}
    </div>
  )
}

function NotesCard({
  notes,
  onAdd,
  onRemove,
}: {
  notes: CustomerNote[]
  onAdd: (body: string) => Promise<void>
  onRemove: (note: CustomerNote) => void
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<CustomerNote | null>(null)

  async function save() {
    const body = draft.trim()
    if (!body) return
    try {
      setSaving(true)
      setFormError(null)
      await onAdd(body)
      setDraft('')
      setAdding(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the note')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ProfileCard title="Notes" action={adding ? null : <CardLink onClick={() => setAdding(true)}>Add note</CardLink>}>
      {adding ? (
        <form
          className="customer-note-form"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <textarea
            className="textarea"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                void save()
              }
              if (event.key === 'Escape') {
                event.stopPropagation()
                setAdding(false)
              }
            }}
            rows={3}
            maxLength={1000}
            placeholder="Write a note about this customer"
            aria-label="New note"
            autoFocus
          />
          {formError ? <p className="customer-note-error">{formError}</p> : null}
          <div className="customer-note-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setAdding(false)
                setDraft('')
                setFormError(null)
              }}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn" disabled={saving || !draft.trim()}>
              {saving ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </form>
      ) : null}
      {notes.length === 0 && !adding ? <p className="customer-muted">No notes yet.</p> : null}
      {notes.length > 0 ? (
        <ul className="customer-notes">
          {notes.map((note) => (
            <li key={note.id}>
              <p>{note.body}</p>
              <div className="customer-note-meta">
                <span>
                  {formatDisplayDateTime(note.createdAt)}
                  {note.createdBy ? ` · ${note.createdBy}` : ''}
                </span>
                <button
                  type="button"
                  className="customer-note-delete"
                  onClick={() => setRemoving(note)}
                  aria-label="Delete note"
                  title="Delete note"
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {removing ? (
        <ConfirmDialog
          title="Delete note?"
          message="This note will be removed from the customer's profile."
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            onRemove(removing)
            setRemoving(null)
          }}
        />
      ) : null}
    </ProfileCard>
  )
}

function ActiveLoanCard({
  loan,
  onOpen,
  onCollect,
  onPrint,
}: {
  loan: AdaguDueSummary
  onOpen: () => void
  onCollect: () => void
  onPrint: () => void
}) {
  const today = localTodayIso()
  const dueDate = loan.repaymentDueDate ?? null
  const totalDays = dueDate ? Math.max(1, daysBetween(loan.pledgeDate, dueDate)) : 0
  const daysLeft = dueDate ? daysBetween(today, dueDate) : 0
  const elapsed = dueDate ? Math.min(1, Math.max(0, daysBetween(loan.pledgeDate, today) / totalDays)) : 0
  const overdue = dueDate !== null && daysLeft < 0

  return (
    <div className="customer-loan">
      <div className="customer-loan-head">
        <div>
          <button type="button" className="customer-loan-no" onClick={onOpen}>
            {loan.receiptNo}
          </button>
          <span className="customer-loan-sub">Opened {formatDisplayDate(loan.pledgeDate)}</span>
        </div>
        <span className={`customer-pill ${loan.isInterestOverdue ? 'customer-pill--warning' : 'customer-pill--brand'}`}>
          <span className="customer-pill-dot" aria-hidden />
          {loan.isInterestOverdue ? 'Interest due' : 'Active'}
        </span>
      </div>
      <div className="customer-loan-figures">
        <div>
          <span>Gold</span>
          <strong>{formatWeight(loan.goldWeight ?? 0, 3)}</strong>
        </div>
        <div>
          <span>Loan</span>
          <strong>{formatCurrency(loan.principalOutstanding)}</strong>
        </div>
        <div>
          <span>Balance</span>
          <strong>{formatCurrency(loan.remaining)}</strong>
        </div>
      </div>
      {dueDate ? (
        <div className="customer-loan-due">
          <div className="customer-loan-due-row">
            <span>Due {formatDisplayDate(dueDate)}</span>
            <span className={overdue ? 'tone-danger' : undefined}>
              {overdue ? `${plural(-daysLeft, 'day')} overdue` : `${plural(daysLeft, 'day')} left`}
            </span>
          </div>
          <div
            className={`customer-loan-bar${overdue ? ' overdue' : ''}`}
            role="progressbar"
            aria-label="Loan term elapsed"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(elapsed * 100)}
          >
            <span style={{ width: `${Math.max(elapsed * 100, 1.5)}%` }} />
          </div>
        </div>
      ) : null}
      <p className="customer-loan-rate">
        Interest {formatPct(loan.interestPct)} / month
        {loan.interestDue > 0 ? ` · ${formatCurrency(loan.interestDue)} due` : ''}
      </p>
      <div className="customer-loan-actions">
        <button type="button" className="btn customer-loan-collect" onClick={onCollect}>
          <IndianRupee size={15} strokeWidth={2} aria-hidden />
          Collect payment
        </button>
        <button type="button" className="btn secondary customer-icon-btn" onClick={onPrint} aria-label="Print receipt" title="Print receipt">
          <Printer size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </div>
  )
}

const ACTIVITY_ICONS: Record<CustomerActivityItem['kind'], ReactNode> = {
  adagu: <Plus size={14} strokeWidth={2} />,
  payment: <IndianRupee size={14} strokeWidth={2} />,
  note: <Pencil size={13} strokeWidth={2} />,
  document: <FileText size={13} strokeWidth={2} />,
  profile: <User size={14} strokeWidth={2} />,
}

function ActivityList({ items }: { items: CustomerActivityItem[] }) {
  if (items.length === 0) return <p className="customer-muted">No activity yet.</p>
  return (
    <ul className="customer-activity">
      {items.map((item) => (
        <li key={item.key}>
          <span className={`customer-activity-icon kind-${item.kind}`} aria-hidden>
            {ACTIVITY_ICONS[item.kind]}
          </span>
          <div>
            <strong>{item.title}</strong>
            <span>
              {item.detail ? `${item.detail} · ` : ''}
              {formatDisplayDate(item.date)}
            </span>
          </div>
        </li>
      ))}
    </ul>
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
                      <Link to={viewPath} className="billing-bill-no" onClick={(event) => event.stopPropagation()}>
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
