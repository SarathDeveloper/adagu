import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarClock,
  CalendarX2,
  FileText,
  IndianRupee,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { GoldSavingDashboard, MainDashboard } from '@shared/types'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { api } from '../../lib/api'
import { useAuth } from '../auth/authContext'
import { GOLD_SAVINGS_VISIBLE } from '../goldSavings/visibility'
import { CustomerFormModal } from '../customers/CustomerFormModal'
import { DashboardAlertsMenu } from './DashboardAlertsMenu'
import { DashboardSearch } from './DashboardSearch'
import { buildDashboardAlerts } from './dashboardStats'

type KpiTone = 'default' | 'warning' | 'danger'

function KpiCard({
  label,
  value,
  hint,
  hintTone,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  hint: string
  hintTone?: 'success' | 'muted' | 'danger'
  icon: LucideIcon
  tone: KpiTone
}) {
  return (
    <div className="card main-dash-kpi">
      <div className="main-dash-kpi-head">
        <span className="main-dash-kpi-label">{label}</span>
        <Icon className={`main-dash-kpi-icon main-dash-kpi-icon-${tone}`} size={18} strokeWidth={1.75} aria-hidden />
      </div>
      <span className={`main-dash-kpi-value main-dash-kpi-value-${tone}`}>{value}</span>
      <span className={`main-dash-kpi-hint main-dash-kpi-hint-${hintTone ?? 'muted'}`}>{hint}</span>
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
  const canGoldSavings = GOLD_SAVINGS_VISIBLE && can('gold_savings')
  const [dashboard, setDashboard] = useState<MainDashboard | null>(null)
  const [goldSavings, setGoldSavings] = useState<GoldSavingDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (active) setError(null)
        const [main, gsDashboard] = await Promise.all([
          api.getDashboard(),
          canGoldSavings ? api.getGsDashboard().catch(() => null) : Promise.resolve(null),
        ])
        if (active) {
          setDashboard(main)
          setGoldSavings(gsDashboard)
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard')
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [refreshKey, canGoldSavings])

  const alerts = buildDashboardAlerts(dashboard, canGoldSavings ? goldSavings : null)
  const weekHint = (count: number) => `+${count} from last week`

  return (
    <div className="dashboard-page main-dash">
      <div className="main-dash-topbar">
        <DashboardSearch />
        <div className="main-dash-topbar-actions">
          <DashboardAlertsMenu alerts={alerts} />
          <span className="main-dash-avatar" aria-hidden>
            {avatarLetter}
          </span>
        </div>
      </div>

      <header className="main-dash-header">
        <h1>Dashboard</h1>
        <div className="main-dash-header-actions">
          <button type="button" className="btn secondary" onClick={() => setCustomerOpen(true)}>
            New Customer
          </button>
          <Link to="/adagu/new" className="btn">
            New Pledge
          </Link>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {loading && !dashboard ? (
        <p className="muted">Loading…</p>
      ) : dashboard ? (
        <>
          <div className="main-dash-kpis">
            <KpiCard
              label="Total Customers"
              value={String(dashboard.totalCustomers)}
              hint={weekHint(dashboard.newCustomersThisWeek)}
              hintTone={dashboard.newCustomersThisWeek > 0 ? 'success' : 'muted'}
              icon={Users}
              tone="default"
            />
            <KpiCard
              label="Active Pledges"
              value={String(dashboard.activePledges)}
              hint={weekHint(dashboard.newActivePledgesThisWeek)}
              hintTone={dashboard.newActivePledgesThisWeek > 0 ? 'success' : 'muted'}
              icon={FileText}
              tone="default"
            />
            <KpiCard
              label="Today's Pledges"
              value={String(dashboard.todayPledges)}
              hint={`${formatCurrency(dashboard.todayPledgesValue)} value`}
              icon={IndianRupee}
              tone="default"
            />
            <KpiCard
              label="Due Soon"
              value={String(dashboard.dueSoon)}
              hint="Next 30 days"
              icon={CalendarClock}
              tone="warning"
            />
            <KpiCard
              label="Overdue"
              value={String(dashboard.overdue)}
              hint="Requires action"
              hintTone="danger"
              icon={CalendarX2}
              tone="danger"
            />
          </div>

          <section className="card main-dash-attention" aria-label="Attention Required (Due Soon & Overdue)">
            <h2 className="main-dash-attention-title">
              <CalendarClock size={18} strokeWidth={1.75} aria-hidden />
              Attention Required (Due Soon &amp; Overdue)
            </h2>
            {dashboard.attention.length === 0 ? (
              <p className="main-dash-attention-empty">No pledges are due soon or overdue.</p>
            ) : (
              <div className="main-dash-attention-table">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Amount</th>
                      <th>Start Date</th>
                      <th>Due Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.attention.map((row) => (
                      <tr key={row.pledgeId}>
                        <td>
                          <Link className="main-dash-customer" to={`/adagu/${row.pledgeId}`}>
                            {row.customerName}
                          </Link>
                        </td>
                        <td>{formatCurrency(row.amount)}</td>
                        <td>{formatDisplayDate(row.startDate)}</td>
                        <td className="main-dash-due">{formatDisplayDate(row.dueDate)}</td>
                        <td>
                          <span className={`main-dash-status main-dash-status-${row.status}`}>
                            {row.status === 'overdue' ? 'Overdue' : 'Active'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <p className="muted">Fix the error above and reload the page (View → Reload).</p>
      )}

      <CustomerFormModal
        open={customerOpen}
        onClose={() => setCustomerOpen(false)}
        onSaved={() => setRefreshKey((key) => key + 1)}
        onError={setError}
      />
    </div>
  )
}
