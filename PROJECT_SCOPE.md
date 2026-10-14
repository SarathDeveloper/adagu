# AdaguTrackerPro — Project Scope

Fullstack software for a jewellery pawn shop's **Adagu (pledge loan)** and **Gold Savings** business. Runs as a Tauri desktop app that starts a local API on `127.0.0.1`, and still runs as a localhost web app for development.

This edition ships separately from the full JewelTrackerPro: its own product name, identifier and user-data folder, so both can be installed on the same machine without sharing data.

---

## 1. Product overview

| Aspect | Detail |
|--------|--------|
| **Product name** | AdaguTrackerPro |
| **Identifier** | `com.jeweltrackerpro.adagu` |
| **Type** | Fullstack app (Express + React) packaged as a Tauri desktop app |
| **Platforms** | Windows and macOS desktop; also runs in a browser on localhost |
| **Data** | SQLite database, one file per installation |
| **Primary users** | Shop counter staff and owners (admin and staff roles) |
| **Core purpose** | Run Adagu pledge loans (sanction, monthly interest, extra loan, renew, redeem, forfeit, auction), run monthly gold savings schemes (enroll, collect, mature, pay out in cash), keep customer dues, and report on both |
| **Version** | 1.0.0 |

### How it runs

- In production the Tauri shell (`src-tauri/src/main.rs`) starts the bundled Node API sidecar on a random `127.0.0.1` port, waits for `GET /api/version`, then opens the webview at that URL.
- The same Express app serves the built `dist/` front end, so a plain `npm run dev` browser session works too (Vite on 5173, API on 3000).
- The window receives an injected `window.desktopAPI` for native save-file and folder pickers. In a browser those fall back to normal downloads.
- Database location: `%APPDATA%\AdaguTrackerPro\jeweltrackerpro.db` on Windows, `~/Library/Application Support/AdaguTrackerPro/jeweltrackerpro.db` on macOS (`JEWELTRACKERPRO_DATA_DIR`), or `data/jeweltrackerpro.db` in dev. The first desktop launch moves an existing `JewelTrackerPro Adagu` folder to `AdaguTrackerPro` when the new folder is not already there.

### Main modules (sidebar)

1. Dashboard
2. Adagu (top tabs: Receipts / New Adagu)
3. Gold Savings (top tabs: Dashboard, Schemes, Enroll, Accounts, Collections, Ledger, Maturity, Overdue, Reports)
4. Dues
5. Customers
6. Reports
7. Gold & Silver Rates
8. Users (admin only)
9. Settings

Retired paths still resolve: `/billing/*` and `/invoices/*` redirect to `/adagu`; `/inventory/*`, `/products`, `/stock`, `/suppliers` and `/inwards/*` redirect to `/dashboard`.

### Explicitly out of scope

There is **no** cash bill, tax invoice or quotation; no invoicing at all. There are **no** products, piece stock, weight stock, stock ledger, stock categories, inwards/purchase, old-gold purchases/lots/batches, suppliers, metal day closings, or stocktakes. Pledge auctions never post anything to stock.

---

## 2. Authentication & users

Role-based access for shop staff and owners.

### Capabilities

- **Login** with username + password (HttpOnly session cookie, 12-hour expiry)
- **Change password** flow (first sign-in forces a change)
- **Roles**: **admin** (full access) and **staff** (feature-scoped)
- **Feature permissions** per staff user: `dashboard`, `adagu`, `gold_savings`, `customers`, `dues`, `reports`, `rates`, `settings`
- **Users page** (admin only): add, edit, activate/deactivate, set role and feature access, reset password, delete
- A default `admin` account (`admin123`, must change on first sign-in) is created on first run

### Feature gating

| Feature | Routes / API |
|---------|--------------|
| `dashboard` | `/dashboard` |
| `adagu` | `/adagu/*`, `/api/pledges` |
| `gold_savings` | `/gold-savings/*`, `/api/gold-savings` |
| `customers` | `/customers`, `/api/customers` |
| `dues` | `/dues`, `/api/dues` |
| `reports` | `/reports/*`, `/api/reports` |
| `rates` | `/rates`, `/api/metal-rates` |
| `settings` | `/settings`, `/api/settings`, `/api/backup` |
| Users | `/users`, `/api/users` (always admin-only) |

The sidebar hides features a user lacks, and visiting a denied route redirects to that user's first allowed page.

