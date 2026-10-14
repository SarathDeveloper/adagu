-- Adagu lifecycle backfill.
--
-- 1. A renewal wrote a `transfer` payment that moved principal to the new
--    ticket. That is bookkeeping, not money received, so it must not sit in
--    amount_collected (the drawer's "Collected" and every report read it).
--    syncPledgeCollected now skips `mode = 'transfer'`; this fixes old rows.
UPDATE pledges
SET amount_collected = (
  SELECT COALESCE(SUM(pp.amount), 0)
  FROM pledge_payments pp
  WHERE pp.pledge_id = pledges.id AND pp.mode != 'transfer'
)
WHERE EXISTS (SELECT 1 FROM pledge_payments pp WHERE pp.pledge_id = pledges.id);

-- 2. A renewal used to leave the old ticket's redeemed_date NULL, so the list
--    and reports had no close date for it. The new ticket's pledge_date is the
--    renewal date, so it inherits that.
UPDATE pledges
SET redeemed_date = (
  SELECT n.pledge_date
  FROM pledges n
  WHERE n.renewed_from_id = pledges.id
  ORDER BY n.id
  LIMIT 1
)
WHERE status = 'renewed'
  AND redeemed_date IS NULL
  AND EXISTS (SELECT 1 FROM pledges n WHERE n.renewed_from_id = pledges.id);
