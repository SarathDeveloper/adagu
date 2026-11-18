import { existsSync, mkdtempSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import {
  backupSettingsSchema,
  changeBackupPasswordSchema,
  enableBackupEncryptionSchema,
  exportFullBackupSchema,
  inspectBackupSchema,
  restoreBackupNameSchema,
} from '@shared/schemas'
import {
  allowFullBackupEntry,
  FULL_BACKUP_DB_NAMES,
  assertFullBackupDestination,
  copyNewestBackupOffsite,
  createManualBackup,
  decryptBackupToTemp,
  deleteBackup,
  exportsEncrypted,
  getBackupStatus,
  getOffsiteDir,
  inspectBackup,
  isEncryptedFile,
  listBackups,
  removeDecryptedTemp,
  restoreBackupByName,
  restoreDatabaseFrom,
  updateBackupSchedule,
  withBackupLock,
  writeDatabaseExport,
  writeFullBackup,
} from '../db/backup'
import { changeBackupPassword, enableBackupEncryption, getBackupEncryptionStatus } from '../db/backupKey'
import { ENCRYPTED_SUFFIX } from '../lib/backupCrypto'
import { extractZipFile, isZipFile } from '../lib/zip'
import { writeExcelBackupFromDatabaseYielding } from '../db/excelBackup'
import { getDatabase, getDbPath } from '../db'
import { requireRole } from '../auth/middleware'
import { asyncHandler, HttpError, parseBody } from '../lib/http'

const upload = multer({
  dest: tmpdir(),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
})

const router = Router()

/**
 * Status, the backup list, inspecting a backup and making a new one stay open
 * to anyone with Settings access. Everything that sends the data out of the
 * app (exports hold Aadhaar/PAN and password hashes), replaces it (restore),
 * deletes backups or changes where copies are written is admin-only: a restore
 * in particular can rewrite the users table, roles included.
 */
const adminOnly = requireRole('admin')

function removeTempFile(filePath: string | undefined): void {
  if (!filePath) return
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
  } catch {
    // A leftover temp file is not worth failing the request over.
  }
}

router.get(
  '/status',
  asyncHandler((_req, res) => {
    res.json(getBackupStatus())
  }),
)

router.get(
  '/encryption',
  asyncHandler((_req, res) => {
    res.json(getBackupEncryptionStatus())
  }),
)

/** Turns encryption on and returns the recovery key. It is shown once and never stored. */
router.post(
  '/encryption',
  adminOnly,
  asyncHandler(async (req, res) => {
    const { password } = parseBody(enableBackupEncryptionSchema, req.body)
    res.json(await enableBackupEncryption(password))
  }),
)

router.put(
  '/encryption/password',
  adminOnly,
  asyncHandler(async (req, res) => {
    const input = parseBody(changeBackupPasswordSchema, req.body)
    await changeBackupPassword(
      { password: input.currentPassword, recoveryKey: input.recoveryKey },
      input.newPassword,
    )
    res.json(getBackupEncryptionStatus())
  }),
)

router.put(
  '/settings',
  adminOnly,
  asyncHandler((req, res) => {
    const input = parseBody(backupSettingsSchema, req.body)
    res.json(updateBackupSchedule(input))
  }),
)

router.get(
  '/list',
  asyncHandler((_req, res) => {
    res.json(listBackups())
  }),
)

router.post(
  '/inspect',
  asyncHandler((req, res) => {
    const { name } = parseBody(inspectBackupSchema, req.body)
    res.json(inspectBackup(name))
  }),
)

router.post(
  '/create',
  asyncHandler(async (_req, res) => {
    res.json(await createManualBackup())
  }),
)

router.post(
  '/offsite-copy',
  adminOnly,
  asyncHandler(async (_req, res) => {
    if (!getOffsiteDir()) {
      throw new HttpError(400, 'Choose an off-machine folder first')
    }
    const status = await copyNewestBackupOffsite({ forceFresh: true })
    if (status.lastOffsiteError) {
      throw new HttpError(400, status.lastOffsiteError)
    }
    res.json(status)
  }),
)

