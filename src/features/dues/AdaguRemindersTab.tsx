import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, MessageCircle, Percent, Send } from 'lucide-react'
import { whatsAppUrlText } from '@shared/adagu/reminders'
import type { PledgeReminderEntry } from '@shared/types'
import { DataTable } from '../../components/DataTable'
import { EmptyState } from '../../components/EmptyState'
import { LoadingState } from '../../components/LoadingState'
import { formatCurrency, formatDisplayDate, formatDisplayDateTime } from '../../lib/format'
import { ReminderQueueModal } from './ReminderQueueModal'
import { isQueueable, reasonInfo } from './reminderLabels'

type BucketFilter = 'all' | PledgeReminderEntry['bucket']

const BUCKETS: { value: BucketFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'week', label: 'This week' },
  { value: 'later', label: 'Later' },
]

export function AdaguRemindersTab({
  rows,
  loading,
  busy,
  onWhatsApp,
  onCollectInterest,
  onQueueSend,
  onQueueSkip,
}: {
  rows: PledgeReminderEntry[]
  loading: boolean
  busy?: boolean
  onWhatsApp: (row: PledgeReminderEntry) => void
  onCollectInterest: (row: PledgeReminderEntry) => void
  onQueueSend: (row: PledgeReminderEntry) => Promise<boolean>
  onQueueSkip: (row: PledgeReminderEntry) => Promise<boolean>
}) {
  const [bucket, setBucket] = useState<BucketFilter>('all')
  const [queue, setQueue] = useState<PledgeReminderEntry[] | null>(null)

  const counts = useMemo(() => {
    const next: Record<BucketFilter, number> = { all: rows.length, overdue: 0, today: 0, week: 0, later: 0 }
    for (const row of rows) next[row.bucket] += 1
    return next
  }, [rows])

  const visible = useMemo(
    () => (bucket === 'all' ? rows : rows.filter((row) => row.bucket === bucket)),
    [rows, bucket],
  )
  // "All" queues the morning list: overdue, today and this week, not loans maturing later.
  const toSend = visible.filter((row) => isQueueable(row) && (bucket !== 'all' || row.bucket !== 'later'))
  const sentToday = rows.filter((row) => row.remindedToday).length

  if (loading) {
    return <LoadingState />
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No reminders"
        description="Interest due, maturing loans and auction-ready tickets will appear here."
      />
    )
  }

  return (
    <>
      <div className="reminder-queue-bar">
        <div className="filter-bar reminder-queue-filters" role="tablist">
          {BUCKETS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={bucket === option.value}
              className={`filter-chip${bucket === option.value ? ' active' : ''}`}
              onClick={() => setBucket(option.value)}
            >
              {option.label}
              <span className="filter-chip-count">{counts[option.value]}</span>
            </button>
          ))}
        </div>
        <div className="reminder-queue-start">
          <span className="muted">
            {sentToday > 0 ? `${sentToday} sent today` : 'None sent yet today'}
          </span>
          <button
            type="button"
            className="btn"
            disabled={busy || toSend.length === 0}
            onClick={() => setQueue(toSend)}
            title={
              toSend.length === 0
                ? 'Everything in this list was already sent or skipped today'
                : 'Open each chat in WhatsApp, one after another'
            }
          >
            <Send size={15} strokeWidth={1.75} aria-hidden />
            Start sending ({toSend.length})
          </button>
        </div>
      </div>
      <p className="adagu-reminders-hint">
        Reminders open WhatsApp Desktop with a ready-made message. Each send or skip is logged with the time and
        who sent it.
      </p>
      {visible.length === 0 ? (
        <EmptyState title="Nothing in this group" description="Pick another group above." />
      ) : (
        <DataTable>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Customer</th>
                <th>Receipt No</th>
                <th>Reason</th>
                <th>Due</th>
                <th className="num">Interest Due</th>
                <th>Reminder</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) => {
                const info = reasonInfo(row.reason)
                return (
                  <tr key={`${row.pledgeId}-${row.reason}`}>
                    <td>{String(index + 1).padStart(2, '0')}</td>
                    <td>
                      <div className="cell-truncate" title={row.customerName}>
                        {row.customerName}
                      </div>
                      <span className="muted">{row.customerPhone || '—'}</span>
                    </td>
                    <td className="dues-adagu-receipt">
                      <Link to={`/adagu/${row.pledgeId}`}>{row.receiptNo}</Link>
                    </td>
                    <td>
                      <span className={`adagu-reminder-badge adagu-reminder-badge--${info.tone}`}>
                        {info.label}
                      </span>
                    </td>
                    <td className={row.daysUntil < 0 ? 'adagu-reminder-overdue' : ''}>
                      {row.dueDate ? formatDisplayDate(row.dueDate) : '—'}
                      {row.daysUntil < 0 ? ` (${Math.abs(row.daysUntil)}d late)` : row.daysUntil === 0 ? ' (today)' : ''}
                    </td>
                    <td className="num">{formatCurrency(row.interestDue)}</td>
                    <td>
                      {row.remindedToday ? (
                        <span className="reminder-state reminder-state--sent">Sent today</span>
                      ) : row.skippedToday ? (
                        <span className="reminder-state reminder-state--skipped">Skipped today</span>
                      ) : row.lastRemindedAt ? (
                        <span className="muted">{formatDisplayDateTime(row.lastRemindedAt)}</span>
                      ) : (
                        <span className="muted">Never</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={busy || !row.whatsappUrl}
                          title={
                            row.whatsappUrl
                              ? whatsAppUrlText(row.whatsappUrl)
                              : 'Add a mobile number to remind'
                          }
                          onClick={() => onWhatsApp(row)}
                        >
                          <MessageCircle size={14} strokeWidth={1.75} aria-hidden />
                          WhatsApp
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={busy || row.interestDue <= 0}
                          onClick={() => onCollectInterest(row)}
                        >
                          <Percent size={14} strokeWidth={1.75} aria-hidden />
                          Interest
                        </button>
                        <Link className="btn ghost" to={`/adagu/${row.pledgeId}`}>
                          <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
                          Open
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </DataTable>
      )}

      {queue ? (
        <ReminderQueueModal
          rows={queue}
          onSend={onQueueSend}
          onSkip={onQueueSkip}
          onClose={() => setQueue(null)}
        />
      ) : null}
    </>
  )
}
