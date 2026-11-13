-- Customer profile photo and KYC scans (Aadhaar / PAN). Files live in the
-- uploads folder under a random UUID name and are never overwritten; only the
-- relative /uploads path is stored here.
CREATE TABLE customer_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'aadhaar', 'pan')),
  path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT '',
  original_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customer_documents_customer ON customer_documents(customer_id);

-- Dated notes about a customer. Replaces the single free-text customers.notes
-- field on the profile; that column stays so older backups still restore.
CREATE TABLE customer_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON customer_notes(customer_id);

-- Carry each existing note over as the customer's first dated note.
INSERT INTO customer_notes (customer_id, body, created_by, created_at)
SELECT id, trim(notes), '', created_at
FROM customers
WHERE trim(notes) <> '';