### Session notes

- Sessions are held in memory on the server, so restarting the API or app signs everyone out.
- Every request resolves the session and loads the current user; deactivating a user immediately signs them out.

---

## 3. Dashboard

A counter summary from `GET /api/dashboard`. Due Soon and Overdue use each pledge's repayment due date.

### KPIs

| Metric | Description |
|--------|-------------|
| **Total Customers** | Every customer, plus how many were added in the last 7 days |
| **Active Pledges** | Pledges with status `active`, plus how many of those are dated in the last 7 days |
| **Today's Pledges** | Non-draft pledges dated today, and the sum of their loan amounts |
| **Due Soon** | Active pledges whose repayment date is today through the next 30 days |
| **Overdue** | Active pledges whose repayment date is before today |

### Panels and tools

- Search for customers (name or phone) and pledges (receipt or customer name)
- Bell for overdue pledges, pledges due within 30 days, and Gold Savings alerts when that module is available
- **New Customer** opens the customer form. **New Pledge** opens a new Adagu loan
- **Attention Required (Due Soon & Overdue)** lists those pledges: customer, principal (loan plus top-ups), start date, due date, and an Overdue or Active pill. Overdue rows come first

---

## 4. Adagu (pledges)

Pledge loans. A pledge carries the borrower, one or more jewellery items, the assessed value, the loan amount, and the monthly interest percentage.

### Pledge editor

| Field | Notes |
|-------|-------|
| Bill date | ISO date; defaults to today |
| Bill number | Generated as `ADG…` |
| Customer | Search an existing customer or add one inline; mobile required |
| Address / KYC | Aadhaar or PAN when the shop requires KYC before sanctioning |
| Items | Description, metal, purity, gross weight, stone/deduction weight, net weight, pieces, rate/gm, value |
| Assessed value | Total item value; can be typed or derived from the day's rate |
| Loan amount | Limited to the shop's LTV % of assessed value, with an admin override |
| Deduction | Amount withheld from the loan at sanction (e.g. processing) |
| Interest rate | Monthly %, defaulted from Adagu POS settings |
| Photos | Item photos, auto-saved with the draft |

### Lifecycle

- **Draft** — save, edit, or delete a draft.
- **Sanction** — generates the ADG receipt and a printable pledge receipt; the loan is locked against editing.
- **Interest collections** — the monthly interest is computed by the pledge ledger. Part-months follow the period engine: the first 30 days (or any part of the first month) cost a full month, 1–15 days of a later month cost half, 16–29 days cost a full month.
- **Extra loan (top-up)** — increases principal as its own tranche, so it charges its own minimum month from the top-up date. The principal outstanding on the top-up date plus the new amount must stay inside the shop's LTV band, unless an admin ticks **Allow above LTV**.
- **Renew** — closes the ticket on the renewal date and opens a fresh ADG ticket carrying the outstanding principal. The old ticket records `redeemed_date` and a default note `Renewed from <receipt>`; it shows the shop's **current** rate, and the Renew window compares it with the old ticket's rate. The principal it carries over is a `transfer`, so it is never counted as money collected. A renewal that grows the loan is checked against LTV like a top-up, with the same admin override.
- **Redeem / full redeem** — collects the payoff for the chosen close date (the window refetches the payoff whenever the date changes), closes the loan, and prints a gold release receipt.
- **Discounts and payment modes** — a discount is applied to interest first; collections record cash/UPI/card/bank modes.
- **Forfeit** — marks the loan forfeited without any stock posting.
- **Auction** — send an auction notice, then record the auction on or after the notice date. The buyer is either an outside buyer or the shop. **Neither path posts to stock.** Interest stops accruing on the auction date, and a shortfall can be written off or **collected later** from the forfeited loan ("Collect shortfall"); the shortfall never grows after the auction.
- **Undo last payment** — an admin can remove the latest payment on an active or redeemed loan from the Dues drawer. Undoing a redemption reopens the loan; structural payments (transfer, renewal, auction) and renewed loans are blocked.
- **Reminders** — an overdue list with a WhatsApp reminder opener using the configured message template.

### Dues integration

Each pledge keeps a single `due` row in `customer_dues` holding principal + interest − discounts, and every collection writes a `payment` row, so the customer balance is always `due − payments`. Renewals and closures keep both tickets visible in the dues list. The Adagu loan list shows each active loan's live outstanding payoff (principal, top-ups and interest to date), and the customer-wise report counts a renewed chain once.

