-- The assessed value taken off the loan when a jewel was released. Undo adds
-- back exactly this amount, so release and undo stay symmetric even when the
-- assessed value differs from the sum of item values or an item has no value.
-- Rows released before this column existed stay NULL and fall back to
-- item_value, which is what was subtracted at the time.
ALTER TABLE pledge_items ADD COLUMN released_assessed_value REAL;
