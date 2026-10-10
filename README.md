# JewelTrackerPro Adagu

Adagu (pledge loan) and Gold Savings software for a jewellery pawn shop. Tracks pledges from sanction through interest collections, renewals, redemption, forfeit and auction; and monthly gold savings schemes from enrollment through collections and a maturity cash payout. Ships as a **desktop app** (Windows and macOS) and can still run as a localhost web app.

This edition is intentionally small: there is no cash/tax billing, no invoicing, and no inventory or stock. It installs **beside** the full app (its own product name, identifier and data folder).

## Modules

- **Dashboard** — Adagu outstanding, active loans, overdue interest, month collections, Gold Savings collections today, maturities due, follow-ups and quick actions
- **Adagu** — pledge receipts list and the pledge editor (sanction, interest, extra loan, renew, redeem, auction, forfeit)
- **Gold Savings** — dashboard, schemes, enrollment, accounts, collections, ledger, maturity payout, overdue aging, reports
- **Dues** — Adagu-linked balances and manual customer dues
- **Customers** — customer records with pledges, scheme accounts and dues in the profile
- **Reports** — Adagu/pledge reports and two customer reports
- **Gold & Silver Rates** — daily metal rates used for valuation and Gold Savings payouts
- **Users** (admin only) — roles and per-feature access
- **Settings** — shop identity, Adagu settings and print template, printers, backup and data

## Stack

- **Desktop**: Tauri 2 (Windows NSIS installer, macOS DMG) with a Node sidecar for the Express API
- **Frontend**: React 19 + Vite + TypeScript + react-router
- **Backend**: Node.js + Express + Zod (localhost web, or packaged as the desktop sidecar)
- **Database**: SQLite via better-sqlite3

## Prerequisites

