import { createHash } from 'node:crypto'
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import type { BackupFile, BackupInspection, BackupKind, BackupStatus } from '@shared/types'
import { backupKindForName } from '@shared/backupRetention'
import {
  CHANGE_BACKUP_INTERVAL_HOURS,
  DEFAULT_BACKUP_FREQUENCY,
  DEFAULT_BACKUP_TIME,
  isBackupDue,
  nextBackupAt,
  normalizeBackupSchedule,
  type BackupSchedule,
} from '@shared/backupSchedule'
import { localDateIso, localNowStamp, localTimeStamp } from '@shared/localDate'
import { getShopSetting, setShopSetting } from '../lib/settingsStore'
import { getBackupsDir, getDataDir, getUploadsDir } from '../lib/paths'
import { sqliteNativeOptions } from '../lib/sqliteNative'
import { HttpError } from '../lib/http'
import { logDiagnostic, logInfo } from '../lib/logger'
import { closeDatabase, getDatabase, getDbPath, initDatabase } from './index'
import { excelPathFor, writeExcelBackupFromSqliteFile } from './excelBackup'
import { getAppVersion } from '../lib/appPaths'
import { latestMigrationVersion } from './migrations'
import { isSameOrInside, offsiteDirError } from './offsitePath'
import { clearAllSessions } from '../auth/session'
import { prerestoreSnapshotName, pruneBackupFiles, removeBackupSiblings } from './snapshot'
import { writeZipFile, type ZipSource } from '../lib/zip'
import {
  BackupSecretError,
  type BackupSecret,
  decryptFile,
  ENCRYPTED_SUFFIX,
  encryptFile,
  isEncryptedFile,
} from '../lib/backupCrypto'
import { adoptBackupKey, loadBackupKey } from './backupKey'

export const LAST_BACKUP_AT_KEY = 'last_backup_at'
export const LAST_SCHEDULED_BACKUP_AT_KEY = 'last_scheduled_backup_at'
export const BACKUP_FREQUENCY_KEY = 'backup_frequency'
export const BACKUP_TIME_KEY = 'backup_time'
export const OFFSITE_DIR_KEY = 'backup_offsite_dir'
export const LAST_OFFSITE_AT_KEY = 'last_offsite_at'
export const LAST_OFFSITE_ERROR_KEY = 'last_offsite_error'
export const LAST_OFFSITE_SOURCE_KEY = 'last_offsite_source'
export const LAST_BACKUP_ERROR_KEY = 'last_backup_error'

const BACKUP_STATE_KEYS = [
  BACKUP_FREQUENCY_KEY,
  BACKUP_TIME_KEY,
  OFFSITE_DIR_KEY,
  LAST_OFFSITE_AT_KEY,
  LAST_OFFSITE_ERROR_KEY,
  LAST_OFFSITE_SOURCE_KEY,
  LAST_BACKUP_AT_KEY,
  LAST_SCHEDULED_BACKUP_AT_KEY,
  LAST_BACKUP_ERROR_KEY,
] as const

const LOCAL_BACKUP_RETRY_MS = 15 * 60 * 1000
const changeBaseline = new WeakMap<Database.Database, number>()
let cooldownDatabase: Database.Database | null = null
let localBackupFailedAt = 0

const RESTORE_REQUIRED_TABLES = [
  'schema_migrations',
  'users',
  'shop_settings',
  'customers',
  'pledges',
  'gold_saving_accounts',
] as const

/**
 * Serialises every operation that reads or replaces the database files, so a
 * scheduled backup, an off-machine copy, a manual backup, a day-close backup
 * and a restore can never overlap.
 */
let queue: Promise<unknown> = Promise.resolve()
let pendingTasks = 0

