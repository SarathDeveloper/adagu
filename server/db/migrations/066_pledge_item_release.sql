-- A jewel can leave an open pledge. The payment that released it is kept so
-- undoing that payment puts the jewel back and restores the assessed value.
ALTER TABLE pledge_items ADD COLUMN released_at TEXT;
ALTER TABLE pledge_items ADD COLUMN released_payment_id INTEGER
  REFERENCES pledge_payments(id) ON DELETE SET NULL;