### POS settings (Settings → Adagu Settings)

- Pawnbroker licence no.
- Adagu LTV (% of assessed value)
- Adagu monthly interest (%)
- Auction notice period (days)
- Require KYC (Aadhaar or PAN) before sanctioning
- WhatsApp reminder message template

---

## 5. Gold Savings

Monthly savings schemes where a customer pays installments and earns gold grams.

### Scheme configuration

- Name, description, duration in months, status
- Monthly / minimum / maximum installment
- Gold purity and gold rate source, rate unit
- Bonus type (none, additional gold, etc.) and bonus value, with eligibility rules
- Grace period, late fee (flat or per day), cancellation deduction
- Making charge and wastage rule notes
- Availability window, terms and conditions
- Toggles: allow late payments, allow missed installments, allow early closure, allow partial redemption, allow multiple accounts per customer

The redemption *type* column is retained in the database but not shown in the UI: this edition only pays out in cash, so the field is fixed.

### Enrollment & collections

- **Enroll** a customer into a scheme with a first installment and accepted terms; prints an enrollment receipt and passbook.
- **Collections** — collect the next installment, several installments in one batch (one receipt), reverse a payment, and reprint receipts.
- **Accounts** — list and detail with installment schedule, payments, ledger and status.
- **Ledger** — the scheme ledger across accounts.
- **Overdue** — aging buckets for late installments.
- **Reports** — daily collections, overdue installments, redemption history (with payout amount and mode).

### Maturity payout

Redemptions are **payout only**: the shop hands over cash, UPI or bank transfer, never gold or jewellery, and no bill is raised.

- Amount = `(accumulated grams + bonus grams) × gold rate for the scheme purity` on the redemption date, rounded to money.
- The rate is resolved through the same rate-date rule as collections; a rate not dated on the redemption date needs an admin to accept it.
- Full payout closes the account; partial payout is only allowed where the scheme permits it, and early closure follows the scheme's rule.
- The payout records the applied `gold_rate`, `payout_amount`, `payment_mode` and `transaction_ref`, writes a `redemption` ledger entry, and prints a payout voucher at `/print/gs-payout/:id`.

---

## 6. Dues

The customer money ledger, Adagu-only in this edition (no tab switcher).

- **Adagu dues** list: customer, receipt, principal, monthly interest, next due, days, total due, remaining.
- Detail drawer with loan summary, pledged gold, photos, due summary, payment history and actions (collect interest, extra loan, redeem, renew, auction notice/record, print notice, bill preview, release receipt).
- Filters include Active, Closed, Auctioned and Reminders.
- **Manual dues** can be added for a customer without a pledge; they are guarded so a pledge-linked due cannot be edited directly.
- Balance = dues − payments, per customer.

---

## 7. Customers

- List with search by name/phone, add, edit, delete.
- Deleting a customer is blocked while they hold a Gold Savings account.
- Profile drawer shows contact details plus a financial summary (total paid, outstanding, active Adagu loans, interest due), the customer's Adagu loans, Gold Savings accounts, payment history and due history.

---

## 8. Reports

Reports open from `/reports` (defaults to Active Pledges) and are grouped into Adagu/pledge and customer reports.

| Report | Group | Date scope |
|--------|-------|-----------|
| Active Pledges | Adagu / Pledge | none |
| Closed Pledges | Adagu / Pledge | range |
| Due / Overdue Pledges | Adagu / Pledge | as of |
| Customer-wise Pledges | Adagu / Pledge | none |
| Pledge Transactions | Adagu / Pledge | range |
| Adagu Interest Income | Adagu / Pledge | range |
| Adagu Collections by Mode | Adagu / Pledge | range |
| Adagu Discounts | Adagu / Pledge | range |
| Adagu Auctions | Adagu / Pledge | range |
| Customer List | Customer | none |
| Customer Outstanding | Customer | none |

Reports take an optional date range and customer filter, and export to Excel/print. Gold Savings reports live on the Gold Savings Reports tab.

---

## 9. Gold & Silver Rates

- Daily metal rates: gold 24K / 22K / 20K / 18K, silver fine and silver 925.
- Effective-dated; the latest rate in force on a date is used for valuation and Gold Savings payouts.
- A rate that is not dated on the transaction date requires an admin to accept it.

---