export function withBackupLock<T>(task: () => Promise<T>): Promise<T> {
  pendingTasks += 1
  const run = queue.then(async () => {
    try {
      return await task()
    } finally {
      pendingTasks -= 1
    }
  })
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export function isBackupBusy(): boolean {
  return pendingTasks > 0
}

export function getBackupSchedule(): BackupSchedule {
  const db = getDatabase()
  return normalizeBackupSchedule({
    frequency: getShopSetting(db, BACKUP_FREQUENCY_KEY, DEFAULT_BACKUP_FREQUENCY),
    time: getShopSetting(db, BACKUP_TIME_KEY, DEFAULT_BACKUP_TIME),
  })
}

function settingOrNull(key: string): string | null {
  return getShopSetting(getDatabase(), key, '') || null
}

function lastScheduledAnchor(): string | null {
  // Only the scheduled run updates this. A manual or day-close backup must not
  // suppress the day's scheduled backup.
  return settingOrNull(LAST_SCHEDULED_BACKUP_AT_KEY)
}

export function getOffsiteDir(): string {
  return getShopSetting(getDatabase(), OFFSITE_DIR_KEY, '').trim()
}

export function protectedOffsiteRoots(): string[] {
  return [getDataDir(), getBackupsDir(), getDbPath()]
}

export function assertOffsiteDirAllowed(dir: string): void {
  const error = offsiteDirError(dir, protectedOffsiteRoots())
  if (error) {
    throw new HttpError(400, error)
  }
}

export function updateBackupSchedule(input: BackupSchedule & { offsiteDir?: string }): BackupStatus {
  const schedule = normalizeBackupSchedule(input)
  const db = getDatabase()
  setShopSetting(db, BACKUP_FREQUENCY_KEY, schedule.frequency)
  setShopSetting(db, BACKUP_TIME_KEY, schedule.time)
  if (input.offsiteDir !== undefined) {
    const next = input.offsiteDir.trim()
    if (next) {
      assertOffsiteDirAllowed(next)
    }
    const resolved = next && isAbsolute(next) ? resolve(next) : next
    const prev = getShopSetting(db, OFFSITE_DIR_KEY, '')
    if (prev !== resolved) {
      setShopSetting(db, LAST_OFFSITE_SOURCE_KEY, '')
      setShopSetting(db, LAST_OFFSITE_ERROR_KEY, '')
      setShopSetting(db, LAST_OFFSITE_AT_KEY, '')
    }
    setShopSetting(db, OFFSITE_DIR_KEY, resolved)
  }
  return getBackupStatus()
}

export function getBackupStatus(now = new Date()): BackupStatus {
  const lastBackupAt = settingOrNull(LAST_BACKUP_AT_KEY)
  const schedule = getBackupSchedule()
  const next = nextBackupAt(schedule, lastScheduledAnchor(), now)
  return {
    lastBackupAt,
    frequency: schedule.frequency,
    time: schedule.time,
    nextBackupAt: next ? next.toISOString() : null,
    offsiteDir: getOffsiteDir(),
    lastOffsiteAt: settingOrNull(LAST_OFFSITE_AT_KEY),
    lastOffsiteError: settingOrNull(LAST_OFFSITE_ERROR_KEY),
    lastBackupError: settingOrNull(LAST_BACKUP_ERROR_KEY),
    encrypted: backupKeyOrNull() !== null,
  }
}

/** This computer's backup key, or null when encryption is off (or its key file is unreadable). */
function backupKeyOrNull() {
  try {
    return loadBackupKey()
  } catch (error) {
    logDiagnostic('backup', 'Backup key could not be read', error)
    return null
  }
}

/**
 * Encryption must never silently fall back to writing plain copies, so a
 * damaged key file stops off-machine copies and exports with an error instead.
 */
function requireBackupKeyState() {
  return loadBackupKey()
}

function encryptedName(name: string, encrypted: boolean): string {
  return encrypted ? `${name}${ENCRYPTED_SUFFIX}` : name
}

/**
 * Decrypts an uploaded or exported `.pdenc` file into a temp file. Uses this
 * computer's key when it made the file, else the password or recovery key.
 */
export async function decryptBackupToTemp(
  sourcePath: string,
  secret: BackupSecret,
): Promise<{ path: string; adopt: () => void }> {
  const scratch = mkdtempSync(join(tmpdir(), 'pd-decrypt-'))
  const target = join(scratch, 'backup.bin')
  try {
    const unlocked = await decryptFile(sourcePath, target, { material: backupKeyOrNull(), secret })
    return {
      path: target,
      adopt: () => {
        if (adoptBackupKey(unlocked.dek, unlocked.wraps)) {
          logInfo('backup', "Adopted the restored backup's encryption key on this computer")
        }
      },
    }
  } catch (error) {
    rmSync(scratch, { recursive: true, force: true })
    if (error instanceof BackupSecretError) {
      throw new HttpError(400, error.message)
    }
    throw new HttpError(400, error instanceof Error ? error.message : 'Encrypted backup could not be opened')
  }
}

/** True when exports and off-machine copies are written encrypted. Throws if the key file is damaged. */
export function exportsEncrypted(): boolean {
  return requireBackupKeyState() !== null
}

/**
 * Database-only export. With encryption on, the snapshot is encrypted and the
 * plain one removed before anything is handed out.
 */
export async function writeDatabaseExport(destinationPath: string): Promise<void> {
  const key = requireBackupKeyState()
  if (!key) {
    await backupDatabaseTo(destinationPath)
    return
  }
  const scratch = mkdtempSync(join(tmpdir(), 'pd-export-'))
  try {
    const plain = join(scratch, 'pawndesk.db')
    await backupDatabaseTo(plain)
    await encryptFile(plain, destinationPath, key)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

export function removeDecryptedTemp(path: string): void {
  rmSync(dirname(path), { recursive: true, force: true })
}

export { isEncryptedFile }

function totalChanges(db: Database.Database): number {
  return (db.prepare('SELECT total_changes() AS n').get() as { n: number }).n
}

function noteBackupBaseline(db: Database.Database = getDatabase()): void {
  changeBaseline.set(db, totalChanges(db))
}

/** Remembers the current database as unchanged, so a later edit can be detected. */
export function rememberChangeBaseline(): void {
  noteBackupBaseline()
}

function dataChangedSinceBackup(db: Database.Database): boolean {
  const baseline = changeBaseline.get(db)
  if (baseline === undefined) return true
  return totalChanges(db) > baseline
}

/**
 * Off-machine bookkeeping writes shop_settings, which SQLite counts in
 * total_changes(). Those writes are not shop data, so they must not make the
 * 3-hour backup look due.
 */
function withoutChangeBaseline<T>(work: () => T): T {
  const db = getDatabase()
  const before = totalChanges(db)
  const baseline = changeBaseline.get(db)
  try {
    return work()
  } finally {
    if (baseline !== undefined) {
      changeBaseline.set(db, baseline + (totalChanges(db) - before))
    }
  }
}

function syncCooldown(db: Database.Database): void {
  if (cooldownDatabase !== db) {
    cooldownDatabase = db
    localBackupFailedAt = 0
  }
}

function localBackupCoolingDown(now: Date): boolean {
  return localBackupFailedAt > 0 && now.getTime() - localBackupFailedAt < LOCAL_BACKUP_RETRY_MS
}

function markBackupCompleted(options: { scheduled?: boolean } = {}): BackupStatus {
  const db = getDatabase()
  setShopSetting(db, LAST_BACKUP_AT_KEY, new Date().toISOString())
  setShopSetting(db, LAST_BACKUP_ERROR_KEY, '')
  if (options.scheduled) {
    setShopSetting(db, LAST_SCHEDULED_BACKUP_AT_KEY, new Date().toISOString())
  }
  noteBackupBaseline(db)
  localBackupFailedAt = 0
  return getBackupStatus()
}

function recordBackupError(message: string): void {
  setShopSetting(getDatabase(), LAST_BACKUP_ERROR_KEY, message)
}

function recordOffsiteError(message: string): void {
  withoutChangeBaseline(() => {
    setShopSetting(getDatabase(), LAST_OFFSITE_ERROR_KEY, message)
  })
}

function recordOffsiteSuccess(sourceKey: string): void {
  withoutChangeBaseline(() => {
    const db = getDatabase()
    setShopSetting(db, LAST_OFFSITE_AT_KEY, new Date().toISOString())
    setShopSetting(db, LAST_OFFSITE_ERROR_KEY, '')
    setShopSetting(db, LAST_OFFSITE_SOURCE_KEY, sourceKey)
  })
}

export function assertSqliteIntegrity(filePath: string): void {
  if (!existsSync(filePath)) {
    throw new Error('Backup file was not found')
  }

  const check = new Database(filePath, sqliteNativeOptions({ readonly: true, fileMustExist: true }))
  try {
    const result = check.pragma('integrity_check', { simple: true })
    if (result !== 'ok') {
      throw new Error('Backup file is damaged and cannot be used')
    }
  } finally {
    check.close()
  }
}

function openBackup(filePath: string): Database.Database {
  return new Database(filePath, sqliteNativeOptions({ readonly: true, fileMustExist: true }))
}

function listTableNames(db: Database.Database): Set<string> {
  return new Set(
    (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map(
      (row) => row.name,
    ),
  )
}

function tableCount(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
}

function countIfPresent(db: Database.Database, tables: Set<string>, table: string): number {
  return tables.has(table) ? tableCount(db, table) : 0
}

function schemaVersionOf(db: Database.Database, tables: Set<string>): number {
  if (!tables.has('schema_migrations')) return 0
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {
    version: number | null
  }
  return row.version ?? 0
}

/**
 * Rejects anything that is not a healthy PawnDesk backup this build can
 * open, before the live database is touched.
 */
export function assertRestorableBackup(filePath: string): void {
  try {
    assertSqliteIntegrity(filePath)
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Backup file is damaged and cannot be used')
  }

  const db = openBackup(filePath)
  try {
    const tables = listTableNames(db)
    const missing = RESTORE_REQUIRED_TABLES.filter((table) => !tables.has(table))
    if (missing.length > 0) {
      throw new HttpError(400, 'This file is not an PawnDesk backup')
    }
    if (schemaVersionOf(db, tables) > latestMigrationVersion()) {
      throw new HttpError(
        400,
        'This backup was made by a newer version of the app. Update the app before restoring it.',
      )
    }
  } finally {
    db.close()
  }
}

export function inspectBackup(name: string): BackupInspection {
  const filePath = resolveBackupPath(name)
  const issues: string[] = []
  let db: Database.Database
  try {
    db = openBackup(filePath)
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Backup file could not be opened')
  }
  try {
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') {
      issues.push('The file failed its integrity check')
    }
    const tables = listTableNames(db)
    for (const table of RESTORE_REQUIRED_TABLES) {
      if (!tables.has(table)) {
        issues.push(`Missing table: ${table}`)
      }
    }
    const schemaVersion = schemaVersionOf(db, tables)
    if (schemaVersion > latestMigrationVersion()) {
      issues.push('Made by a newer version of the app')
    }

    return {
      name,
      schemaVersion,
      appSchemaVersion: latestMigrationVersion(),
      restorable: issues.length === 0,
      counts: {
        customers: countIfPresent(db, tables, 'customers'),
        pledges: countIfPresent(db, tables, 'pledges'),
        goldSavingAccounts: countIfPresent(db, tables, 'gold_saving_accounts'),
      },
      issues,
    }
  } finally {
    db.close()
  }
}

function fileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/**
 * Byte-for-byte proof that the off-machine file equals the local snapshot,
 * plus an integrity check on the copy. Stronger than comparing a few row
 * counts, which can match even when the rest of the file is damaged.
 */
export async function proveBackupRestores(copyPath: string, sourcePath: string): Promise<void> {
  assertSqliteIntegrity(copyPath)
  const [copyHash, sourceHash] = await Promise.all([fileSha256(copyPath), fileSha256(sourcePath)])
  if (copyHash !== sourceHash) {
    throw new Error('Off-machine copy did not match the local backup')
  }
}

function discardPartial(partial: string): void {
  rmSync(partial, { force: true, recursive: true })
  rmSync(`${partial}-wal`, { force: true })
  rmSync(`${partial}-shm`, { force: true })
}

/**
 * Replaces `destinationPath` with a verified temp file. The previous file is
 * moved aside first, so a failed rename puts it back.
 */
function commitPartialFile(partial: string, destinationPath: string): void {
  removeSidecarFiles(partial)
  const holding = `${destinationPath}.replacing`
  // A crash between the two renames leaves the good file only as `.replacing`.
  if (!existsSync(destinationPath) && existsSync(holding)) {
    renameSync(holding, destinationPath)
  }
  let movedAside = false
  try {
    if (existsSync(destinationPath)) {
      if (existsSync(holding)) {
        rmSync(holding, { force: true })
      }
      removeSidecarFiles(destinationPath)
      renameSync(destinationPath, holding)
      movedAside = true
    }
    renameSync(partial, destinationPath)
    if (existsSync(holding)) {
      rmSync(holding, { force: true })
    }
    removeSidecarFiles(destinationPath)
  } catch (error) {
    if (movedAside && !existsSync(destinationPath) && existsSync(holding)) {
      try {
        renameSync(holding, destinationPath)
      } catch (rollbackError) {
        logDiagnostic('backup', 'Could not put the previous file back', rollbackError)
      }
    }
    throw error
  }
}

/**
 * Writes a snapshot beside the real file, checks it, then renames it into place.
 * A failed write leaves the previous file unchanged.
 */
export async function writeVerifiedSnapshot(db: Database.Database, destinationPath: string): Promise<void> {
  const partial = join(dirname(destinationPath), `~$${basename(destinationPath)}.tmp`)
  discardPartial(partial)
  try {
    await db.backup(partial)
    const check = new Database(partial, sqliteNativeOptions({ readonly: true, fileMustExist: true }))
    try {
      if (check.pragma('quick_check', { simple: true }) !== 'ok') {
        throw new Error('Backup file is damaged and cannot be used')
      }
    } finally {
      check.close()
    }
    commitPartialFile(partial, destinationPath)
  } catch (error) {
    discardPartial(partial)
    throw error
  }
}

function replaceDatabaseFile(sourcePath: string, dest: string): void {
  const partial = `${dest}.restore.tmp`
  discardPartial(partial)
  try {
    copyFileSync(sourcePath, partial)
    assertSqliteIntegrity(partial)
    commitPartialFile(partial, dest)
  } catch (error) {
    discardPartial(partial)
    throw error
  }
}

export async function backupDatabaseTo(
  destinationPath: string,
  options: { scheduled?: boolean } = {},
): Promise<BackupStatus> {
  await writeVerifiedSnapshot(getDatabase(), destinationPath)
  return markBackupCompleted(options)
}

async function writeExcelBeside(dbPath: string): Promise<void> {
  try {
    await writeExcelBackupFromSqliteFile(dbPath)
  } catch (error) {
    logDiagnostic('backup', 'Excel backup failed', error)
  }
}

function offsiteExcelPath(destDir: string, now: Date, encrypted: boolean): string {
  return join(destDir, encryptedName(`pawndesk-${localDateIso(now)}.xlsx`, encrypted))
}

async function copyExcelBeside(sourceDbPath: string, destDir: string, now: Date): Promise<void> {
  try {
    // Excel is written only for daily and manual snapshots. A day-close or
    // pre-restore snapshot must not grow an extra workbook here.
    const sourceXlsx = excelPathFor(sourceDbPath)
    if (!existsSync(sourceXlsx)) return
    const key = requireBackupKeyState()
    const destXlsx = offsiteExcelPath(destDir, now, key !== null)
    if (key) {
      await encryptFile(sourceXlsx, destXlsx, key)
      // A plain workbook written earlier the same day would leave today's data readable.
      rmSync(offsiteExcelPath(destDir, now, false), { force: true })
    } else {
      copyFileSync(sourceXlsx, destXlsx)
    }
  } catch (error) {
    logDiagnostic('backup', 'Off-machine Excel copy failed', error)
  }
}

export async function ensureScheduledBackup(now = new Date()): Promise<void> {
  return withBackupLock(() => runScheduledBackup(now))
}

export const ensureDailyBackup = ensureScheduledBackup

async function runScheduledBackup(now: Date): Promise<void> {
  if (!isBackupDue(getBackupSchedule(), lastScheduledAnchor(), now)) {
    return
  }
  const dir = getBackupsDir()
  const destinationPath = join(dir, `pawndesk-${localDateIso(now)}.db`)
  await backupDatabaseTo(destinationPath, { scheduled: true })
  await writeExcelBeside(destinationPath)
  pruneBackupFiles(dir)
}

async function runPeriodicBackup(now: Date): Promise<void> {
  const last = settingOrNull(LAST_BACKUP_AT_KEY)
  if (!last) return
  const lastAt = new Date(last)
  if (Number.isNaN(lastAt.getTime())) return
  if (now.getTime() - lastAt.getTime() < CHANGE_BACKUP_INTERVAL_HOURS * 60 * 60 * 1000) return
  const db = getDatabase()
  if (!dataChangedSinceBackup(db)) return
  const dir = getBackupsDir()
  const destinationPath = join(dir, `pawndesk-${localDateIso(now)}.db`)
  await backupDatabaseTo(destinationPath)
  await writeExcelBeside(destinationPath)
  pruneBackupFiles(dir)
}

/** Only these kinds are worth mirroring off the machine. */
const OFFSITE_SOURCE_KINDS: BackupKind[] = ['daily', 'manual', 'dayclose']

function newestLocalBackup(): BackupFile | null {
  return listBackups().find((file) => OFFSITE_SOURCE_KINDS.includes(file.kind)) ?? null
}

function sourceFingerprint(file: BackupFile, keyId: string | null): string {
  const mtimeMs = statSync(join(getBackupsDir(), file.name)).mtimeMs
  // Turning encryption on (or changing key) must re-copy, or the plain copy
  // already off the machine would count as current.
  return keyId ? `${file.name}|${mtimeMs}|${keyId}` : `${file.name}|${mtimeMs}`
}

async function ensureLocalSnapshot(now = new Date()): Promise<BackupFile> {
  const dir = getBackupsDir()
  const destinationPath = join(dir, `pawndesk-${localDateIso(now)}.db`)
  await backupDatabaseTo(destinationPath)
  await writeExcelBeside(destinationPath)
  pruneBackupFiles(dir)
  const newest = newestLocalBackup()
  if (!newest) {
    throw new Error('Local backup was not found')
  }
  return newest
}

async function mirrorUploads(destDir: string): Promise<void> {
  const sourceDir = getUploadsDir()
  if (!existsSync(sourceDir)) return

  const targetDir = join(destDir, 'uploads')
  try {
    mkdirSync(targetDir, { recursive: true })
  } catch (error) {
    logDiagnostic('backup', 'Off-machine uploads folder could not be created', error)
    return
  }

  // Customer photos and Aadhaar/PAN scans live here, so they are encrypted too.
  const key = requireBackupKeyState()
  for (const name of readdirSync(sourceDir)) {
    try {
      const source = join(sourceDir, name)
      if (!statSync(source).isFile()) continue
      const target = join(targetDir, encryptedName(name, key !== null))
      if (existsSync(target)) continue
      if (key) {
        await encryptFile(source, target, key)
        // A plain mirror written before encryption was turned on would leave the
        // Aadhaar/PAN scan readable. The original is still in this computer's
        // uploads folder, so removing the plain copy loses nothing.
        rmSync(join(targetDir, name), { force: true })
      } else {
        copyFileSync(source, target)
      }
    } catch (error) {
      logDiagnostic('backup', 'Shop image could not be mirrored', error)
    }
  }
}

/** Decrypts the encrypted copy to a temp file and proves it equals the source, byte for byte. */
async function proveEncryptedCopy(encryptedPath: string, sourcePath: string): Promise<void> {
  const scratch = mkdtempSync(join(tmpdir(), 'pd-prove-'))
  try {
    const plain = join(scratch, 'copy.db')
    await decryptFile(encryptedPath, plain, { material: requireBackupKeyState() })
    await proveBackupRestores(plain, sourcePath)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

async function copyAndProve(sourcePath: string, destDir: string, now: Date): Promise<string> {
  if (!existsSync(destDir)) {
    throw new Error('Off-machine folder was not found')
  }
  if (!statSync(destDir).isDirectory()) {
    throw new Error('Off-machine folder is not a directory')
  }

  const date = localDateIso(now)
  const key = requireBackupKeyState()
  const plainDest = join(destDir, `pawndesk-${date}.db`)
  const destPath = encryptedName(plainDest, key !== null)
  // Leading "~$" keeps half-written files out of OneDrive/Drive sync clients.
  const partialPath = join(destDir, `~$${basename(destPath)}.tmp`)
  if (existsSync(partialPath)) {
    unlinkSync(partialPath)
  }

  try {
    if (key) {
      // encryptFile writes through its own "~$…tmp" partial; the result lands
      // here so it can be proven before it replaces today's copy.
      await encryptFile(sourcePath, partialPath, key)
      await proveEncryptedCopy(partialPath, sourcePath)
    } else {
      copyFileSync(sourcePath, partialPath)
      await proveBackupRestores(partialPath, sourcePath)
    }
    if (existsSync(destPath)) {
      unlinkSync(destPath)
    }
    renameSync(partialPath, destPath)
    // Opening the partial to prove it can leave SQLite -wal/-shm files beside it.
    removeSidecarFiles(partialPath)
    if (key && existsSync(plainDest)) {
      // Today's plain copy, written before encryption was turned on, is superseded.
      unlinkSync(plainDest)
    }
  } catch (error) {
    if (existsSync(partialPath)) {
      unlinkSync(partialPath)
    }
    throw error
  }

  pruneBackupFiles(destDir)
  await copyExcelBeside(sourcePath, destDir, now)
  await mirrorUploads(destDir)
  return destPath
}

export async function copyNewestBackupOffsite(
  options: { forceFresh?: boolean } = {},
  now = new Date(),
): Promise<BackupStatus> {
  return withBackupLock(() => runOffsiteCopy(options, now))
}

async function runOffsiteCopy(options: { forceFresh?: boolean }, now: Date): Promise<BackupStatus> {
  const destDir = getOffsiteDir()
  if (!destDir) {
    return getBackupStatus()
  }

  try {
    let newest = newestLocalBackup()
    if (options.forceFresh || !newest) {
      newest = await ensureLocalSnapshot(now)
    }
    const sourcePath = join(getBackupsDir(), newest.name)
    const key = requireBackupKeyState()
    const fingerprint = sourceFingerprint(newest, key?.keyId ?? null)
    const lastSource = getShopSetting(getDatabase(), LAST_OFFSITE_SOURCE_KEY, '')
    if (!options.forceFresh && lastSource === fingerprint) {
      if (!existsSync(offsiteExcelPath(destDir, now, key !== null))) {
        await copyExcelBeside(sourcePath, destDir, now)
      }
      await mirrorUploads(destDir)
      return getBackupStatus()
    }
    await copyAndProve(sourcePath, destDir, now)
    recordOffsiteSuccess(fingerprint)
    return getBackupStatus()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Off-machine copy failed'
    recordOffsiteError(message)
    logDiagnostic('backup', 'Off-machine backup copy failed', error)
    return getBackupStatus()
  }
}

export async function tickScheduledBackup(now = new Date()): Promise<void> {
  if (isBackupBusy()) return
  await withBackupLock(async () => {
    const db = getDatabase()
    syncCooldown(db)
    try {
      if (!localBackupCoolingDown(now)) {
        try {
          await runScheduledBackup(now)
          await runPeriodicBackup(now)
        } catch (error) {
          localBackupFailedAt = now.getTime()
          const message = error instanceof Error ? error.message : 'Automatic backup failed'
          try {
            recordBackupError(message)
          } catch (recordError) {
            logDiagnostic('backup', 'Could not record the backup error', recordError)
          }
          logDiagnostic('backup', 'Scheduled database backup failed', error)
        }
      }
    } finally {
      await runOffsiteCopy({}, now)
    }
  })
}

/**
 * Snapshot taken after a metal day is closed. Runs under the same lock as every
 * other backup and never throws: a failed backup must not undo a close.
 */
export async function runDayCloseBackup(businessDate: string, metal: string): Promise<boolean> {
  try {
    await withBackupLock(async () => {
      const now = new Date()
      const slug = metal.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') || 'metal'
      const name = `pawndesk-dayclose-${localDateIso(now)}-${slug}-${localTimeStamp(now)}.db`
      const dir = getBackupsDir()
      await backupDatabaseTo(join(dir, name))
      pruneBackupFiles(dir)
      await runOffsiteCopy({}, now)
    })
    return true
  } catch (error) {
    logDiagnostic('backup', `Day-close backup failed for ${businessDate} ${metal}`, error)
    return false
  }
}

function removeSidecarFiles(dbPath: string): void {
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${dbPath}${suffix}`
    if (existsSync(sidecar)) {
      unlinkSync(sidecar)
    }
  }
}

async function writePrerestoreSnapshot(): Promise<string> {
  const dir = getBackupsDir()
  const destination = join(dir, prerestoreSnapshotName())
  await writeVerifiedSnapshot(getDatabase(), destination)
  pruneBackupFiles(dir)
  return destination
}

/**
 * The app only ever stores PNG and JPEG uploads (plus PDF customer KYC scans),
 * and /uploads is served on the app's own origin. Anything else in a backup (an
 * .html or .js file, say) would become a page that runs inside the app, so it is
 * never restored.
 */
export function isRestorableUploadName(name: string): boolean {
  return /^[^/\\]+\.(png|jpe?g|pdf)$/i.test(name) && basename(name) === name
}

async function copyNewFiles(sourceDir: string, targetDir: string, logLabel: string): Promise<void> {
  if (!existsSync(sourceDir)) return
  mkdirSync(targetDir, { recursive: true })
  const key = backupKeyOrNull()
  for (const name of readdirSync(sourceDir)) {
    try {
      const source = join(sourceDir, name)
      if (!statSync(source).isFile()) continue
      const encrypted = name.endsWith(ENCRYPTED_SUFFIX)
      const plainName = encrypted ? name.slice(0, -ENCRYPTED_SUFFIX.length) : name
      if (!isRestorableUploadName(plainName)) continue
      const target = join(targetDir, plainName)
      if (existsSync(target)) continue
      if (encrypted) {
        // Only files made with this computer's key (or the one adopted from the
        // restored backup) can be opened here; others are skipped and logged.
        await decryptFile(source, target, { material: key })
      } else {
        copyFileSync(source, target)
      }
    } catch (error) {
      logDiagnostic('backup', logLabel, error)
    }
  }
}

async function restoreShopImages(offsiteDir: string): Promise<void> {
  if (!offsiteDir) return
  await copyNewFiles(join(offsiteDir, 'uploads'), getUploadsDir(), 'Shop image could not be restored')
}

function readBackupState(): Map<string, string> {
  const db = getDatabase()
  const state = new Map<string, string>()
  for (const key of BACKUP_STATE_KEYS) {
    state.set(key, getShopSetting(db, key, ''))
  }
  return state
}

function writeBackupState(state: Map<string, string>): void {
  const db = getDatabase()
  const apply = db.transaction(() => {
    for (const [key, value] of state) {
      setShopSetting(db, key, value)
    }
  })
  apply()
  noteBackupBaseline(db)
}

export async function restoreDatabaseFrom(
  sourcePath: string,
  options: { uploadsDir?: string; beforeImages?: () => void } = {},
): Promise<BackupStatus> {
  return withBackupLock(() => runRestore(sourcePath, options.uploadsDir, options.beforeImages))
}

/**
 * A backup with no active admin would lock everyone out, and with an empty
 * users table the app would recreate the default admin/admin123 login.
 */
function assertBackupHasActiveAdmin(filePath: string): void {
  const db = openBackup(filePath)
  try {
    const row = db
      .prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1`)
      .get() as { n: number }
    if (row.n < 1) {
      throw new HttpError(400, 'This backup has no active admin user, so it cannot be restored')
    }
  } finally {
    db.close()
  }
}

async function runRestore(
  sourcePath: string,
  uploadsDir?: string,
  beforeImages?: () => void,
): Promise<BackupStatus> {
  assertRestorableBackup(sourcePath)
  assertBackupHasActiveAdmin(sourcePath)

  const preserved = readBackupState()
  const offsiteDir = preserved.get(OFFSITE_DIR_KEY) ?? ''
  const dest = getDbPath()
  const safetyCopy = await writePrerestoreSnapshot()

  closeDatabase()
  try {
    replaceDatabaseFile(sourcePath, dest)
    initDatabase()
  } catch (error) {
    try {
      // The failed initDatabase leaves a half-built connection in the module.
      // Close it first, or the re-init below would hand back the broken file.
      closeDatabase()
      if (existsSync(safetyCopy)) {
        replaceDatabaseFile(safetyCopy, dest)
      }
    } catch (rollbackError) {
      logDiagnostic('backup', 'Restore rollback failed', rollbackError)
    }
    try {
      initDatabase()
    } catch (reinitError) {
      logDiagnostic('backup', 'Database could not be reopened after a failed restore', reinitError)
    }
    logDiagnostic('backup', 'Restore failed and was rolled back', error)
    throw new HttpError(400, 'Backup could not be opened. Your current data was kept.')
  }

  try {
    writeBackupState(preserved)
  } catch (error) {
    logDiagnostic('backup', "Restored database could not keep this computer's backup settings", error)
    try {
      noteBackupBaseline()
    } catch (baselineError) {
      logDiagnostic('backup', 'Could not reset the backup change baseline', baselineError)
    }
  }
  if (beforeImages) {
    try {
      // e.g. adopt the restored backup's key, so encrypted off-machine photos open.
      beforeImages()
    } catch (error) {
      logDiagnostic('backup', 'Could not keep the restored backup key', error)
    }
  }
  await restoreShopImages(offsiteDir)
  if (uploadsDir) {
    await copyNewFiles(uploadsDir, getUploadsDir(), 'Backup photo could not be restored')
  }
  // Sessions hold user ids from the old database. In the restored one the same
  // id may be someone else, or the same person with a different role, so
  // everyone signs in again.
  clearAllSessions()
  return getBackupStatus()
}

/** Database entry in a full backup; older zips (and the full app's) use the second name. */
export const FULL_BACKUP_DB_NAMES = ['pawndesk.db', 'jeweltrackerpro.db'] as const

export function allowFullBackupEntry(name: string): boolean {
  if (name === 'manifest.json' || (FULL_BACKUP_DB_NAMES as readonly string[]).includes(name)) return true
  if (!name.startsWith('uploads/')) return false
  const base = name.slice('uploads/'.length)
  return base.length > 0 && !base.includes('/') && isRestorableUploadName(base)
}

export function assertFullBackupDestination(filePath: string): string {
  if (!isAbsolute(filePath)) {
    throw new HttpError(400, 'Choose a .zip file path')
  }
  let resolved = resolve(filePath)
  const lower = resolved.toLowerCase()
  if (!lower.endsWith('.zip') && !lower.endsWith(ENCRYPTED_SUFFIX)) {
    throw new HttpError(400, 'Choose a .zip file path')
  }
  // An encrypted backup is not a zip any more; name it so nobody tries to open
  // it with an archive tool, and so Restore recognises it.
  if (exportsEncrypted() && !lower.endsWith(ENCRYPTED_SUFFIX)) {
    resolved = `${resolved}${ENCRYPTED_SUFFIX}`
  } else if (!exportsEncrypted() && !lower.endsWith('.zip')) {
    throw new HttpError(400, 'Choose a .zip file path')
  }
  // path.relative ignores case on Windows, so c:\users\… cannot slip past.
  if (isSameOrInside(resolved, getDataDir())) {
    throw new HttpError(400, "Choose a folder outside this computer's app data")
  }
  const parent = dirname(resolved)
  if (!existsSync(parent) || !statSync(parent).isDirectory()) {
    throw new HttpError(400, 'The folder for the backup was not found')
  }
  return resolved
}

export async function writeFullBackup(destinationPath: string): Promise<void> {
  const scratch = mkdtempSync(join(tmpdir(), 'pd-full-'))
  const partialZip = `${destinationPath}.partial`
  try {
    const dbPath = join(scratch, 'pawndesk.db')
    await writeVerifiedSnapshot(getDatabase(), dbPath)
    const manifest = Buffer.from(
      JSON.stringify({
        app: 'PawnDesk',
        appVersion: getAppVersion(),
        schemaVersion: latestMigrationVersion(),
        createdAt: new Date().toISOString(),
      }),
    )
    const entries: ZipSource[] = [
      { name: 'manifest.json', data: manifest, compress: true },
      { name: 'pawndesk.db', filePath: dbPath, compress: true },
    ]
    const uploadsDir = getUploadsDir()
    if (existsSync(uploadsDir)) {
      for (const name of readdirSync(uploadsDir)) {
        if (basename(name) !== name) continue
        const source = join(uploadsDir, name)
        if (!statSync(source).isFile()) continue
        entries.push({ name: `uploads/${name}`, filePath: source, compress: false })
      }
    }
    await writeZipFile(partialZip, entries)
    const key = requireBackupKeyState()
    if (key) {
      // The zip holds Aadhaar/PAN scans and password hashes, so it never lands
      // outside this folder unencrypted.
      await encryptFile(partialZip, destinationPath, key)
      rmSync(partialZip, { force: true })
    } else {
      commitPartialFile(partialZip, destinationPath)
    }
    markBackupCompleted()
  } catch (error) {
    rmSync(partialZip, { force: true })
    throw error
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

function backupKind(name: string): BackupKind | null {
  return backupKindForName(name)
}

function describeBackup(name: string, kind: BackupKind): BackupFile {
  const stat = statSync(join(getBackupsDir(), name))
  return {
    name,
    createdAt: stat.mtime.toISOString(),
    sizeBytes: stat.size,
    kind,
  }
}

function resolveBackupPath(name: string): string {
  if (basename(name) !== name || !backupKind(name)) {
    throw new HttpError(400, 'Invalid backup file name')
  }
  const filePath = join(getBackupsDir(), name)
  if (!existsSync(filePath)) {
    throw new HttpError(404, 'Backup file was not found')
  }
  return filePath
}

export function listBackups(): BackupFile[] {
  const dir = getBackupsDir()
  const items: BackupFile[] = []
  for (const name of readdirSync(dir)) {
    const kind = backupKind(name)
    if (!kind) continue
    items.push(describeBackup(name, kind))
  }
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  return items
}

export async function createManualBackup(): Promise<BackupFile> {
  return withBackupLock(async () => {
    const name = `pawndesk-manual-${localNowStamp()}.db`
    const destinationPath = join(getBackupsDir(), name)
    await backupDatabaseTo(destinationPath)
    await writeExcelBeside(destinationPath)
    pruneBackupFiles(getBackupsDir())
    return describeBackup(name, 'manual')
  })
}

export function deleteBackup(name: string): void {
  const filePath = resolveBackupPath(name)
  unlinkSync(filePath)
  removeBackupSiblings(getBackupsDir(), name)
}

export async function restoreBackupByName(name: string): Promise<BackupStatus> {
  return restoreDatabaseFrom(resolveBackupPath(name))
}
