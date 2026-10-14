import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Calendar, Eye, Pencil, Plus, Printer, Search } from 'lucide-react'
import { localTodayIso } from '@shared/localDate'
import type { Pledge, PledgeStatus } from '@shared/types'
import { DataTable, TablePager } from '../../components/DataTable'
import { DateInput } from '../../components/DateInput'
import { EmptyState } from '../../components/EmptyState'
import { FilterBar } from '../../components/FilterBar'
import { LoadingState } from '../../components/LoadingState'
import { formatCurrency, formatDisplayDate, formatWeight } from '../../lib/format'
import { monthRange } from '../../lib/dateRange'
import { api } from '../../lib/api'
import { PledgePreviewModal } from './PledgePreviewModal'

const PAGE_SIZE_OPTIONS = [5, 10, 25]
const DEFAULT_PAGE_SIZE = 10
const DAY_MS = 24 * 60 * 60 * 1000

type PledgeStatusChip = 'all' | 'draft' | 'active' | 'redeemed' | 'forfeited' | 'renewed'
type Period = 'today' | 'month' | 'all'
type DueTone = 'ok' | 'soon' | 'overdue'

function statusOf(pledge: Pledge): { tone: PledgeStatus; label: string } {
  if (pledge.status === 'redeemed') return { tone: 'redeemed', label: 'Redeemed' }
  if (pledge.status === 'renewed') return { tone: 'renewed', label: 'Renewed' }
  if (pledge.status === 'forfeited') return { tone: 'forfeited', label: 'Forfeited' }
  if (pledge.status === 'draft') return { tone: 'draft', label: 'Draft' }
  return { tone: 'active', label: 'Active' }
}

function itemCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

function parseIsoDayMs(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim().slice(0, 10))
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function dueInfo(pledge: Pledge, todayIso: string): { label: string; tone: DueTone } | null {
  if (pledge.status !== 'active' || !pledge.repaymentDueDate) return null
  const dueMs = parseIsoDayMs(pledge.repaymentDueDate)
  const todayMs = parseIsoDayMs(todayIso)
  if (dueMs === null || todayMs === null) return null
  const diffDays = Math.round((dueMs - todayMs) / DAY_MS)
  if (diffDays < 0) {
    const days = Math.abs(diffDays)
    return { label: `Overdue ${days} ${days === 1 ? 'day' : 'days'}`, tone: 'overdue' }
  }
  if (diffDays === 0) return { label: 'Due today', tone: 'soon' }
  if (diffDays <= 7) {
    return { label: `in ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`, tone: 'soon' }
  }
  return { label: `in ${diffDays} days`, tone: 'ok' }
}

function totalNetWeightOf(pledge: Pledge): number {
  if (typeof pledge.totalNetWeight === 'number') return pledge.totalNetWeight
  return (pledge.items ?? []).reduce((sum, item) => sum + (item.netWeight ?? 0), 0)
}

export function AdaguListPage() {
  const today = localTodayIso()
  const navigate = useNavigate()

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
    <div className="app-page billing-page adagu-list app-page-fill">
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
          {pledges.length === 0 ? (
            <EmptyState
              title="No Adagu receipts found"
              description="Create your first Adagu receipt to record a pledge and loan."
              action={
                <Link to="/adagu/new" className="btn">
                  <Plus size={16} strokeWidth={1.75} aria-hidden />
                  New Adagu
                </Link>
              }
            />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>
                    <button
                      type="button"
                      className="billing-sort"
                      onClick={() => setDateSort((value) => (value === 'desc' ? 'asc' : 'desc'))}
                    >
                      Receipt / Date
                      <span aria-hidden>{dateSort === 'desc' ? ' ↓' : ' ↑'}</span>
                    </button>
                  </th>
                  <th>Customer</th>
                  <th className="adagu-col-gold">Pledged gold</th>
                  <th className="num">Loan</th>
                  <th className="num">Balance</th>
                  <th className="adagu-col-due">Due date</th>
                  <th>Status</th>
                  <th className="num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pledges.map((pledge) => {
                  const status = statusOf(pledge)
                  const viewPath = `/adagu/${pledge.id}`
                  const editable = pledge.status === 'active' || pledge.status === 'draft'
                  const due = dueInfo(pledge, today)
                  const isOverdue = due?.tone === 'overdue'
                  const itemCount = pledge.itemCount ?? pledge.items?.length ?? 0
                  const netWeight = totalNetWeightOf(pledge)

                  return (
                    <tr
                      key={pledge.id}
                      className={`adagu-list-row${isOverdue ? ' adagu-list-row--overdue' : ''}`}
                      tabIndex={0}
                      onClick={() => navigate(viewPath)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          navigate(viewPath)
                        }
                      }}
                    >
                      <td>
                        <div className="adagu-cell-stack">
                          <Link
                            to={viewPath}
                            className="billing-bill-no"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {pledge.receiptNo}
                          </Link>
                          <span className="cell-hint">{formatDisplayDate(pledge.pledgeDate)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="adagu-customer-cell">
                          <span className="adagu-customer-avatar" aria-hidden>
                            {initialsOf(pledge.customerName)}
                          </span>
                          <div className="adagu-cell-stack">
                            <span className="billing-customer-name">{pledge.customerName}</span>
                            <span className="cell-hint">{pledge.customerPhone || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="adagu-col-gold adagu-tabular">
                        <div className="adagu-cell-stack">
                          <span className="adagu-cell-primary">
                            {netWeight > 0 ? formatWeight(netWeight, 3) : '—'}
                          </span>
                          <span className="cell-hint">{itemCountLabel(itemCount)}</span>
                        </div>
                      </td>
                      <td className="num adagu-tabular">
                        <div className="adagu-cell-stack adagu-cell-stack--end">
                          <span className="adagu-cell-primary">
                            {formatCurrency(pledge.loanAmount)}
                          </span>
                          <span className="cell-hint">{pledge.interestPct}% / month</span>
                        </div>
                      </td>
                      <td className="num adagu-tabular">
                        <div className="adagu-cell-stack adagu-cell-stack--end">
                          {pledge.status === 'active' ? (
                            <span className="adagu-cell-primary adagu-balance-active">
                              {formatCurrency(pledge.outstanding ?? pledge.loanAmount)}
                            </span>
                          ) : pledge.redeemedDate ? (
                            <span className="cell-hint">
                              Closed {formatDisplayDate(pledge.redeemedDate)}
                            </span>
                          ) : (
                            <span className="muted">-</span>
                          )}
                        </div>
                      </td>
                      <td className="adagu-col-due">
                        {pledge.status === 'active' && pledge.repaymentDueDate ? (
                          <div className="adagu-cell-stack">
                            <span className="adagu-cell-primary">
                              {formatDisplayDate(pledge.repaymentDueDate)}
                            </span>
                            {due ? (
                              <span className={`cell-hint adagu-due-hint adagu-due-hint--${due.tone}`}>
                                {due.label}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td>
                        <span className={`adagu-status adagu-status--${status.tone}`}>
                          <span className="adagu-status-dot" aria-hidden />
                          {status.label}
                        </span>
                      </td>
                      <td className="num" onClick={(event) => event.stopPropagation()}>
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
          )}
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
