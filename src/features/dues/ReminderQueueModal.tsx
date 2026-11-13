import { useState } from 'react'
import { CheckCircle2, MessageCircle, SkipForward } from 'lucide-react'
import { whatsAppUrlText } from '@shared/adagu/reminders'
import type { PledgeReminderEntry } from '@shared/types'
import { Modal } from '../../components/Modal'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { reasonInfo } from './reminderLabels'

type Outcome = 'sent' | 'skipped'

/**
 * The morning reminder queue: one loan at a time, open the chat in WhatsApp
 * Desktop (which logs it as sent), press Enter there, come back and go on.
 */
export function ReminderQueueModal({
  rows,
  onSend,
  onSkip,
  onClose,
}: {
  rows: PledgeReminderEntry[]
  onSend: (row: PledgeReminderEntry) => Promise<boolean>
  onSkip: (row: PledgeReminderEntry) => Promise<boolean>
  onClose: () => void
}) {
  const [index, setIndex] = useState(0)
  const [outcomes, setOutcomes] = useState<Outcome[]>([])
  const [opened, setOpened] = useState(false)
  const [working, setWorking] = useState(false)

  const done = index >= rows.length
  const row = done ? null : rows[index]
  const sent = outcomes.filter((outcome) => outcome === 'sent').length
  const skipped = outcomes.filter((outcome) => outcome === 'skipped').length

  function advance(outcome: Outcome) {
    setOutcomes((current) => [...current, outcome])
    setOpened(false)
    setIndex((current) => current + 1)
  }

  async function open() {
    if (!row) return
    setWorking(true)
    const ok = await onSend(row)
    setWorking(false)
    if (ok) setOpened(true)
  }

  async function skip() {
    if (!row) return
    setWorking(true)
    const ok = await onSkip(row)
    setWorking(false)
    if (ok) advance('skipped')
  }

  const footer = done ? (
    <div className="modal-actions">
      <button type="button" className="btn" onClick={onClose} autoFocus>
        Close
      </button>
    </div>
  ) : (
    <div className="modal-actions">
      <button type="button" className="btn secondary" onClick={onClose} disabled={working}>
        Stop
      </button>
      {opened ? null : (
        <button type="button" className="btn secondary" onClick={() => void skip()} disabled={working}>
          <SkipForward size={15} strokeWidth={1.75} aria-hidden />
          Skip
        </button>
      )}
      {opened ? (
        <button type="button" className="btn" onClick={() => advance('sent')} autoFocus>
          {index + 1 < rows.length ? 'Next customer →' : 'Finish'}
        </button>
      ) : (
        <button type="button" className="btn" onClick={() => void open()} disabled={working} autoFocus>
          <MessageCircle size={15} strokeWidth={1.75} aria-hidden />
          {working ? 'Opening…' : 'Open in WhatsApp'}
        </button>
      )}
    </div>
  )

  return (
    <Modal title="Send reminders" onClose={onClose} busy={working} footer={footer} className="reminder-queue-modal">
      <div className="reminder-queue-progress" aria-live="polite">
        <span>
          {done ? `${rows.length} of ${rows.length}` : `${index + 1} of ${rows.length}`}
        </span>
        <span className="muted">
          {sent} sent · {skipped} skipped
        </span>
        <div className="reminder-queue-progress-bar" aria-hidden>
          <span style={{ width: `${(Math.min(index, rows.length) / Math.max(rows.length, 1)) * 100}%` }} />
        </div>
      </div>

      {done ? (
        <div className="reminder-queue-done">
          <CheckCircle2 size={32} strokeWidth={1.75} aria-hidden />
          <strong>Queue finished</strong>
          <span>
            {sent} reminder{sent === 1 ? '' : 's'} sent, {skipped} skipped. They are logged against each loan.
          </span>
        </div>
      ) : row ? (
        <div className="reminder-queue-card">
          <div className="reminder-queue-head">
            <div>
              <strong>{row.customerName}</strong>
              <span className="muted">
                {row.customerPhone} · {row.receiptNo}
              </span>
            </div>
            <span className={`adagu-reminder-badge adagu-reminder-badge--${reasonInfo(row.reason).tone}`}>
              {reasonInfo(row.reason).label}
            </span>
          </div>
          <dl className="reminder-queue-facts">
            <div>
              <dt>Due</dt>
              <dd>
                {row.dueDate ? formatDisplayDate(row.dueDate) : '—'}
                {row.daysUntil < 0 ? ` (${Math.abs(row.daysUntil)}d late)` : ''}
              </dd>
            </div>
            <div>
              <dt>Interest due</dt>
              <dd>{formatCurrency(row.interestDue)}</dd>
            </div>
            <div>
              <dt>To close</dt>
              <dd>{formatCurrency(row.totalDue)}</dd>
            </div>
          </dl>
          <p className="reminder-queue-message">{row.whatsappUrl ? whatsAppUrlText(row.whatsappUrl) : ''}</p>
          {opened ? (
            <p className="reminder-queue-next">
              The chat is open in WhatsApp. Press <kbd>Enter</kbd> there to send, then come back and click{' '}
              <strong>{index + 1 < rows.length ? 'Next customer' : 'Finish'}</strong>.
            </p>
          ) : null}
        </div>
      ) : null}
    </Modal>
  )
}
