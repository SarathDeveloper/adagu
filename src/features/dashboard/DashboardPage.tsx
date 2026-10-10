import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar,
  ChevronDown,
  Handshake,
  IndianRupee,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { localTodayIso } from '@shared/localDate'
import type { DuesLedger, GoldSavingDashboard, MetalRates } from '@shared/types'
import { formatCurrency, formatDisplayDate, formatInr, formatWeight } from '../../lib/format'
import { api } from '../../lib/api'
import { useAuth } from '../auth/authContext'
import { DashboardAlertsMenu } from './DashboardAlertsMenu'
import {
  adaguFollowUps,
  buildDashboardAlerts,
  computeAdaguCollectionsInRange,
  computeAdaguStats,
  computeDueCollections,
} from './dashboardStats'

function formatDashboardDate(isoDate: string): string {
  const formatted = formatDisplayDate(isoDate)
  if (isoDate === localTodayIso()) {
    return `Today, ${formatted}`
  }
  return formatted
}

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

type KpiTone = 'brand' | 'success' | 'danger' | 'info'

function KpiCard({
  to,
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  to?: string
  label: string
  value: string
  hint?: string
  icon: LucideIcon
  tone: KpiTone
}) {
  const body = (
    <>
      <div className={`dashboard-kpi-icon dashboard-kpi-icon-${tone}`}>
        <Icon size={20} strokeWidth={1.75} aria-hidden />
      </div>
      <div className="dashboard-kpi-body">
        <span className="kpi-label">{label}</span>
        <span className="kpi-value num">{value}</span>
        {hint ? <span className="dashboard-kpi-hint">{hint}</span> : null}
      </div>
    </>
  )

  if (to) {
    return (
      <Link to={to} className="card padded dashboard-kpi-card dashboard-kpi-card-link">
        {body}
      </Link>
    )
  }

  return <div className="card padded dashboard-kpi-card">{body}</div>
}

type GoldKarat = '22k' | '24k'

function formatRateAmount(amount: number | undefined): string {
  if (amount == null) return '—'
  return formatCurrency(amount)
}

function RateTicker({
  metal,
  label,
  amount,
  chevron,
  expanded,
  onClick,
}: {
  metal: 'gold' | 'silver'
  label: string
  amount: string
  chevron?: boolean
  expanded?: boolean
  onClick?: () => void
}) {
  const className = `dashboard-rate-ticker dashboard-rate-ticker-${metal}`
  const body = (
    <>
      <span className="dashboard-rate-coin" aria-hidden />
      <span className="dashboard-rate-text">
        {label} - {amount}
      </span>
      {chevron ? <ChevronDown size={14} strokeWidth={2} aria-hidden /> : null}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        aria-expanded={expanded}
        aria-haspopup="listbox"
        onClick={onClick}
      >
        {body}
      </button>
    )
  }

  return <span className={className}>{body}</span>
}

function GoldRateTicker({ rates }: { rates: MetalRates | null }) {
  const [karat, setKarat] = useState<GoldKarat>('22k')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const amount = karat === '24k' ? rates?.gold24k : rates?.gold22k
  const label = karat === '24k' ? 'GOLD24 KT/1g' : 'GOLD22 KT/1g'

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="dashboard-rate-ticker-wrap" ref={rootRef}>
      <RateTicker
        metal="gold"
        label={label}
        amount={formatRateAmount(amount)}
        chevron
        expanded={open}
        onClick={() => setOpen((value) => !value)}
      />
      {open ? (
        <div className="dashboard-rate-menu" role="listbox" aria-label="Gold rates">
          <button
            type="button"
            role="option"
            aria-selected={karat === '22k'}
            onClick={() => {
              setKarat('22k')
              setOpen(false)
            }}
          >
            <span>Gold 22K</span>
            <span className="num">{formatRateAmount(rates?.gold22k)}</span>
          </button>
          <button
            type="button"
            role="option"
            aria-selected={karat === '24k'}
            onClick={() => {
              setKarat('24k')
              setOpen(false)
            }}
          >
            <span>Gold 24K</span>
            <span className="num">{formatRateAmount(rates?.gold24k)}</span>
          </button>
          {rates ? null : (
            <Link to="/rates" className="dashboard-rate-menu-link" onClick={() => setOpen(false)}>
              Set rates in Rates
            </Link>
          )}
        </div>
      ) : null}
    </div>
  )
}

