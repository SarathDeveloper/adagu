-- The id of the loan's last payment when the top-up was recorded (0 when the
-- loan had none). A payment on the top-up's own date with a lower or equal id
-- was taken before the money went out, so replaying the ledger must not make
-- that payment owe the top-up's interest. Older top-ups stay NULL and keep the
-- previous rule (a same-day payment counts as after the top-up).
ALTER TABLE pledge_topups ADD COLUMN after_payment_id INTEGER;