- Node.js **20+**
- npm **10+**
- **Desktop builds** need [Rust](https://www.rust-lang.org/tools/install) (`cargo` on your PATH) and the Tauri CLI (`npm install` provides `@tauri-apps/cli`). After installing Rust, open a **new** terminal so `cargo` is on PATH. `npm run tauri:dev` also prepends `%USERPROFILE%\.cargo\bin` automatically.
- The Windows sidecar is a Node [single executable](https://nodejs.org/api/single-executable-applications.html) (SEA) plus the `better-sqlite3` N-API prebuild. `pkg` is not used.
- **Windows shop PCs** need 64-bit Windows 10 (1809+) and the [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/). The installer can download it if it is missing.
- **Windows PCs** may also need the [Visual C++ Redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) (x64) if Windows reports a missing `VCRUNTIME` DLL
- **macOS installer builds** need Xcode command-line tools
- The Windows installer is produced with the NSIS 3.11 toolchain. `npm run nsis:prepare` (included in `npm run desktop:prepare`) caches it in `%LOCALAPPDATA%\tauri\NSIS` before bundling. Tauri downloads the same tools on its own, but on a slow or filtered GitHub connection that download hits its global HTTP timeout and the bundle fails with ``failed to bundle project: `timeout: global` `` after the app binary has already been compiled.

### Cross-compile the Windows installer from macOS

Cross-compiling the Windows installer from macOS needs a few extra tools. On the macOS build machine:

```bash
rustup target add x86_64-pc-windows-msvc
cargo install cargo-xwin
brew install nsis
npm run tauri:build:win
```

If `cargo-xwin` or NSIS fails, build on a Windows machine or a Windows CI runner with the same `npm run tauri:build:win` command.

## Development (browser)

```bash
npm install
npm run dev
```

This starts the Vite frontend at `http://localhost:5173` and the Express API at `http://localhost:3000`. Vite proxies `/api` and `/uploads` to the API. If port 3000 is already in use, set `PORT` to another port (PowerShell: `$env:PORT = "3001"`) before `npm run dev` or `npm run tauri:dev`. Vite follows the same `PORT`.

## Development (desktop)

```bash
npm run tauri:dev
```

This opens a Tauri window on the same Vite + Express process as `npm run dev`. WebView2 keeps GPU acceleration enabled on Windows; set `JEWELTRACKERPRO_SAFE_GRAPHICS=1` to fall back to software rendering on a machine whose graphics driver misbehaves.

## Packaged desktop app

```bash
npm run tauri:build      # installer for this OS
npm run tauri:build:win  # Windows NSIS .exe (Windows, or macOS with cargo-xwin)
npm run tauri:build:mac  # Apple Silicon .dmg (must run on a Mac)
```

Installers land in `src-tauri/target/release/bundle/` (or `src-tauri/target/<triple>/release/bundle/` for a cross target), and the Windows installer is copied to `release/JewelTrackerPro-Adagu-Setup-1.0.0.exe`. Shop data (database, uploads, logs, backups) is stored in the app's own user-data folder, so it sits beside a full JewelTrackerPro install:

- Windows: `%APPDATA%\JewelTrackerPro Adagu\`
- macOS: `~/Library/Application Support/JewelTrackerPro Adagu/`

### macOS (Apple Silicon)

The Mac build runs on the build machine only: run it on a Mac, not on Windows. It targets Apple Silicon (`aarch64-apple-darwin`) and produces a `.dmg`.

Prerequisites on the Mac:

- Xcode command-line tools (`xcode-select --install`)
- Rust (`cargo` on `PATH`) and Node.js **20+** from [nodejs.org](https://nodejs.org) or `nvm` (a Homebrew Node also works, but the official build is the safe choice)
- `npm install` once in the repository root

```bash
npm run tauri:build:mac
```

The build runs in order: the frontend, the Node sidecar (ad-hoc signed), the packaged-resource copy, a source check, the `aarch64-apple-darwin` bundle, then a packaged check. The packaged check verifies the code signature and boots the sidecar against a temporary data directory, so a signing mistake fails the build instead of the shop Mac.

Copy the result to `release/`:

```bash
cp src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/JewelTrackerPro\ Adagu_1.0.0_aarch64.dmg \
  release/JewelTrackerPro-Adagu-Setup-1.0.0-mac-arm64.dmg
```

The app is ad-hoc signed, not notarized with an Apple Developer ID, so the first launch on another Mac is blocked by Gatekeeper. On macOS 15 open **System Settings → Privacy & Security**, click **Open Anyway**, and confirm. On older versions right-click the app and choose **Open**. The alternative for either:

```bash
xattr -cr "/Applications/JewelTrackerPro Adagu.app"
```

If the window ever goes blank, what happened is written to `logs/crash.log` in that folder and reported with a `JTP-ERR-…` reference ID the user can quote. The log folder is also shown under **Settings → Data**.

## Production (localhost web)

```bash
npm run build
npm start
```

The Express server serves the built SPA from `dist/` plus the JSON API on `http://localhost:3000`.

## Database

- Web/dev SQLite file: `data/jeweltrackerpro.db` (override with `JEWELTRACKERPRO_DATA_DIR`)
- Desktop: same file name inside the app's own user-data folder above
- Shop images: `uploads/` under the data directory
- Use **Settings → Backup** to download or restore a `.db` file
- A daily backup is written to `backups/` under the data directory
- A backup from the full JewelTrackerPro app restores here: the required tables (`customers`, `pledges`, `gold_saving_accounts`) are present and the unused tables are simply ignored

## Project layout

```
src-tauri/  Tauri 2 desktop shell, sidecar binaries, and installer config
server/     Express API, SQLite, migrations
src/        React frontend
shared/     Types, Zod schemas, pledge and Gold Savings helpers
```

## Testing

```bash
npm run test:integration   # Vitest — API + SQLite
npm run test:e2e           # Build + Playwright web tests
npm test                   # Both suites
npm run test:tauri-e2e     # Live desktop scenarios (requires npm run tauri:dev)
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite + Express with reload |
| `npm run tauri:dev` | Desktop window with Vite hot reload |
| `npm run tauri:build` | Desktop installer for this OS |
| `npm run tauri:build:win` | Windows NSIS installer |
| `npm run tauri:build:mac` | macOS DMG |
| `npm run build` | Build the frontend |
| `npm run start` | Serve the built app and API |
| `npm run lint` | ESLint |
| `npm run test` | Integration + E2E tests |

## Printing

Documents open in a print preview served by a separate, lightweight `print.html` entry. Document routes:

- `/print/pledge/:id` — Adagu pledge receipt
- `/print/pledge-release/:id` — gold release receipt
- `/print/pledge-notice/:id` — auction notice
- `/print/gs-receipt/:id`, `/print/gs-passbook/:id`, `/print/gs-batch-receipt/:id` — Gold Savings receipts and passbook
- `/print/gs-refund/:id` — refund voucher
- `/print/gs-call-list` — overdue call list
- `/print/gs-payout/:id` — maturity payout voucher
- `/print/sample/adagu` — settings sample

Use the system print dialog to print or save as PDF. On macOS the app prints through the native webview instead of an iframe.