router.get(
  '/export',
  adminOnly,
  asyncHandler(async (_req, res) => {
    const encrypted = exportsEncrypted()
    const filename = `pawndesk-backup-${new Date().toISOString().slice(0, 10)}.db${encrypted ? ENCRYPTED_SUFFIX : ''}`
    const destination = join(tmpdir(), `pd-export-${Date.now()}-${filename}`)
    await withBackupLock(async () => {
      await writeDatabaseExport(destination)
    })
    res.download(destination, filename, () => removeTempFile(destination))
  }),
)

router.get(
  '/export-full',
  adminOnly,
  asyncHandler(async (_req, res) => {
    const suffix = exportsEncrypted() ? `.zip${ENCRYPTED_SUFFIX}` : '.zip'
    const filename = `pawndesk-full-${new Date().toISOString().slice(0, 10)}${suffix}`
    const destination = join(tmpdir(), `pawndesk-full-${Date.now()}${suffix}`)
    await withBackupLock(async () => {
      await writeFullBackup(destination)
    })
    res.download(destination, filename, () => removeTempFile(destination))
  }),
)

router.post(
  '/export-full',
  adminOnly,
  asyncHandler(async (req, res) => {
    const { path: filePath } = parseBody(exportFullBackupSchema, req.body)
    const destination = assertFullBackupDestination(filePath)
    await withBackupLock(async () => {
      await writeFullBackup(destination)
    })
    res.json({ ok: true, path: destination })
  }),
)

router.get(
  '/export-excel',
  adminOnly,
  asyncHandler(async (_req, res) => {
    const filename = `pawndesk-tables-${new Date().toISOString().slice(0, 10)}.xlsx`
    const destination = join(tmpdir(), filename)
    await withBackupLock(async () => {
      await writeExcelBackupFromDatabaseYielding(getDatabase(), destination)
    })
    res.download(destination, filename, () => removeTempFile(destination))
  }),
)

router.post(
  '/restore',
  adminOnly,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, 'Backup file is required')
    }
    const original = req.file.path
    let uploaded = original
    let decrypted: string | null = null
    let adoptKey: (() => void) | undefined
    let extracted: string | null = null
    try {
      if (isEncryptedFile(original)) {
        const body = (req.body ?? {}) as { password?: unknown; recoveryKey?: unknown }
        const password = typeof body.password === 'string' ? body.password : ''
        const recoveryKey = typeof body.recoveryKey === 'string' ? body.recoveryKey : ''
        // Without a password this only opens backups made with this computer's
        // key; otherwise it answers BACKUP_LOCKED_MESSAGE and the screen asks.
        const opened = await decryptBackupToTemp(original, { password, recoveryKey })
        decrypted = opened.path
        adoptKey = opened.adopt
        uploaded = decrypted
      }
      if (isZipFile(uploaded)) {
        extracted = mkdtempSync(join(tmpdir(), 'pd-restore-'))
        try {
          await extractZipFile(uploaded, extracted, allowFullBackupEntry)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Backup file could not be opened'
          throw new HttpError(400, message)
        }
        const root = extracted
        const dbPath = FULL_BACKUP_DB_NAMES.map((name) => join(root, name)).find((path) => existsSync(path))
        if (!dbPath) {
          throw new HttpError(400, 'This file is not an PawnDesk backup')
        }
        const status = await restoreDatabaseFrom(dbPath, {
          uploadsDir: join(extracted, 'uploads'),
          beforeImages: adoptKey,
        })
        res.json(status)
        return
      }
      const status = await restoreDatabaseFrom(uploaded, { beforeImages: adoptKey })
      res.json(status)
    } finally {
      removeTempFile(original)
      if (decrypted) {
        removeDecryptedTemp(decrypted)
      }
      if (extracted) {
        rmSync(extracted, { recursive: true, force: true })
      }
    }
  }),
)

router.post(
  '/restore-local',
  adminOnly,
  asyncHandler(async (req, res) => {
    const { name } = parseBody(restoreBackupNameSchema, req.body)
    res.json(await restoreBackupByName(name))
  }),
)

router.delete(
  '/:name',
  adminOnly,
  asyncHandler((req, res) => {
    const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name
    if (!name) {
      throw new HttpError(400, 'Invalid backup file name')
    }
    deleteBackup(name)
    res.status(204).end()
  }),
)

router.get(
  '/path',
  asyncHandler((_req, res) => {
    const dbPath = getDbPath()
    res.json({ dbPath, exists: existsSync(dbPath) })
  }),
)

export default router
