import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Eye, Pencil, Plus, Printer, Search } from 'lucide-react'
import { localTodayIso } from '@shared/localDate'
import type { Pledge } from '@shared/types'
import { DataTable, TablePager } from '../../components/DataTable'
import { DateInput } from '../../components/DateInput'
import { FilterBar } from '../../components/FilterBar'
import { LoadingState } from '../../components/LoadingState'
import { StatusBadge, type StatusKind } from '../../components/StatusBadge'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { monthRange } from '../../lib/dateRange'
import { api } from '../../lib/api'
import { PledgePreviewModal } from './PledgePreviewModal'

const PAGE_SIZE_OPTIONS = [5, 10, 25]
const DEFAULT_PAGE_SIZE = 10

type PledgeStatusChip = 'all' | 'draft' | 'active' | 'redeemed' | 'forfeited' | 'renewed'
type Period = 'today' | 'month' | 'all'

function statusOf(pledge: Pledge): { kind: StatusKind; label: string } {
  if (pledge.status === 'redeemed') return { kind: 'paid', label: 'Redeemed' }
  if (pledge.status === 'renewed') return { kind: 'paid', label: 'Renewed' }
  if (pledge.status === 'forfeited') return { kind: 'draft', label: 'Forfeited' }
  if (pledge.status === 'draft') return { kind: 'draft', label: 'Draft' }
  return { kind: 'due', label: 'Active' }
}

function itemCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`
}

export function AdaguListPage() {
  const today = localTodayIso()

  const [pledges, setPledges] = useState<Pledge[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('all')
  const [selectedDate, setSelectedDate] = useState(today)
  const [search, setSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<PledgeStatusChip>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [dateSort, setDateSort] = useState<'desc' | 'asc'>('desc')
  const [previewPledge, setPreviewPledge] = useState<{ id: number; receiptNo: string } | null>(null)

  const range = useMemo(() => {
    if (period === 'all') return { from: null, to: null }
    if (period === 'month') return monthRange(selectedDate)
    return { from: selectedDate, to: selectedDate }
  }, [period, selectedDate])

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
        }
        const result = await api.listPledges({
          page,
          pageSize,
          from: range.from,
          to: range.to,
          q: searchQuery || undefined,
          status: statusFilter,
          sort: dateSort,
        })
        if (active) {
          setPledges(result.items ?? [])
          setTotalRows(result.total ?? 0)
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load Adagu receipts')
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
  }, [page, pageSize, range.from, range.to, searchQuery, statusFilter, dateSort])

  function resetPage() {
    setPage(1)
  }

  function resetFilters() {
    setStatusFilter('all')
    setPeriod('all')
    setSearch('')
    setSearchQuery('')
    setPage(1)
  }

  return (
    <div className="app-page billing-page app-page-fill">
      <header className="page-header app-page-header billing-page-header">
        <div>
          <h1>Adagu</h1>
          <p className="page-subtitle muted">Pledge and loan receipts</p>
        </div>
        <div className="toolbar page-header-actions billing-header-tools">
          <label className="billing-search">
            <Search size={16} strokeWidth={2} aria-hidden />
            <input
              className="input"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                resetPage()
              }}
              placeholder="Search receipt, customer, mobile..."
            />
          </label>
          <DateInput
            className="input"
            value={selectedDate}
            showIcon
            ariaLabel="Adagu date"
            onChange={(value) => {
              setSelectedDate(value || today)
              resetPage()
            }}
          />
          <Link to="/adagu/new" className="btn">
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            New Adagu
          </Link>
        </div>
      </header>

      {refreshing ? <p className="muted list-refreshing-hint">Updating…</p> : null}
      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          header={
            <div className="billing-toolbar">
              <FilterBar
                value={statusFilter}
                onChange={(value) => {
                  setStatusFilter(value)
                  resetPage()
                }}
                options={[
                  { value: 'all', label: `All (${totalRows})` },
                  { value: 'draft', label: 'Draft' },
                  { value: 'active', label: 'Active' },
                  { value: 'redeemed', label: 'Redeemed' },
                  { value: 'forfeited', label: 'Forfeited' },
                  { value: 'renewed', label: 'Renewed' },
                ]}
              />
              <div className="billing-toolbar-filters">
                <label className="billing-filter-field billing-period-field">
                  <Calendar size={15} strokeWidth={2} aria-hidden />
                  <select
                    className="input"
                    value={period}
                    aria-label="Period"
                    onChange={(event) => {
                      setPeriod(event.target.value as Period)
                      resetPage()
                    }}
                  >
                    <option value="today">Today</option>
                    <option value="month">This month</option>
                    <option value="all">All</option>
                  </select>
                </label>
                <button type="button" className="btn secondary" onClick={resetFilters}>
                  Reset
                </button>
              </div>
            </div>
          }
          footer={
            totalRows === 0 ? undefined : (
              <TablePager
                page={page}
                pageSize={pageSize}
                total={totalRows}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                itemLabel="receipts"
              />
            )
          }
        >
          <table>
            <thead>
              <tr>
                <th>Receipt No.</th>
                <th>
                  <button
                    type="button"
                    className="billing-sort"
                    onClick={() => setDateSort((value) => (value === 'desc' ? 'asc' : 'desc'))}
                  >
                    Date
                    <span aria-hidden>{dateSort === 'desc' ? ' ↓' : ' ↑'}</span>
                  </button>
                </th>
                <th>Customer</th>
                <th>Items</th>
                <th className="num">Loan Amount</th>
                <th className="num">Balance</th>
                <th>Status</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pledges.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-cell">
                    No Adagu receipts found. Create your first one to get started.
                  </td>
                </tr>
              ) : null}
              {pledges.map((pledge) => {
                const status = statusOf(pledge)
                const viewPath = `/adagu/${pledge.id}`
                const editable = pledge.status === 'active' || pledge.status === 'draft'
                return (
                  <tr key={pledge.id}>
                    <td>
                      <Link to={viewPath} className="billing-bill-no">
                        {pledge.receiptNo}
                      </Link>
                    </td>
                    <td>{formatDisplayDate(pledge.pledgeDate)}</td>
                    <td>
                      <span className="billing-customer-name">{pledge.customerName}</span>
                      {pledge.customerPhone ? (
                        <span className="cell-hint">{pledge.customerPhone}</span>
                      ) : null}
                    </td>
                    <td>{itemCountLabel(pledge.itemCount ?? pledge.items?.length ?? 0)}</td>
                    <td className="num">{formatCurrency(pledge.loanAmount)}</td>
                    <td className="num">
                      {pledge.status === 'active' ? formatCurrency(pledge.loanAmount) : '-'}
                    </td>
                    <td>
                      <StatusBadge kind={status.kind} label={status.label} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link
                          to={viewPath}
                          className="btn ghost billing-icon-btn"
                          aria-label={`Open ${pledge.receiptNo}`}
                        >
                          {editable ? (
                            <Pencil size={16} strokeWidth={1.75} />
                          ) : (
                            <Eye size={16} strokeWidth={1.75} />
                          )}
                        </Link>
                        <button
                          type="button"
                          className="btn ghost billing-icon-btn"
                          aria-label={`Print ${pledge.receiptNo}`}
                          onClick={() =>
                            setPreviewPledge({ id: pledge.id, receiptNo: pledge.receiptNo })
                          }
                        >
                          <Printer size={16} strokeWidth={1.75} />
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

      {previewPledge ? (
        <PledgePreviewModal
          pledgeId={previewPledge.id}
          pdfFilename={`${previewPledge.receiptNo}.pdf`}
          onClose={() => setPreviewPledge(null)}
        />
      ) : null}
    </div>
  )
}