## 10. Settings

Tabs: **Adagu Settings**, **Printers**, **Backup**, **Data**.

### Adagu Settings

- **Shop identity**: name, GSTIN, tagline, phones, app subtitle, address, city/state/pincode; logo, signature, BIS logo, QR code, proprietor lines, promo line; Gold Savings passbook banner and side image.
- **Adagu receipt template**: Test Print opens the Adagu sample in the print preview.
- **Adagu POS Settings**: pawnbroker licence, LTV %, monthly interest %, auction notice days, KYC requirement, WhatsApp template.

### Printers

- Adagu receipt paper size (A5 / A4 / Thermal 80 mm) and copies.
- Gold Savings vouchers print from the browser.

### Backup

- **Back up now**, download a copy, export every table to Excel, and restore from a `.db` file.
- Required tables on restore: `customers`, `pledges`, `gold_saving_accounts`.
- Automatic daily backup with a configurable time, plus an optional off-machine folder copy (network share / USB).
- A backup produced by the full JewelTrackerPro app restores here.

### Data

- App version, log folder, and record counts (customers).

---

## 11. Data model & migrations

- SQLite via `better-sqlite3`; migrations are plain `.sql` files under `server/db/migrations/` applied in order.
- Every migration from the full app is retained, so the schema history is intact and a full-app backup can restore. Tables for removed modules stay empty and unused.
- New behaviour lives in new migrations: `062_adagu_feature_key.sql` (maps old `billing` permissions to `adagu` and drops removed keys) and `063_gs_payout_redemption.sql` (rebuilds `gold_saving_redemptions` to allow the `payout` kind and store `gold_rate`, `payout_amount`, `payment_mode`, `transaction_ref`).

---

## 12. Desktop packaging

- Tauri 2 shell, Node SEA sidecar, NSIS installer on Windows and an ad-hoc-signed DMG on Apple Silicon.
- Product name **AdaguTrackerPro**, identifier `com.jeweltrackerpro.adagu`, own data folder.
- Windows installer: `npm run tauri:build:win`, copied to `release/AdaguTrackerPro-Setup-1.0.0.exe`.
- macOS installer: `npm run tauri:build:mac` on a Mac, copied to `release/AdaguTrackerPro-Setup-1.0.0-mac-arm64.dmg`. The app bundle is `AdaguTrackerPro.app`.
- The build pipeline, its invariants, and the verification steps are documented in `.cursor/rules/tauri-build-setup.mdc`.

---

## 13. Printing

Print documents are a separate, small `print.html` entry so a preview frame never boots the whole application.

| Route | Document |
|-------|----------|
| `/print/pledge/:id` | Adagu pledge receipt |
| `/print/pledge-release/:id` | Gold release receipt |
| `/print/pledge-notice/:id` | Auction notice |
| `/print/gs-receipt/:id` | Gold Savings collection receipt / passbook |
| `/print/gs-passbook/:id` | Gold Savings passbook |
| `/print/gs-batch-receipt/:id` | Batch collection receipt |
| `/print/gs-refund/:id` | Gold Savings refund voucher |
| `/print/gs-call-list` | Overdue call list (bucket filter) |
| `/print/gs-payout/:id` | Maturity payout voucher |
| `/print/sample/adagu` | Settings sample template |

On Windows previews render in an iframe; on macOS the app prints through the native webview.

---

## 14. Testing

| Suite | Command | Covers |
|-------|---------|--------|
| Unit + integration | `npm run test:integration` | Vitest against a temp SQLite DB: services, routes, migrations, permissions, reports, Gold Savings payout |
| E2E (web) | `npm run test:e2e` | Playwright against a built app and a throwaway DB: auth, dashboard, customers, dues, Gold Savings, settings, mobile layout, print routes |
| E2E (live desktop) | `npm run test:tauri-e2e` | Adagu scenarios against `npm run tauri:dev` and real data (run on a shop copy) |

The protected print test asserts that a `/print/*` frame loads the print chunk, never `main-*.js`, and never calls `/api/auth/me`.

---

## 15. Docs

- `README.md` — setup, dev, desktop builds, printing.
- `docs/user-manual.md` — shop-staff guide for sign-in, shop setup, Adagu, Gold Savings cash payout, dues, customers, reports, rates, settings, users, and printing.
- `.cursor/rules/` — protected setups (desktop build, print preview, module tabs, date format).
