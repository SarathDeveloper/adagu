import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BackupEncryptionStatus } from '@shared/types'
import {
  type BackupKeyMaterial,
  type BackupSecret,
  BackupSecretError,
  createKeyMaterial,
  keyIdFor,
  type KeyWrap,
  rewrapPassword,
  unlockWraps,
} from '../lib/backupCrypto'
import { HttpError } from '../lib/http'
import { getDataDir } from '../lib/paths'

/**
 * This computer's backup key. It lives in its own file in the app data folder,
 * not in the database, so it is never inside a backup it protects. The live
 * database beside it is not encrypted, so keeping the key here adds no new
 * exposure; what it protects is every copy that leaves this folder.
 */
const KEY_FILE = 'backup-key.json'

type StoredKey = {
  v: 1
  dek: string
  keyId: string
  wraps: KeyWrap[]
  createdAt: string
}

export const MIN_BACKUP_PASSWORD_LENGTH = 8

function keyFilePath(): string {
  return join(getDataDir(), KEY_FILE)
}

export function loadBackupKey(): BackupKeyMaterial | null {
  const path = keyFilePath()
  if (!existsSync(path)) return null
  const stored = JSON.parse(readFileSync(path, 'utf8')) as StoredKey
  const dek = Buffer.from(stored.dek, 'base64')
  if (stored.v !== 1 || dek.length !== 32 || keyIdFor(dek) !== stored.keyId) {
    throw new Error('The backup key file on this computer is damaged')
  }
  return { dek, keyId: stored.keyId, wraps: stored.wraps }
}

function readCreatedAt(): string | null {
  try {
    return (JSON.parse(readFileSync(keyFilePath(), 'utf8')) as StoredKey).createdAt ?? null
  } catch {
    return null
  }
}

function saveBackupKey(material: BackupKeyMaterial, createdAt = new Date().toISOString()): void {
  const stored: StoredKey = {
    v: 1,
    dek: material.dek.toString('base64'),
    keyId: material.keyId,
    wraps: material.wraps,
    createdAt,
  }
  const path = keyFilePath()
  const partial = `${path}.tmp`
  writeFileSync(partial, JSON.stringify(stored), { mode: 0o600 })
  renameSync(partial, path)
}

export function getBackupEncryptionStatus(): BackupEncryptionStatus {
  const enabled = existsSync(keyFilePath())
  return { enabled, createdAt: enabled ? readCreatedAt() : null }
}

function assertPassword(password: string): void {
  if (password.length < MIN_BACKUP_PASSWORD_LENGTH) {
    throw new HttpError(400, `The backup password must be at least ${MIN_BACKUP_PASSWORD_LENGTH} characters`)
  }
}

/** Turns encryption on. Returns the recovery key, which is shown once and never stored. */
export async function enableBackupEncryption(password: string): Promise<{ recoveryKey: string }> {
  assertPassword(password)
  if (existsSync(keyFilePath())) {
    throw new HttpError(409, 'Backup encryption is already on. Change the password instead.')
  }
  const { material, recoveryKey } = await createKeyMaterial(password)
  saveBackupKey(material)
  return { recoveryKey }
}

/** New password for the same key. Needs the current password or the recovery key. */
export async function changeBackupPassword(secret: BackupSecret, newPassword: string): Promise<void> {
  assertPassword(newPassword)
  const material = loadBackupKey()
  if (!material) {
    throw new HttpError(400, 'Backup encryption is not on')
  }
  try {
    await unlockWraps(material.wraps, material.keyId, secret)
  } catch (error) {
    if (error instanceof BackupSecretError) {
      throw new HttpError(400, 'The current password or recovery key is not correct')
    }
    throw error
  }
  saveBackupKey(await rewrapPassword(material, newPassword), readCreatedAt() ?? undefined)
}

/**
 * After an encrypted backup is restored on a computer with no key of its own,
 * keep that backup's key so the off-machine copies it finds can be read and new
 * backups stay encrypted with the same password and recovery key.
 */
export function adoptBackupKey(dek: Buffer, wraps: KeyWrap[]): boolean {
  if (existsSync(keyFilePath())) return false
  saveBackupKey({ dek, keyId: keyIdFor(dek), wraps })
  return true
}

export function removeBackupKeyForTests(): void {
  rmSync(keyFilePath(), { force: true })
}
