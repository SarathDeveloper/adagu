-- UPI (or bank) transaction reference typed at the counter for a collection.
ALTER TABLE pledge_payments ADD COLUMN reference TEXT NOT NULL DEFAULT '';

-- The reminder log now records the morning queue: what was sent, what was
-- skipped, the exact message and who sent it. Receipt messages sent after a
-- collection point at the payment they confirm.
ALTER TABLE pledge_reminders ADD COLUMN status TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE pledge_reminders ADD COLUMN message TEXT NOT NULL DEFAULT '';
ALTER TABLE pledge_reminders ADD COLUMN sent_by TEXT NOT NULL DEFAULT '';
ALTER TABLE pledge_reminders ADD COLUMN payment_id INTEGER
  REFERENCES pledge_payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pledge_reminders_sent_at ON pledge_reminders(sent_at);
