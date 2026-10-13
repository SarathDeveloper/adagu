import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { BackupFile, BackupInspection, BackupStatus, Customer } from '@shared/types'
import {
  allowFullBackupEntry,
  assertSqliteIntegrity,
  backupDatabaseTo,
  copyNewestBackupOffsite,
  ensureDailyBackup,
  ensureScheduledBackup,
  LAST_BACKUP_AT_KEY,
  LAST_SCHEDULED_BACKUP_AT_KEY,
  rememberChangeBaseline,
  proveBackupRestores,
  restoreDatabaseFrom,
  tickScheduledBackup,
} from '../../server/db/backup'
import { getDatabase, getUserDataDir } from '../../server/db'
import { latestMigrationVersion } from '../../server/db/migrations'
import { pruneBackupFiles, writePremigrateSnapshot } from '../../server/db/snapshot'
import { getUploadsDir } from '../../server/lib/paths'
import { crc32, extractZipFile } from '../../server/lib/zip'
import { getShopSetting, setShopSetting } from '../../server/lib/settingsStore'
import { localDateIso } from '../../shared/localDate'
import { getTestAgent, IPC_CHANNELS, ipc, useIntegrationEnv, uniqueCustomerPhone } from './helpers/testEnv'

async function seedCustomer(name = 'Test customer'): Promise<Customer> {
  const response = await getTestAgent().post('/api/customers').send({
    name,
    phone: uniqueCustomerPhone(),
    address: 'Salem',
  })
  if (response.status !== 201) {
    throw new Error(`Customer seed failed: ${response.text}`)
  }
  return response.body as Customer
}

