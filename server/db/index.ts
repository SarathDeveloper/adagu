import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { ensureDefaultAdmin, seedE2eAdmin } from '../auth/users'
import { logInfo } from '../lib/logger'
import { getDataDir } from '../lib/paths'
import { sqliteNativeOptions } from '../lib/sqliteNative'
import { getMigrations } from './migrations'
import { writePremigrateSnapshot } from './snapshot'
import { backfillLegacyPledgePayments } from '../pledges/backfill'

let db: Database.Database | null = null

function foreignKeyViolationCount(database: Database.Database): number {
  return database.prepare('PRAGMA foreign_key_check').all().length
}

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const applied = new Set(
    database
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
      .map((row) => (row as { version: number }).version),
  )

  const migrations = getMigrations()
  const hasPendingMigration = migrations.some((migration) => !applied.has(migration.version))
  if (hasPendingMigration && applied.size > 0) {
    // Never migrate without a rollback point: a migration that commits but is
    // wrong would otherwise be expensive to undo.
    writePremigrateSnapshot(database, Math.max(...applied))
  }

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue
    }

    const disableForeignKeys = migration.disableForeignKeys === true
    if (disableForeignKeys) {
      database.pragma('foreign_keys = OFF')
    }
    // With foreign keys off, SQLite does not stop a table rebuild from leaving
    // child rows that point at nothing. Compare against the count before the
    // migration so rows that were already orphaned do not block an upgrade.
    const violationsBefore = disableForeignKeys ? foreignKeyViolationCount(database) : 0
    database.exec('BEGIN')
    try {
      database.exec(migration.sql)
      if (disableForeignKeys) {
        const added = foreignKeyViolationCount(database) - violationsBefore
        if (added > 0) {
          throw new Error(
            `Migration ${migration.version} would leave ${added} row(s) pointing at missing records, so it was not applied`,
          )
        }
      }
      database
        .prepare('INSERT INTO schema_migrations (version) VALUES (?)')
        .run(migration.version)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    } finally {
      if (disableForeignKeys) {
        database.pragma('foreign_keys = ON')
      }
    }
  }
}

export function getUserDataDir(): string {
  return getDataDir()
}

const DB_FILE_NAME = 'pawndesk.db'
/** The database file name used before the PawnDesk rename. */
const LEGACY_DB_FILE_NAME = 'jeweltrackerpro.db'
/**
 * Files that belong to one database: the WAL and shared-memory files hold
 * committed rows that are not yet in the main file, and the last two are left
 * by an interrupted replace or restore (see recoverInterruptedReplace).
 */
const DB_COMPANION_SUFFIXES = ['-wal', '-shm', '.replacing', '.restore.tmp']

export function getDbPath(): string {
  return join(getUserDataDir(), DB_FILE_NAME)
}

/**
 * Renames a database left under the old file name, with its companion files,
 * so an install upgraded from AdaguTrackerPro opens its existing data.
 *
 * Runs only while nothing exists under the new name. Companions move before
 * the main file: if the move is interrupted, the main file is still under the
 * old name and the next start finishes the job (rename replaces any companion
 * already moved).
 */
export function migrateLegacyDbFile(dbPath: string): void {
  const legacyPath = join(dirname(dbPath), LEGACY_DB_FILE_NAME)
  const anyNew = ['', '.replacing', '.restore.tmp'].some((suffix) => existsSync(`${dbPath}${suffix}`))
  if (anyNew) return
  const anyLegacy = ['', '.replacing', '.restore.tmp'].some((suffix) => existsSync(`${legacyPath}${suffix}`))
  if (!anyLegacy) return
  for (const suffix of [...DB_COMPANION_SUFFIXES, '']) {
    if (existsSync(`${legacyPath}${suffix}`)) {
      renameSync(`${legacyPath}${suffix}`, `${dbPath}${suffix}`)
    }
  }
  logInfo('database', `Renamed ${legacyPath} to ${dbPath}`)
}

/**
 * Replacing the database moves the live file to `.replacing`, renames the new
 * one into place, then deletes `.replacing`. A crash between the two renames
 * leaves no database file at all. Opening it then would silently create an
 * empty database with the default admin login while the real data sits beside
 * it, so put the previous file back, or stop if only the new copy is there.
 */
export function recoverInterruptedReplace(dbPath: string): void {
  if (existsSync(dbPath)) return
  const holding = `${dbPath}.replacing`
  if (existsSync(holding)) {
    renameSync(holding, dbPath)
    logInfo('database', `Recovered the database from ${holding} after an interrupted replace`)
    return
  }
  const partial = `${dbPath}.restore.tmp`
  if (existsSync(partial)) {
    throw new Error(
      `A database restore was interrupted and the data file is missing. Your data is in ${partial}; contact support before using the app, so it is not replaced by an empty database.`,
    )
  }
}

export function initDatabase(): Database.Database {
  if (db) {
    return db
  }

  const dbPath = getDbPath()
  mkdirSync(dirname(dbPath), { recursive: true })
  migrateLegacyDbFile(dbPath)
  recoverInterruptedReplace(dbPath)
  db = new Database(dbPath, sqliteNativeOptions())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  backfillLegacyPledgePayments(db)
  if (process.env.PAWNDESK_E2E === '1') {
    seedE2eAdmin(db)
  } else {
    ensureDefaultAdmin(db)
  }
  return db
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