export function DashboardPage() {
  if (window.location.hash.includes('crash-test')) {
    throw new Error('Diagnostic crash test')
  }

  const { user, can } = useAuth()
  const displayName = user?.username || 'Shop Owner'
  const avatarLetter = displayName.charAt(0).toUpperCase()
  const [ledger, setLedger] = useState<DuesLedger | undefined>(undefined)
  const [metalRates, setMetalRates] = useState<MetalRates | null>(null)
  const [goldSavings, setGoldSavings] = useState<GoldSavingDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const hasLoadedRef = useRef(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const today = localTodayIso()
  const greeting = greetingForHour(new Date().getHours())
  const monthStart = `${today.slice(0, 8)}01`
  const canGoldSavings = can('gold_savings')

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (active) {
          setError(null)
          if (hasLoadedRef.current) setRefreshing(true)
          else setLoading(true)
        }
        const [dues, latestRates, gsDashboard] = await Promise.all([
          api.listDues().catch(() => undefined),
          api.getLatestMetalRates().catch(() => null),
          canGoldSavings ? api.getGsDashboard().catch(() => null) : Promise.resolve(null),
        ])
        if (active) {
          setLedger(dues)
          setMetalRates(latestRates)
          setGoldSavings(gsDashboard)
          hasLoadedRef.current = true
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard')
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
  }, [today, refreshKey, canGoldSavings])

  const adagu = computeAdaguStats(ledger, today)
  const followUps = adaguFollowUps(ledger, today)
  const { dueCollections, outstandingCustomerCount } = computeDueCollections(ledger, today)
  const adaguCollectedThisMonth = computeAdaguCollectionsInRange(
    ledger?.columns.flatMap((column) => column.entries ?? []),
    monthStart,
    today,
  )
  const maturingAccounts = goldSavings?.maturingAccounts ?? []
  const alerts = buildDashboardAlerts(ledger, goldSavings, today)

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p className="dashboard-greeting">
            {greeting}, {displayName}
          </p>
        </div>
        <div className="dashboard-header-tools">
          <GoldRateTicker rates={metalRates} />
          <RateTicker metal="silver" label="SILVER/1g" amount={formatRateAmount(metalRates?.silverFine)} />
          <span className="dashboard-date-chip">
            <Calendar size={15} strokeWidth={1.75} aria-hidden />
            {formatDashboardDate(today)}
          </span>
          <button
            type="button"
            className="btn ghost dashboard-icon-btn"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading || refreshing}
            aria-label="Refresh dashboard"
          >
            <RefreshCw size={18} strokeWidth={1.75} className={loading || refreshing ? 'dashboard-spin' : ''} />
          </button>
          <DashboardAlertsMenu alerts={alerts} />
          <div className="dashboard-profile">
            <span className="dashboard-avatar" aria-hidden>
              {avatarLetter}
            </span>
            <span className="dashboard-profile-name">{displayName}</span>
          </div>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {loading && !error ? (
        <p className="muted">Loading…</p>
      ) : error ? (
        <p className="muted">Fix the error above and reload the page (View → Reload).</p>
      ) : (
        <>
          <div className="dashboard-kpi-grid">
            <KpiCard
              to="/dues"
              label="Adagu outstanding"
              value={`₹ ${formatInr(adagu.outstanding)}`}
              hint={
                outstandingCustomerCount > 0
                  ? `${outstandingCustomerCount} customer${outstandingCustomerCount === 1 ? '' : 's'}`
                  : undefined
              }
              icon={Wallet}
              tone="brand"
            />
            <KpiCard
              to="/adagu"
              label="Active Adagu loans"
              value={String(adagu.activePledges)}
              hint={
                adagu.activePrincipal > 0
                  ? `Interest base ₹ ${formatInr(adagu.activePrincipal)}`
                  : undefined
              }
              icon={Handshake}
              tone="info"
            />
            <KpiCard
              to="/dues"
              label="Interest overdue"
              value={String(adagu.overduePledges)}
              hint={adagu.overduePledges > 0 ? 'Follow up today' : 'All clear'}
              icon={ShieldAlert}
              tone={adagu.overduePledges > 0 ? 'danger' : 'success'}
            />
            <KpiCard
              label="Adagu collected (month)"
              value={`₹ ${formatInr(adaguCollectedThisMonth)}`}
              icon={IndianRupee}
              tone="success"
            />
            {canGoldSavings && (
              <KpiCard
                to="/gold-savings"
                label="Gold Savings today"
                value={`₹ ${formatInr(goldSavings?.todayCollections ?? 0)}`}
                hint={
                  goldSavings ? `${formatWeight(goldSavings.totalGold)} accumulated` : undefined
                }
                icon={Sparkles}
                tone="brand"
              />
            )}
            {canGoldSavings && (
              <KpiCard
                to="/gold-savings/maturity"
                label="Maturities due"
                value={String(goldSavings?.upcomingMaturities ?? 0)}
                hint={
                  goldSavings && goldSavings.overdueInstallments > 0
                    ? `${goldSavings.overdueInstallments} installments overdue`
                    : undefined
                }
                icon={Calendar}
                tone={(goldSavings?.upcomingMaturities ?? 0) > 0 ? 'info' : 'success'}
              />
            )}
          </div>

          <section className="dashboard-quick-section" aria-label="Quick actions">
            <h2 className="dashboard-quick-title">
              <Zap size={18} strokeWidth={1.75} aria-hidden />
              Quick actions
            </h2>
            <div className="dashboard-quick-actions">
              <Link to="/adagu/new" className="btn dashboard-quick-primary">
                <Plus size={18} strokeWidth={2} aria-hidden />
                New Adagu
              </Link>
              {canGoldSavings && (
                <Link to="/gold-savings/collections" className="btn secondary dashboard-quick-btn">
                  <IndianRupee size={18} strokeWidth={1.75} aria-hidden />
                  Collect installment
                </Link>
              )}
              {canGoldSavings && (
                <Link to="/gold-savings/enroll" className="btn secondary dashboard-quick-btn">
                  <UserPlus size={18} strokeWidth={1.75} aria-hidden />
                  Enroll
                </Link>
              )}
              <Link to="/customers" className="btn secondary dashboard-quick-btn">
                <Users size={18} strokeWidth={1.75} aria-hidden />
                Customers
              </Link>
              <Link to="/dues" className="btn secondary dashboard-quick-btn">
                <Wallet size={18} strokeWidth={1.75} aria-hidden />
                Collect Adagu
              </Link>
            </div>
          </section>

          <div className="dashboard-lower-grid">
            <section>
              <div className="dashboard-section-head">
                <h2 className="dashboard-section-title">Adagu follow-ups</h2>
                <Link to="/dues" className="dashboard-panel-link">
                  View all
                </Link>
              </div>
              {followUps.length === 0 ? (
                <div className="card padded dashboard-empty-state">No Adagu balances outstanding.</div>
              ) : (
                <div className="card table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Receipt</th>
                        <th>Customer</th>
                        <th className="num">Interest due</th>
                        <th className="num">Remaining</th>
                        <th className="num">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {followUps.map((row) => (
                        <tr key={row.pledgeId}>
                          <td>
                            <Link to={`/adagu/${row.pledgeId}`}>{row.receiptNo}</Link>
                          </td>
                          <td>{row.customerName}</td>
                          <td className="num">{formatCurrency(row.interestDue)}</td>
                          <td className="num">{formatCurrency(row.remaining)}</td>
                          <td className="num">{row.daysSinceStart}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <div className="dashboard-section-head">
                <h2 className="dashboard-section-title">Due collections</h2>
                <Link to="/dues" className="dashboard-panel-link">
                  View all
                </Link>
              </div>
              {dueCollections.length === 0 ? (
                <div className="card padded dashboard-empty-state">No outstanding balances.</div>
              ) : (
                <div className="card table-wrap dashboard-due-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th className="num">Amount</th>
                        <th className="num">Days</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dueCollections.map((row) => (
                        <tr key={row.customerId}>
                          <td>{row.customerName}</td>
                          <td className="num dashboard-due-amount">₹ {formatInr(row.balance)}</td>
                          <td className="num dashboard-due-days">{row.daysOverdue}</td>
                          <td>
                            <Link to="/dues" className="btn secondary dashboard-due-collect">
                              Collect
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {canGoldSavings && maturingAccounts.length > 0 && (
            <section className="dashboard-lower-grid">
              <div className="dashboard-section-head">
                <h2 className="dashboard-section-title">Gold Savings maturing soon</h2>
                <Link to="/gold-savings/maturity" className="dashboard-panel-link">
                  View all
                </Link>
              </div>
              <div className="card table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Customer</th>
                      <th>Scheme</th>
                      <th>Maturity</th>
                      <th className="num">Gold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maturingAccounts.slice(0, 5).map((account) => (
                      <tr key={account.id}>
                        <td>{account.accountNo}</td>
                        <td>{account.customerName}</td>
                        <td>{account.schemeName}</td>
                        <td>{formatDisplayDate(account.maturityDate)}</td>
                        <td className="num">{formatWeight(account.goldAccumulated)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