describe('database backup and restore', () => {
  useIntegrationEnv()

  it('exports a consistent SQLite snapshot that passes integrity_check', async () => {
    await seedCustomer()
    const destination = join(process.env.JEWELTRACKERPRO_E2E_USER_DATA as string, 'export.db')
    const status = await ipc<BackupStatus>(IPC_CHANNELS.APP_EXPORT_DB, { destinationPath: destination })

    expect(status.lastBackupAt).toBeTruthy()
    expect(existsSync(destination)).toBe(true)
    assertSqliteIntegrity(destination)

    const snapshot = new Database(destination, { readonly: true, fileMustExist: true })
    try {
      const row = snapshot.prepare('SELECT name FROM customers WHERE name = ?').get('Test customer') as {
        name: string
      }
      expect(row.name).toBe('Test customer')
    } finally {
      snapshot.close()
    }

    const persisted = await ipc<BackupStatus>(IPC_CHANNELS.APP_BACKUP_STATUS)
    expect(persisted.lastBackupAt).toBe(status.lastBackupAt)
  })

  it('restores a backup and replaces current records', async () => {
    await seedCustomer()
    const destination = join(process.env.JEWELTRACKERPRO_E2E_USER_DATA as string, 'restore-source.db')
    await ipc(IPC_CHANNELS.APP_EXPORT_DB, { destinationPath: destination })

    await seedCustomer('Later ring')
    expect(await ipc<Customer[]>(IPC_CHANNELS.CUSTOMERS_LIST)).toHaveLength(2)

    await ipc(IPC_CHANNELS.APP_RESTORE_DB, { sourcePath: destination })
    const customers = await ipc<Customer[]>(IPC_CHANNELS.CUSTOMERS_LIST)
    expect(customers).toHaveLength(1)
    expect(customers[0]?.name).toBe('Test customer')
  })

  it('writes a daily backup on demand', async () => {
    await seedCustomer()
    await ensureDailyBackup()
    const today = localDateIso()
    const dailyPath = join(getUserDataDir(), 'backups', `jeweltrackerpro-${today}.db`)
    const excelPath = join(getUserDataDir(), 'backups', `jeweltrackerpro-${today}.xlsx`)
    expect(existsSync(dailyPath)).toBe(true)
    assertSqliteIntegrity(dailyPath)
    expect(existsSync(excelPath)).toBe(true)
    const excel = readFileSync(excelPath)
    expect(excel.subarray(0, 2).toString()).toBe('PK')
    expect(excel.toString('utf8')).toContain('Test customer')
    expect(excel.toString('utf8')).toContain('customers')
    const hash = getDatabase().prepare('SELECT password_hash FROM users LIMIT 1').get() as {
      password_hash: string
    }
    expect(hash.password_hash.length).toBeGreaterThan(8)
    expect(excel.toString('utf8')).not.toContain(hash.password_hash)
  })

  it('creates a manual backup that can be listed, restored, and deleted', async () => {
    await seedCustomer()
    const agent = getTestAgent()

    const created = await agent.post('/api/backup/create')
    expect(created.status).toBe(200)
    const backup = created.body as BackupFile
    expect(backup.kind).toBe('manual')
    expect(backup.name).toMatch(/^jeweltrackerpro-manual-\d{8}-\d{6}\.db$/)
    expect(backup.sizeBytes).toBeGreaterThan(0)
    assertSqliteIntegrity(join(getUserDataDir(), 'backups', backup.name))
    const excelPath = join(getUserDataDir(), 'backups', backup.name.replace(/\.db$/, '.xlsx'))
    expect(existsSync(excelPath)).toBe(true)

    const listed = await agent.get('/api/backup/list')
    expect(listed.status).toBe(200)
    expect((listed.body as BackupFile[]).some((file) => file.name === backup.name && file.kind === 'manual')).toBe(
      true,
    )

    await seedCustomer('Later ring')
    expect(await ipc<Customer[]>(IPC_CHANNELS.CUSTOMERS_LIST)).toHaveLength(2)

    const restored = await agent.post('/api/backup/restore-local').send({ name: backup.name })
    expect(restored.status).toBe(200)
    const customers = await ipc<Customer[]>(IPC_CHANNELS.CUSTOMERS_LIST)
    expect(customers).toHaveLength(1)
    expect(customers[0]?.name).toBe('Test customer')

    const deleted = await agent.delete(`/api/backup/${encodeURIComponent(backup.name)}`)
    expect(deleted.status).toBe(204)
    const afterDelete = await agent.get('/api/backup/list')
    expect((afterDelete.body as BackupFile[]).some((file) => file.name === backup.name)).toBe(false)
    expect(existsSync(join(getUserDataDir(), 'backups', backup.name))).toBe(false)
    expect(existsSync(excelPath)).toBe(false)
  })

  it('rejects path traversal on restore and delete', async () => {
    const agent = getTestAgent()

    const restore = await agent.post('/api/backup/restore-local').send({ name: '../secret.db' })
    expect(restore.status).toBe(400)

    const missing = await agent.post('/api/backup/restore-local').send({
      name: 'jeweltrackerpro-manual-19990101-000000.db',
    })
    expect(missing.status).toBe(404)

    const deleted = await agent.delete(`/api/backup/${encodeURIComponent('../jeweltrackerpro-2026-01-01.db')}`)
    expect(deleted.status).toBe(400)
  })

  it('persists automatic backup frequency and time', async () => {
    const agent = getTestAgent()
    const saved = await agent.put('/api/backup/settings').send({ frequency: 'weekly', time: '09:30' })
    expect(saved.status).toBe(200)
    expect(saved.body.frequency).toBe('weekly')
    expect(saved.body.time).toBe('09:30')
    expect(saved.body.offsiteDir).toBe('')
    expect(saved.body.lastOffsiteAt).toBeNull()
    expect(saved.body.lastOffsiteError).toBeNull()

    const status = await agent.get('/api/backup/status')
    expect(status.body.frequency).toBe('weekly')
    expect(status.body.time).toBe('09:30')
    expect(status.body.offsiteDir).toBe('')
  })

  it('writes a scheduled backup when the last slot was missed and skips when current', async () => {
    const db = getDatabase()
    const today = localDateIso()
    const dailyPath = join(getUserDataDir(), 'backups', `jeweltrackerpro-${today}.db`)

    setShopSetting(db, LAST_SCHEDULED_BACKUP_AT_KEY, new Date(Date.now() - 3 * 86_400_000).toISOString())
    await ensureScheduledBackup()
    expect(existsSync(dailyPath)).toBe(true)
    assertSqliteIntegrity(dailyPath)

    const before = db.prepare('SELECT value FROM shop_settings WHERE key = ?').get(LAST_SCHEDULED_BACKUP_AT_KEY) as {
      value: string
    }
    await ensureScheduledBackup()
    const after = db.prepare('SELECT value FROM shop_settings WHERE key = ?').get(LAST_SCHEDULED_BACKUP_AT_KEY) as {
      value: string
    }
    expect(after.value).toBe(before.value)
  })

  it('rejects an off-machine folder inside app data', async () => {
    const agent = getTestAgent()
    const inside = await agent.put('/api/backup/settings').send({
      frequency: 'daily',
      time: '21:00',
      offsiteDir: getUserDataDir(),
    })
    expect(inside.status).toBe(400)
    expect(inside.body.error).toBe("Choose a folder outside this computer's app data")

    const backups = await agent.put('/api/backup/settings').send({
      frequency: 'daily',
      time: '21:00',
      offsiteDir: join(getUserDataDir(), 'backups'),
    })
    expect(backups.status).toBe(400)

    const relative = await agent.put('/api/backup/settings').send({
      frequency: 'daily',
      time: '21:00',
      offsiteDir: 'backups',
    })
    expect(relative.status).toBe(400)
    expect(relative.body.error).toBe('Choose an absolute folder path')
  })

  it('copies the newest backup off-machine, verifies it, and restores shop data from that file', async () => {
    await seedCustomer()
    const agent = getTestAgent()
    const offsiteDir = mkdtempSync(join(tmpdir(), 'jtp-offsite-'))
    const today = localDateIso()
    const offsitePath = join(offsiteDir, `jeweltrackerpro-${today}.db`)

    try {
      const saved = await agent.put('/api/backup/settings').send({
        frequency: 'daily',
        time: '21:00',
        offsiteDir,
      })
      expect(saved.status).toBe(200)
      expect(saved.body.offsiteDir).toBeTruthy()

      const copied = await agent.post('/api/backup/offsite-copy')
      expect(copied.status).toBe(200)
      expect(copied.body.lastOffsiteAt).toBeTruthy()
      expect(copied.body.lastOffsiteError).toBeNull()
      expect(existsSync(offsitePath)).toBe(true)
      assertSqliteIntegrity(offsitePath)
      const offsiteExcel = join(offsiteDir, `jeweltrackerpro-${today}.xlsx`)
      expect(existsSync(offsiteExcel)).toBe(true)
      expect(readFileSync(offsiteExcel).toString('utf8')).toContain('Test customer')
      await proveBackupRestores(offsitePath, join(getUserDataDir(), 'backups', `jeweltrackerpro-${today}.db`))

      const skipped = await copyNewestBackupOffsite()
      expect(skipped.lastOffsiteAt).toBe(copied.body.lastOffsiteAt)

      await seedCustomer('Later ring')
      expect(await ipc<Customer[]>(IPC_CHANNELS.CUSTOMERS_LIST)).toHaveLength(2)

      await restoreDatabaseFrom(offsitePath)
      const customers = await ipc<Customer[]>(IPC_CHANNELS.CUSTOMERS_LIST)
      expect(customers).toHaveLength(1)
      expect(customers[0]?.name).toBe('Test customer')
    } finally {
      rmSync(offsiteDir, { recursive: true, force: true })
    }
  })

  it('records a missing off-machine folder without skipping the local backup', async () => {
    await seedCustomer()
    const agent = getTestAgent()
    const parent = mkdtempSync(join(tmpdir(), 'jtp-offsite-parent-'))
    const missing = join(parent, 'not-plugged-in')

    try {
      const saved = await agent.put('/api/backup/settings').send({
        frequency: 'daily',
        time: '21:00',
        offsiteDir: missing,
      })
      expect(saved.status).toBe(200)

      const copied = await agent.post('/api/backup/offsite-copy')
      expect(copied.status).toBe(400)
      expect(copied.body.error).toBe('Off-machine folder was not found')

      const status = await agent.get('/api/backup/status')
      expect(status.body.lastBackupAt).toBeTruthy()
      expect(status.body.lastOffsiteAt).toBeNull()
      expect(status.body.lastOffsiteError).toBe('Off-machine folder was not found')
      expect(existsSync(join(getUserDataDir(), 'backups', `jeweltrackerpro-${localDateIso()}.db`))).toBe(true)
      expect(existsSync(join(missing, `jeweltrackerpro-${localDateIso()}.db`))).toBe(false)
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })

  it('copies off-machine after a scheduled local backup', async () => {
    await seedCustomer()
    const offsiteDir = mkdtempSync(join(tmpdir(), 'jtp-offsite-tick-'))
    const today = localDateIso()
    const agent = getTestAgent()

    try {
      await agent.put('/api/backup/settings').send({
        frequency: 'daily',
        time: '21:00',
        offsiteDir,
      })
      setShopSetting(getDatabase(), LAST_BACKUP_AT_KEY, new Date(Date.now() - 3 * 86_400_000).toISOString())
      await tickScheduledBackup()

      const localPath = join(getUserDataDir(), 'backups', `jeweltrackerpro-${today}.db`)
      const offsitePath = join(offsiteDir, `jeweltrackerpro-${today}.db`)
      expect(existsSync(localPath)).toBe(true)
      expect(existsSync(offsitePath)).toBe(true)
      expect(existsSync(join(offsiteDir, `jeweltrackerpro-${today}.xlsx`))).toBe(true)
      assertSqliteIntegrity(offsitePath)

      const status = await agent.get('/api/backup/status')
      expect(status.body.lastOffsiteAt).toBeTruthy()
      expect(status.body.lastOffsiteError).toBeNull()
    } finally {
      rmSync(offsiteDir, { recursive: true, force: true })
    }
  })

  it('downloads an Excel workbook of every table', async () => {
    await seedCustomer()
    const agent = getTestAgent()
    const exported = await agent
      .get('/api/backup/export-excel')
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => {
          chunks.push(Buffer.from(chunk))
        })
        res.on('end', () => {
          callback(null, Buffer.concat(chunks))
        })
      })
    expect(exported.status).toBe(200)
    const body = Buffer.isBuffer(exported.body) ? exported.body : Buffer.from(exported.body)
    expect(body.subarray(0, 2).toString()).toBe('PK')
    expect(body.toString('utf8')).toContain('Test customer')
    expect(body.toString('utf8')).toContain('_tables')
    expect(body.toString('utf8')).toContain('customers')
    expect(body.toString('utf8')).toContain('pledges')
  })

  it('rejects a file that is not an AdaguTrackerPro backup without touching live data', async () => {
    await seedCustomer()
    const agent = getTestAgent()
    const backupsDir = join(getUserDataDir(), 'backups')
    mkdirSync(backupsDir, { recursive: true })
    const foreignPath = join(backupsDir, 'jeweltrackerpro-2020-01-01.db')
    const foreign = new Database(foreignPath)
    foreign.exec('CREATE TABLE foo (id INTEGER PRIMARY KEY)')
    foreign.close()

    const response = await agent
      .post('/api/backup/restore-local')
      .send({ name: 'jeweltrackerpro-2020-01-01.db' })
    expect(response.status).toBe(400)
    expect(response.body.error).toBe('This file is not an AdaguTrackerPro backup')
    expect(await ipc<Customer[]>(IPC_CHANNELS.CUSTOMERS_LIST)).toHaveLength(1)
  })

  it('rejects a backup made by a newer version of the app', async () => {
    await seedCustomer()
    const agent = getTestAgent()
    const backupsDir = join(getUserDataDir(), 'backups')
    mkdirSync(backupsDir, { recursive: true })
    const target = join(backupsDir, 'jeweltrackerpro-2020-01-02.db')
    await backupDatabaseTo(target)
    const snapshot = new Database(target)
    snapshot
      .prepare(
        'UPDATE schema_migrations SET version = ? WHERE version = (SELECT MAX(version) FROM schema_migrations)',
      )
      .run(latestMigrationVersion() + 1)
    snapshot.close()

    const response = await agent
      .post('/api/backup/restore-local')
      .send({ name: 'jeweltrackerpro-2020-01-02.db' })
    expect(response.status).toBe(400)
    expect(response.body.error).toContain('newer version')
    expect(await ipc<Customer[]>(IPC_CHANNELS.CUSTOMERS_LIST)).toHaveLength(1)
  })

  it('rejects a stub that is missing required tables without touching live data', async () => {
    await seedCustomer()
    const backupsDir = join(getUserDataDir(), 'backups')
    mkdirSync(backupsDir, { recursive: true })

    const stubPath = join(backupsDir, 'jeweltrackerpro-manual-19990101-000000.db')
    const stub = new Database(stubPath)
    stub.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO schema_migrations (version) VALUES (55);
      CREATE TABLE users (id INTEGER PRIMARY KEY);
      CREATE TABLE shop_settings (key TEXT PRIMARY KEY, value TEXT);
    `)
    stub.close()

    await expect(restoreDatabaseFrom(stubPath)).rejects.toThrow()
    expect(await ipc<Customer[]>(IPC_CHANNELS.CUSTOMERS_LIST)).toHaveLength(1)
  })

  it('keeps a pre-restore safety copy before replacing data', async () => {
    await seedCustomer()
    const backupsDir = join(getUserDataDir(), 'backups')
    const destination = join(backupsDir, 'jeweltrackerpro-manual-19990101-000001.db')
    mkdirSync(backupsDir, { recursive: true })
    await backupDatabaseTo(destination)

    await restoreDatabaseFrom(destination)

    expect(readdirSync(backupsDir).some((name) => name.startsWith('jeweltrackerpro-prerestore-'))).toBe(true)
  })

  it('writes a safety snapshot before applying pending migrations', () => {
    const backupsDir = join(getUserDataDir(), 'backups')
    mkdirSync(backupsDir, { recursive: true })
    const premigrateFiles = () =>
      readdirSync(backupsDir).filter((name) => name.startsWith('jeweltrackerpro-premigrate-'))

    // The fresh database from beforeEach applied every migration, so nothing was written.
    expect(premigrateFiles()).toHaveLength(0)

    const name = writePremigrateSnapshot(getDatabase(), latestMigrationVersion())
    expect(premigrateFiles()).toContain(name)
    assertSqliteIntegrity(join(backupsDir, name))
  })

  it('mirrors shop images off-machine and copies them back on restore', async () => {
    await seedCustomer()
    const agent = getTestAgent()
    const offsiteDir = mkdtempSync(join(tmpdir(), 'jtp-offsite-media-'))
    const uploadsDir = getUploadsDir()
    const imageName = 'logo-test.png'
    writeFileSync(join(uploadsDir, imageName), 'fake-image-bytes')

    try {
      await agent
        .put('/api/backup/settings')
        .send({ frequency: 'daily', time: '21:00', offsiteDir })
      const copied = await agent.post('/api/backup/offsite-copy')
      expect(copied.status).toBe(200)
      expect(existsSync(join(offsiteDir, 'uploads', imageName))).toBe(true)

      rmSync(join(uploadsDir, imageName))
      await restoreDatabaseFrom(join(offsiteDir, `jeweltrackerpro-${localDateIso()}.db`))
      expect(existsSync(join(uploadsDir, imageName))).toBe(true)
    } finally {
      rmSync(offsiteDir, { recursive: true, force: true })
    }
  })

  it('detects a tampered off-machine copy', async () => {
    await seedCustomer()
    const agent = getTestAgent()
    const offsiteDir = mkdtempSync(join(tmpdir(), 'jtp-offsite-tamper-'))
    const localPath = join(getUserDataDir(), 'backups', `jeweltrackerpro-${localDateIso()}.db`)
    const offsitePath = join(offsiteDir, `jeweltrackerpro-${localDateIso()}.db`)
    try {
      await agent
        .put('/api/backup/settings')
        .send({ frequency: 'daily', time: '21:00', offsiteDir })
      await agent.post('/api/backup/offsite-copy')
      appendFileSync(offsitePath, 'tampered')
      await expect(proveBackupRestores(offsitePath, localPath)).rejects.toThrow()
    } finally {
      rmSync(offsiteDir, { recursive: true, force: true })
    }
  })

  it('reports what a backup contains without restoring it', async () => {
    await seedCustomer()
    const agent = getTestAgent()
    const created = await agent.post('/api/backup/create')
    const backup = created.body as BackupFile

    const inspected = await agent.post('/api/backup/inspect').send({ name: backup.name })
    expect(inspected.status).toBe(200)
    const result = inspected.body as BackupInspection
    expect(result.restorable).toBe(true)
    expect(result.schemaVersion).toBe(latestMigrationVersion())
    expect(result.appSchemaVersion).toBe(latestMigrationVersion())
    expect(result.counts.customers).toBe(1)
    expect(result.counts.pledges).toBe(0)
    expect(result.counts.goldSavingAccounts).toBe(0)
    expect(result.issues).toHaveLength(0)
  })

  it('removes the temporary export file after a download', async () => {
    await seedCustomer()
    const agent = getTestAgent()
    const exportPath = join(tmpdir(), `jeweltrackerpro-backup-${new Date().toISOString().slice(0, 10)}.db`)
    const exported = await agent.get('/api/backup/export')
    expect(exported.status).toBe(200)

    for (let attempt = 0; attempt < 40 && existsSync(exportPath); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    expect(existsSync(exportPath)).toBe(false)
  })

  it('keeps this computer\'s backup settings and off-machine photos when restoring', async () => {
    await seedCustomer()
    const agent = getTestAgent()
    const offsiteDir = mkdtempSync(join(tmpdir(), 'jtp-restore-settings-'))
    const backupsDir = join(getUserDataDir(), 'backups')
    const snapshot = join(backupsDir, 'jeweltrackerpro-manual-19990101-000002.db')
    mkdirSync(backupsDir, { recursive: true })
    await backupDatabaseTo(snapshot)

    try {
      const saved = await agent.put('/api/backup/settings').send({
        frequency: 'weekly',
        time: '09:30',
        offsiteDir,
      })
      expect(saved.status).toBe(200)
      const scheduledAt = new Date().toISOString()
      setShopSetting(getDatabase(), LAST_SCHEDULED_BACKUP_AT_KEY, scheduledAt)

      const imageName = 'logo-keep.png'
      mkdirSync(join(offsiteDir, 'uploads'), { recursive: true })
      writeFileSync(join(offsiteDir, 'uploads', imageName), 'logo-bytes')
      const poisoned = new Database(snapshot)
      poisoned
        .prepare(
          `INSERT INTO shop_settings (key, value) VALUES ('backup_offsite_dir', '')
           ON CONFLICT(key) DO UPDATE SET value = ''`,
        )
        .run()
      poisoned
        .prepare(
          `INSERT INTO shop_settings (key, value) VALUES ('backup_frequency', 'daily')
           ON CONFLICT(key) DO UPDATE SET value = 'daily'`,
        )
        .run()
      poisoned.close()

      await restoreDatabaseFrom(snapshot)

      const status = await agent.get('/api/backup/status')
      expect(status.body.frequency).toBe('weekly')
      expect(status.body.time).toBe('09:30')
      expect(status.body.offsiteDir).toBe(resolve(offsiteDir))
      expect(getShopSetting(getDatabase(), LAST_SCHEDULED_BACKUP_AT_KEY, '')).toBe(scheduledAt)
      expect(existsSync(join(getUploadsDir(), imageName))).toBe(true)
      expect(readFileSync(join(getUploadsDir(), imageName)).toString()).toBe('logo-bytes')

      const daily = join(backupsDir, `jeweltrackerpro-${localDateIso()}.db`)
      const before = existsSync(daily) ? statSync(daily).mtimeMs : null
      await tickScheduledBackup()
      const after = existsSync(daily) ? statSync(daily).mtimeMs : null
      expect(after).toBe(before)
      expect(getShopSetting(getDatabase(), LAST_SCHEDULED_BACKUP_AT_KEY, '')).toBe(scheduledAt)
    } finally {
      rmSync(offsiteDir, { recursive: true, force: true })
    }
  })

  it('leaves the previous backup in place when a snapshot fails and removes leftover temp files', async () => {
    const dir = join(getUserDataDir(), 'backups')
    mkdirSync(dir, { recursive: true })
    const today = localDateIso()
    const dest = join(dir, `jeweltrackerpro-${today}.db`)
    await backupDatabaseTo(dest)
    const before = readFileSync(dest)
    const partial = join(dir, `~$jeweltrackerpro-${today}.db.tmp`)
    const database = getDatabase()
    const originalBackup = database.backup.bind(database)
    database.backup = async () => {
      throw new Error('disk full')
    }

    try {
      await expect(backupDatabaseTo(dest)).rejects.toThrow('disk full')
    } finally {
      database.backup = originalBackup
    }
    expect(readFileSync(dest).equals(before)).toBe(true)
    expect(existsSync(partial)).toBe(false)

    const stale = join(dir, '~$jeweltrackerpro-stale.db.tmp')
    writeFileSync(stale, 'partial')
    pruneBackupFiles(dir)
    expect(existsSync(stale)).toBe(false)
    expect(existsSync(dest)).toBe(true)
  })

  it('records a failed automatic backup and clears it after the next success', async () => {
    const agent = getTestAgent()
    const dir = join(getUserDataDir(), 'backups')
    mkdirSync(dir, { recursive: true })
    setShopSetting(
      getDatabase(),
      LAST_SCHEDULED_BACKUP_AT_KEY,
      new Date(Date.now() - 3 * 86_400_000).toISOString(),
    )
    const database = getDatabase()
    const originalBackup = database.backup.bind(database)
    let attempts = 0
    database.backup = async () => {
      attempts += 1
      throw new Error('disk full')
    }

    try {
      await tickScheduledBackup()
      const failed = await agent.get('/api/backup/status')
      expect(failed.status).toBe(200)
      expect(failed.body.lastBackupError).toContain('disk full')
      expect(attempts).toBe(1)

      await tickScheduledBackup()
      const cooled = await agent.get('/api/backup/status')
      expect(cooled.body.lastBackupError).toBe(failed.body.lastBackupError)
      expect(attempts).toBe(1)
    } finally {
      database.backup = originalBackup
    }

    const created = await agent.post('/api/backup/create')
    expect(created.status).toBe(200)
    const cleared = await agent.get('/api/backup/status')
    expect(cleared.body.lastBackupError).toBeNull()
  })

  it('backs up every few hours only after data has changed', async () => {
    const now = new Date(2026, 9, 13, 10, 0, 0)
    const earlier = new Date(now.getTime() - 4 * 60 * 60 * 1000)
    const db = getDatabase()
    setShopSetting(db, 'backup_frequency', 'daily')
    setShopSetting(db, 'backup_time', '21:00')
    setShopSetting(db, LAST_BACKUP_AT_KEY, earlier.toISOString())
    setShopSetting(db, LAST_SCHEDULED_BACKUP_AT_KEY, earlier.toISOString())
    rememberChangeBaseline()

    const daily = join(getUserDataDir(), 'backups', `jeweltrackerpro-${localDateIso(now)}.db`)
    await tickScheduledBackup(now)
    expect(existsSync(daily)).toBe(false)
    expect(getShopSetting(db, LAST_SCHEDULED_BACKUP_AT_KEY, '')).toBe(earlier.toISOString())

    await seedCustomer('Changed after backup')
    await tickScheduledBackup(now)
    expect(existsSync(daily)).toBe(true)
    assertSqliteIntegrity(daily)
    expect(getShopSetting(getDatabase(), LAST_SCHEDULED_BACKUP_AT_KEY, '')).toBe(earlier.toISOString())
    expect(getShopSetting(getDatabase(), LAST_BACKUP_AT_KEY, '')).not.toBe(earlier.toISOString())
  })

  it('does not treat an off-machine copy as a reason to back up again', async () => {
    const now = new Date(2026, 9, 13, 10, 0, 0)
    const earlier = new Date(now.getTime() - 4 * 60 * 60 * 1000)
    const offsiteDir = mkdtempSync(join(tmpdir(), 'jtp-offsite-unchanged-'))
    const agent = getTestAgent()
    const daily = join(getUserDataDir(), 'backups', `jeweltrackerpro-${localDateIso(now)}.db`)

    try {
      const saved = await agent.put('/api/backup/settings').send({
        frequency: 'daily',
        time: '21:00',
        offsiteDir,
      })
      expect(saved.status).toBe(200)
      await backupDatabaseTo(daily)
      const db = getDatabase()
      setShopSetting(db, LAST_BACKUP_AT_KEY, earlier.toISOString())
      setShopSetting(db, LAST_SCHEDULED_BACKUP_AT_KEY, earlier.toISOString())
      rememberChangeBaseline()
      const before = statSync(daily).mtimeMs

      await tickScheduledBackup(now)
      await tickScheduledBackup(now)

      expect(statSync(daily).mtimeMs).toBe(before)
      expect(getShopSetting(getDatabase(), LAST_BACKUP_AT_KEY, '')).toBe(earlier.toISOString())
      expect(getShopSetting(getDatabase(), LAST_SCHEDULED_BACKUP_AT_KEY, '')).toBe(earlier.toISOString())
      expect(existsSync(join(offsiteDir, `jeweltrackerpro-${localDateIso(now)}.db`))).toBe(true)
    } finally {
      rmSync(offsiteDir, { recursive: true, force: true })
    }
  })

  it('round-trips a full zip backup with photos and rejects a path-escaping archive', async () => {
    const customer = await seedCustomer('Zip customer')
    const agent = getTestAgent()
    const uploadsDir = getUploadsDir()
    const imageName = 'pledge-photo.png'
    writeFileSync(join(uploadsDir, imageName), 'photo-bytes')

    const exported = await agent
      .get('/api/backup/export-full')
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => {
          chunks.push(Buffer.from(chunk))
        })
        res.on('end', () => {
          callback(null, Buffer.concat(chunks))
        })
      })
    expect(exported.status).toBe(200)
    const body = Buffer.isBuffer(exported.body) ? exported.body : Buffer.from(exported.body)
    expect(body.subarray(0, 2).toString()).toBe('PK')

    const zipPath = join(tmpdir(), `jtp-full-${Date.now()}.zip`)
    const extracted = mkdtempSync(join(tmpdir(), 'jtp-full-extract-'))
    writeFileSync(zipPath, body)
    try {
      await extractZipFile(zipPath, extracted, allowFullBackupEntry)
      expect(readFileSync(join(extracted, 'uploads', imageName)).toString()).toBe('photo-bytes')
      expect(existsSync(join(extracted, 'jeweltrackerpro.db'))).toBe(true)

      const relative = await agent.post('/api/backup/export-full').send({ path: 'relative.zip' })
      expect(relative.status).toBe(400)

      rmSync(join(uploadsDir, imageName))
      await seedCustomer('After export')
      expect(await ipc<Customer[]>(IPC_CHANNELS.CUSTOMERS_LIST)).toHaveLength(2)

      const restored = await agent.post('/api/backup/restore').attach('file', zipPath)
      expect(restored.status).toBe(200)
      const customers = await ipc<Customer[]>(IPC_CHANNELS.CUSTOMERS_LIST)
      expect(customers).toHaveLength(1)
      expect(customers[0]?.name).toBe(customer.name)
      expect(readFileSync(join(getUploadsDir(), imageName)).toString()).toBe('photo-bytes')

      const evilPath = join(tmpdir(), `jtp-evil-${Date.now()}.zip`)
      writeFileSync(evilPath, storedZip([{ name: '../evil', data: Buffer.from('x') }]))
      await seedCustomer('Still here')
      const rejected = await agent.post('/api/backup/restore').attach('file', evilPath)
      expect(rejected.status).toBe(400)
      expect(await ipc<Customer[]>(IPC_CHANNELS.CUSTOMERS_LIST)).toHaveLength(2)
      rmSync(evilPath, { force: true })
    } finally {
      rmSync(zipPath, { force: true })
      rmSync(extracted, { recursive: true, force: true })
    }
  })
})

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value, 0)
  return buffer
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value, 0)
  return buffer
}

function storedZip(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const crc = crc32(entry.data)
    const size = entry.data.length
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0),
      name,
      entry.data,
    ])
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ])
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const localBytes = Buffer.concat(locals)
  const centralBytes = Buffer.concat(centrals)
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralBytes.length),
    u32(localBytes.length),
    u16(0),
  ])
  return Buffer.concat([localBytes, centralBytes, eocd])
}
