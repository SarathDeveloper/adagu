-- Maturity is paid out in cash/UPI/bank, not as gold or jewellery.
--
-- Rebuild the redemptions table so `redemption_kind` accepts 'payout' and the
-- payout metadata (gold rate, amount, mode, reference) can be stored. The old
-- kinds stay in the CHECK list so rows written by the full app can still be
-- read. Migrations run with `foreign_keys = OFF` and nothing references this
-- table, so a copy-and-rename is safe.

CREATE TABLE gold_saving_redemptions_rebuild (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  receipt_no TEXT NOT NULL UNIQUE,
  redemption_date TEXT NOT NULL,
  redemption_kind TEXT NOT NULL CHECK (redemption_kind IN ('gold', 'jewellery', 'invoice', 'payout')),
  gold_weight REAL NOT NULL,
  bonus_gold_weight REAL NOT NULL DEFAULT 0,
  invoice_id INTEGER,
  making_charges REAL NOT NULL DEFAULT 0,
  wastage REAL NOT NULL DEFAULT 0,
  taxes REAL NOT NULL DEFAULT 0,
  invoice_value REAL NOT NULL DEFAULT 0,
  remaining_gold REAL NOT NULL DEFAULT 0,
  closes_account INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  gold_rate REAL NOT NULL DEFAULT 0,
  payout_amount REAL NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL DEFAULT 'cash',
  transaction_ref TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (account_id) REFERENCES gold_saving_accounts(id) ON DELETE RESTRICT
);

INSERT INTO gold_saving_redemptions_rebuild (
  id, account_id, receipt_no, redemption_date, redemption_kind, gold_weight,
  bonus_gold_weight, invoice_id, making_charges, wastage, taxes, invoice_value,
  remaining_gold, closes_account, notes, created_by, created_at
)
SELECT
  id, account_id, receipt_no, redemption_date, redemption_kind, gold_weight,
  bonus_gold_weight, invoice_id, making_charges, wastage, taxes, invoice_value,
  remaining_gold, closes_account, notes, created_by, created_at
FROM gold_saving_redemptions;

DROP TABLE gold_saving_redemptions;
ALTER TABLE gold_saving_redemptions_rebuild RENAME TO gold_saving_redemptions;

CREATE INDEX IF NOT EXISTS idx_gs_redemptions_account ON gold_saving_redemptions(account_id);
