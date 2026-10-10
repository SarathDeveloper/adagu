import { useEffect, useMemo, useRef, useState } from 'react'
import type { DuesLedger } from '@shared/types'
import { PageHeader } from '../../components/PageHeader'
import { SearchBar } from '../../components/SearchBar'
import { StatCard } from '../../components/StatCard'
import { formatCurrency } from '../../lib/format'
import { api } from '../../lib/api'
import { computeTodayCollections } from '../dashboard/dashboardStats'
import { localTodayIso } from '@shared/localDate'
import { AdaguDuesTab } from './AdaguDuesTab'
import { emptyDuesLedger } from './duesHelpers'

/**
 * Dues is Adagu-only in this edition: loans, monthly interest, extra cash and
 * gold release. There is no bill tab.
 */
export function DuesPage() {
  const today = localTodayIso()
  const [search, setSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [ledger, setLedger] = useState<DuesLedger>(emptyDuesLedger())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const hasLoadedRef = useRef(false)

  async function loadLedger(query: string = searchQuery) {
    setError(null)
    const data = await api.listDues(query)
    const next: DuesLedger = {
      ...data,
      adaguDues: data.adaguDues ?? [],
      adaguOutstanding: data.adaguOutstanding ?? 0,
    }
    setLedger(next)
    hasLoadedRef.current = true
    return next
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (hasLoadedRef.current) setRefreshing(true)
        else setLoading(true)
        await loadLedger()
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load dues')
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchQuery triggers IPC reload
  }, [searchQuery])

  const adaguDues = ledger.adaguDues ?? []
  const adaguTotal = ledger.adaguOutstanding ?? 0
  const activeLoans = adaguDues.filter((row) => row.status === 'active' && row.remaining > 0).length
  const overdueInterest = adaguDues.filter((row) => row.isInterestOverdue).length

  const todayCollections = useMemo(() => {
    const entries = (ledger.columns ?? []).flatMap((column) =>
      (column.entries ?? []).filter((entry) => entry.pledgeId !== null),
    )
    return computeTodayCollections(entries, today)
  }, [ledger, today])

  return (
    <div className="dues-shell">
      <div className="dues-page app-page app-page-fill">
        <PageHeader
          title="Adagu Dues"
          subtitle="Adagu loans, monthly interest, extra cash, and gold release"
          actions={
            <SearchBar
              value={search}
              onChange={(value) => setSearch(value)}
              placeholder="Search customer or ADG no..."
            />
          }
        />

        <div className="stat-card-grid">
          <StatCard label="Adagu Outstanding" value={formatCurrency(adaguTotal)} tone="danger" />
          <StatCard label="Active Loans" value={activeLoans} />
          <StatCard
            label="Interest Overdue"
            value={overdueInterest}
            tone={overdueInterest > 0 ? 'danger' : undefined}
          />
          <StatCard label="Today's Collections" value={formatCurrency(todayCollections)} tone="success" />
        </div>

        {error && <div className="error-banner">{error}</div>}

        {refreshing ? <p className="muted list-refreshing-hint">Updating…</p> : null}

        <div className="dues-tab-panel">
          <AdaguDuesTab
            ledger={ledger}
            loading={loading}
            error={error}
            onError={setError}
            onReload={loadLedger}
          />
        </div>
      </div>
    </div>
  )
}
