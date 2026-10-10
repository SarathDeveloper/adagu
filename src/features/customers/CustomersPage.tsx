import { useEffect, useMemo, useRef, useState } from 'react'
import { IndianRupee, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Customer, DuesLedger, GoldSavingAccount } from '@shared/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DataTable, TablePager } from '../../components/DataTable'
import { Drawer } from '../../components/Drawer'
import { EmptyState } from '../../components/EmptyState'
import { LoadingState } from '../../components/LoadingState'
import { Modal } from '../../components/Modal'
import { CustomerFormModal, emptyCustomerInput } from './CustomerFormModal'
import { PageHeader } from '../../components/PageHeader'
import { SearchBar } from '../../components/SearchBar'
import { StatCard } from '../../components/StatCard'
import { useToast } from '../../components/toastContext'
import { formatCurrency, formatDisplayDate, paginate, TABLE_PAGE_SIZE } from '../../lib/format'
import { api } from '../../lib/api'
import { CollectPaymentModal } from '../goldSavings/collections/CollectPaymentModal'
import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { buildCustomerProfile } from './customerProfile'
import { monthRange } from '../../lib/dateRange'

export function CustomersPage() {
  const { showToast } = useToast()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [ledger, setLedger] = useState<DuesLedger>({ columns: [], totalOutstanding: 0 })
  const [search, setSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const hasLoadedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [open, setOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [profile, setProfile] = useState<Customer | null>(null)
  const [page, setPage] = useState(1)
  const [gsAccounts, setGsAccounts] = useState<GoldSavingAccount[]>([])
  const [collectAccountId, setCollectAccountId] = useState<number | null>(null)
  const [pickAccounts, setPickAccounts] = useState<GoldSavingAccount[] | null>(null)
  const [printPaymentId, setPrintPaymentId] = useState<number | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (active) {
          setError(null)
          if (hasLoadedRef.current) setRefreshing(true)
          else setLoading(true)
        }
        const [customerList, dues] = await Promise.all([
          api.listCustomers(searchQuery),
          api.listDues(),
        ])
        if (active) {
          setCustomers(customerList)
          setLedger(dues)
          hasLoadedRef.current = true
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load customers')
        }
      } finally {
        if (active) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [searchQuery])

  // The scheme accounts power the "Collect scheme" row action. A user without
  // the gold savings feature gets a rejected request, which just hides it.
  useEffect(() => {
    let active = true
    void api
      .listGsAccounts()
      .then((rows) => {
        if (active) setGsAccounts(rows)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const gsAccountsByCustomer = useMemo(() => {
    const map = new Map<number, GoldSavingAccount[]>()
    for (const account of gsAccounts) {
      if (account.status !== 'active' && account.status !== 'matured') continue
      const list = map.get(account.customerId) ?? []
      list.push(account)
      map.set(account.customerId, list)
    }
    return map
  }, [gsAccounts])

  const dueByCustomer = useMemo(() => {
    const map = new Map<number, number>()
    for (const column of ledger.columns) {
      map.set(column.customerId, column.balance)
    }
    return map
  }, [ledger])

  // Most recent Adagu activity per customer (the last pledge date).
  const lastActivityByCustomer = useMemo(() => {
    const map = new Map<number, string>()
    for (const row of ledger.adaguDues ?? []) {
      const current = map.get(row.customerId)
      if (!current || row.pledgeDate > current) {
        map.set(row.customerId, row.pledgeDate)
      }
    }
    return map
  }, [ledger])

  const today = new Date().toISOString().slice(0, 10)
  const thisMonth = monthRange(today)
  const listedCustomers = customers
  const withDues = ledger.columns.filter((column) => column.balance > 0).length
  const newThisMonth = listedCustomers.filter((customer) => {
    const created = customer.createdAt.slice(0, 10)
    return created >= thisMonth.from && created <= thisMonth.to
  }).length

  const paged = useMemo(() => paginate(listedCustomers, page, TABLE_PAGE_SIZE), [listedCustomers, page])

  async function load() {
    try {
      setError(null)
      const [customerList, dues] = await Promise.all([api.listCustomers(search), api.listDues()])
      setCustomers(customerList)
      setLedger(dues)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customers')
    }
  }

  function openCreate() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(customer: Customer) {
    setEditing(customer)
    setOpen(true)
  }

  async function remove(id: number) {
    try {
      await api.deleteCustomer(id)
      setDeleteId(null)
      showToast('Customer deleted', 'success')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete customer')
    }
  }

  const profileSummary = profile
    ? buildCustomerProfile(
        profile.id,
        ledger.columns.find((column) => column.customerId === profile.id),
        ledger.adaguDues ?? [],
        gsAccounts,
      )
    : null

  return (
    <div className="app-page app-page-fill">
      <PageHeader
        title="Customers"
        subtitle="Customer profiles, Adagu loans and Gold Savings accounts"
        actions={
          <>
            <SearchBar value={search} onChange={(value) => { setSearch(value); setPage(1) }} placeholder="Search name or phone..." />
            <button type="button" className="btn" onClick={openCreate}>
              <Plus size={18} strokeWidth={2} aria-hidden />
              Add customer
            </button>
          </>
        }
      />

      <div className="stat-card-grid">
        <StatCard label="Total Customers" value={listedCustomers.length} />
        <StatCard label="Customers with Dues" value={withDues} tone="danger" />
        <StatCard label="New Customers" value={newThisMonth} />
      </div>

      {error && <div className="error-banner">{error}</div>}

      {refreshing ? <p className="muted list-refreshing-hint">Updating…</p> : null}

      {loading ? (
        <LoadingState />
      ) : listedCustomers.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Add someone to start an Adagu loan or Gold Savings scheme."
        />
      ) : (
        <DataTable footer={<TablePager page={page} total={listedCustomers.length} onPageChange={setPage} />}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Address</th>
                <th className="num">Total Due</th>
                <th>Last Activity</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {paged.map((customer, index) => {
                const due = dueByCustomer.get(customer.id) ?? 0
                const last = lastActivityByCustomer.get(customer.id)
                const schemeAccounts = gsAccountsByCustomer.get(customer.id) ?? []
                return (
                  <tr key={customer.id}>
                    <td>{String((page - 1) * TABLE_PAGE_SIZE + index + 1).padStart(2, '0')}</td>
                    <td>
                      <button
                        type="button"
                        className="btn ghost customer-name-btn"
                        title={customer.name}
                        onClick={() => setProfile(customer)}
                      >
                        {customer.name}
                      </button>
                    </td>
                    <td>{customer.phone}</td>
                    <td>{customer.address || '—'}</td>
                    <td className={`num ${due > 0 ? 'due-amount' : 'paid-amount'}`}>
                      {formatCurrency(due)}
                    </td>
                    <td>{last ? formatDisplayDate(last) : '—'}</td>
                    <td>
                      <div className="row-actions">
                        {schemeAccounts.length > 0 ? (
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => {
                              if (schemeAccounts.length === 1) {
                                setCollectAccountId(schemeAccounts[0].id)
                              } else {
                                setPickAccounts(schemeAccounts)
                              }
                            }}
                          >
                            <IndianRupee size={16} />
                            Collect scheme
                          </button>
                        ) : null}
                        <button type="button" className="btn ghost" onClick={() => openEdit(customer)}>
                          <Pencil size={16} />
                          Edit
                        </button>
                        <button type="button" className="btn link-danger" onClick={() => setDeleteId(customer.id)}>
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </DataTable>
      )}

      <CustomerFormModal
        open={open}
        editing={editing}
        initialValues={emptyCustomerInput}
        onClose={() => setOpen(false)}
        onSaved={() => {
          showToast(editing ? 'Customer updated' : 'Customer added', 'success')
          void load()
        }}
        onError={(message) => setError(message)}
      />

      {deleteId !== null && (
        <ConfirmDialog
          title="Delete customer"
          message="Delete this customer?"
          onCancel={() => setDeleteId(null)}
          onConfirm={() => void remove(deleteId)}
        />
      )}

      {pickAccounts ? (
        <Modal title="Collect scheme" onClose={() => setPickAccounts(null)}>
          <p className="muted">
            This customer has more than one scheme account. Choose the account to collect.
          </p>
          <div className="form-grid">
            {pickAccounts.map((account) => (
              <button
                key={account.id}
                type="button"
                className="btn secondary full"
                onClick={() => {
                  setCollectAccountId(account.id)
                  setPickAccounts(null)
                }}
              >
                {account.accountNo} · {account.schemeName} · next due{' '}
                {account.nextDueDate ? formatDisplayDate(account.nextDueDate) : '—'}
              </button>
            ))}
          </div>
        </Modal>
      ) : null}

      {collectAccountId ? (
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

      {printPaymentId ? (
        <PrintPreviewModal
          title="Collection receipt"
          path={`/print/gs-batch-receipt/${printPaymentId}`}
          pdfFilename="gs-receipt.pdf"
          onClose={() => setPrintPaymentId(null)}
        />
      ) : null}

      {profile && profileSummary && (
        <Drawer title={profile.name} onClose={() => setProfile(null)}>
          <div className="drawer-section">
            <h3>Customer Profile</h3>
            <p className="settings-row"><strong>Name</strong> {profile.name}</p>
            <p className="settings-row"><strong>Phone</strong> {profile.phone || '—'}</p>
            <p className="settings-row"><strong>Address</strong> {profile.address || '—'}</p>
            <p className="settings-row"><strong>Aadhaar</strong> {profile.aadhaar || '—'}</p>
            <p className="settings-row"><strong>PAN</strong> {profile.pan || '—'}</p>
          </div>
          <div className="drawer-section">
            <h3>Financial Summary</h3>
            <p className="settings-row"><strong>Total Paid</strong> {formatCurrency(profileSummary.totalPaid)}</p>
            <p className="settings-row"><strong>Outstanding</strong> {formatCurrency(profileSummary.outstanding)}</p>
            <p className="settings-row"><strong>Active Adagu loans</strong> {profileSummary.activeLoans}</p>
            <p className="settings-row"><strong>Interest due</strong> {formatCurrency(profileSummary.interestDue)}</p>
          </div>
          <div className="drawer-section">
            <h3>Adagu loans</h3>
            {profileSummary.adagu.length === 0 ? (
              <p className="muted">No Adagu loans yet.</p>
            ) : (
              <ul className="dues-detail-history">
                {profileSummary.adagu.map((row) => (
                  <li key={row.pledgeId}>
                    <span>{row.receiptNo}</span>
                    <span>{formatDisplayDate(row.pledgeDate)}</span>
                    <span className="num">{formatCurrency(row.principal)}</span>
                    <span className={`num ${row.remaining > 0 ? 'due-amount' : 'paid-amount'}`}>
                      Remaining {formatCurrency(row.remaining)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="drawer-section">
            <h3>Gold Savings accounts</h3>
            {profileSummary.schemes.length === 0 ? (
              <p className="muted">No Gold Savings accounts yet.</p>
            ) : (
              <ul className="dues-detail-history">
                {profileSummary.schemes.map((account) => (
                  <li key={account.id}>
                    <span>{account.accountNo}</span>
                    <span>{account.schemeName}</span>
                    <span className="num">{formatCurrency(account.totalPaid)}</span>
                    <span className="num">
                      Next due {account.nextDueDate ? formatDisplayDate(account.nextDueDate) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="drawer-section">
            <h3>Payment History</h3>
            {profileSummary.payments.length === 0 ? (
              <p className="muted">No payments recorded.</p>
            ) : (
              <ul className="dues-detail-history">
                {profileSummary.payments.map((payment) => (
                  <li key={payment.id}>
                    <span>{formatDisplayDate(payment.date)}</span>
                    <span className="num">− {formatCurrency(payment.amount)}</span>
                    {payment.reference ? <span>{payment.reference}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="drawer-section">
            <h3>Due History</h3>
            {profileSummary.dues.length === 0 ? (
              <p className="muted">No due history.</p>
            ) : (
              <ul className="dues-detail-history">
                {profileSummary.dues.map((due) => (
                  <li key={due.id}>
                    <span>{formatDisplayDate(due.date)}</span>
                    <span className="num">{formatCurrency(due.amount)}</span>
                    {due.reference ? <span>{due.reference}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Drawer>
      )}
    </div>
  )
}
