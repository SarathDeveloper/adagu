import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto'
import { closeSync, createReadStream, existsSync, openSync, readSync, renameSync, rmSync, statSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { BACKUP_LOCKED_MESSAGE, ENCRYPTED_BACKUP_SUFFIX } from '@shared/backupRetention'

/**
 * Encrypted backup files (`*.pdenc`).
 *
 * Every file is AES-256-GCM encrypted with one random data key per shop. The
 * data key never leaves this computer in the clear: each file's header carries
 * it wrapped twice, once by a key derived from the backup password and once by
 * a key derived from the printed recovery key, so either one opens any backup
 * on any computer. The header itself is authenticated as GCM additional data.
 *
 * Layout: MAGIC (8 bytes) | header length (uint32 BE) | header JSON | ciphertext | GCM tag (16 bytes)
 */

export const ENCRYPTED_SUFFIX = ENCRYPTED_BACKUP_SUFFIX

const MAGIC = Buffer.from([0x50, 0x44, 0x45, 0x4e, 0x43, 0x00, 0x01, 0x0a]) // "PDENC\0\1\n"
const TAG_LENGTH = 16
const IV_LENGTH = 12
const KEY_LENGTH = 32
const MAX_HEADER_LENGTH = 64 * 1024

/** scrypt cost: about 100 ms and 32 MB per attempt, so guessing is slow. */
const KDF = { N: 2 ** 15, r: 8, p: 1 } as const

export type KeyWrap = {
  type: 'password' | 'recovery'
  kdf: 'scrypt'
  N: number
  r: number
  p: number
  salt: string
  iv: string
  tag: string
  ct: string
}

export type BackupKeyMaterial = {
  /** The data key. Kept only on this computer. */
  dek: Buffer
  /** Short fingerprint of the data key, stored in every file header. */
  keyId: string
  wraps: KeyWrap[]
}

export type BackupSecret = { password?: string; recoveryKey?: string }

type FileHeader = {
  v: 1
  keyId: string
  iv: string
  wraps: KeyWrap[]
}

export class BackupSecretError extends Error {
  constructor(message = 'The backup password or recovery key is not correct') {
    super(message)
  }
}

function deriveKey(secret: string, salt: Buffer, params: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      secret.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { ...params, maxmem: 128 * params.N * params.r * 2 },
      (error, key) => (error ? reject(error) : resolve(key)),
    )
  })
}

export function keyIdFor(dek: Buffer): string {
  return createHash('sha256').update(dek).digest('hex').slice(0, 16)
}

async function wrapKey(dek: Buffer, type: KeyWrap['type'], secret: string): Promise<KeyWrap> {
  const salt = randomBytes(16)
  const iv = randomBytes(IV_LENGTH)
  const kek = await deriveKey(secret, salt, KDF)
  const cipher = createCipheriv('aes-256-gcm', kek, iv)
  cipher.setAAD(Buffer.from(`pawndesk-key:${type}`))
  const ct = Buffer.concat([cipher.update(dek), cipher.final()])
  return {
    type,
    kdf: 'scrypt',
    ...KDF,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
  }
}

async function unwrapKey(wrap: KeyWrap, secret: string): Promise<Buffer | null> {
  if (wrap.kdf !== 'scrypt' || wrap.N > 2 ** 20 || wrap.r > 32 || wrap.p > 16) return null
  const kek = await deriveKey(secret, Buffer.from(wrap.salt, 'base64'), wrap)
  try {
    const decipher = createDecipheriv('aes-256-gcm', kek, Buffer.from(wrap.iv, 'base64'))
    decipher.setAAD(Buffer.from(`pawndesk-key:${wrap.type}`))
    decipher.setAuthTag(Buffer.from(wrap.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(wrap.ct, 'base64')), decipher.final()])
  } catch {
    return null
  }
}

// Crockford base32: no I, L, O or U, so a hand-copied key is hard to misread.
const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function generateRecoveryKey(): string {
  const bytes = randomBytes(20)
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += RECOVERY_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return out.match(/.{4}/g)!.join('-')
}

/** Accepts the key as typed: any case, with or without dashes or spaces. */
export function normalizeRecoveryKey(input: string): string {
  const clean = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  return clean.match(/.{1,4}/g)?.join('-') ?? ''
}

export async function createKeyMaterial(password: string): Promise<{ material: BackupKeyMaterial; recoveryKey: string }> {
  const dek = randomBytes(KEY_LENGTH)
  const recoveryKey = generateRecoveryKey()
  const wraps = await Promise.all([
    wrapKey(dek, 'password', password),
    wrapKey(dek, 'recovery', normalizeRecoveryKey(recoveryKey)),
  ])
  return { material: { dek, keyId: keyIdFor(dek), wraps }, recoveryKey }
}

/** Same data key, new password. Old files still open with the old password or the recovery key. */
export async function rewrapPassword(material: BackupKeyMaterial, newPassword: string): Promise<BackupKeyMaterial> {
  const wraps = material.wraps.filter((wrap) => wrap.type !== 'password')
  wraps.unshift(await wrapKey(material.dek, 'password', newPassword))
  return { ...material, wraps }
}

/** Recovers the data key from a password or recovery key. Throws BackupSecretError when neither fits. */
export async function unlockWraps(wraps: KeyWrap[], keyId: string, secret: BackupSecret): Promise<Buffer> {
  const attempts: [KeyWrap['type'], string][] = []
  if (secret.password) attempts.push(['password', secret.password])
  if (secret.recoveryKey) attempts.push(['recovery', normalizeRecoveryKey(secret.recoveryKey)])
  for (const [type, value] of attempts) {
    for (const wrap of wraps.filter((candidate) => candidate.type === type)) {
      const dek = await unwrapKey(wrap, value)
      if (dek && dek.length === KEY_LENGTH && sameKeyId(keyIdFor(dek), keyId)) {
        return dek
      }
    }
  }
  throw new BackupSecretError()
}

function sameKeyId(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function buildPrefix(header: FileHeader): Buffer {
  const json = Buffer.from(JSON.stringify(header))
  const length = Buffer.alloc(4)
  length.writeUInt32BE(json.length)
  return Buffer.concat([MAGIC, length, json])
}

export function isEncryptedFile(filePath: string): boolean {
  let fd: number | null = null
  try {
    fd = openSync(filePath, 'r')
    const head = Buffer.alloc(MAGIC.length)
    return readSync(fd, head, 0, MAGIC.length, 0) === MAGIC.length && head.equals(MAGIC)
  } catch {
    return false
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

type ParsedFile = { header: FileHeader; prefix: Buffer; size: number }

function readFileHeader(filePath: string): ParsedFile {
  const size = statSync(filePath).size
  const fd = openSync(filePath, 'r')
  try {
    const fixed = Buffer.alloc(MAGIC.length + 4)
    if (readSync(fd, fixed, 0, fixed.length, 0) !== fixed.length || !fixed.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error('This is not an encrypted PawnDesk backup')
    }
    const length = fixed.readUInt32BE(MAGIC.length)
    if (length === 0 || length > MAX_HEADER_LENGTH || fixed.length + length + TAG_LENGTH > size) {
      throw new Error('Encrypted backup is damaged')
    }
    const json = Buffer.alloc(length)
    readSync(fd, json, 0, length, fixed.length)
    const header = JSON.parse(json.toString('utf8')) as FileHeader
    if (header.v !== 1 || typeof header.keyId !== 'string' || !Array.isArray(header.wraps) || typeof header.iv !== 'string') {
      throw new Error('Encrypted backup was made by a newer version of the app')
    }
    return { header, prefix: Buffer.concat([fixed, json]), size }
  } finally {
    closeSync(fd)
  }
}

export function readEncryptedHeader(filePath: string): { keyId: string; wraps: KeyWrap[] } {
  const { header } = readFileHeader(filePath)
  return { keyId: header.keyId, wraps: header.wraps }
}

function partialPathFor(destinationPath: string): string {
  // Leading "~$" keeps half-written files out of OneDrive/Drive sync clients
  // and lets the stale-partial sweep find them.
  return join(dirname(destinationPath), `~$${basename(destinationPath)}.tmp`)
}

/** Encrypts `sourcePath` into `destinationPath`, writing beside it first so a failure leaves nothing half-written. */
export async function encryptFile(sourcePath: string, destinationPath: string, material: BackupKeyMaterial): Promise<void> {
  const iv = randomBytes(IV_LENGTH)
  const prefix = buildPrefix({ v: 1, keyId: material.keyId, iv: iv.toString('base64'), wraps: material.wraps })
  const cipher = createCipheriv('aes-256-gcm', material.dek, iv)
  cipher.setAAD(prefix)
  const partial = partialPathFor(destinationPath)
  rmSync(partial, { force: true })
  const out = await open(partial, 'w')
  try {
    await out.write(prefix)
    for await (const chunk of createReadStream(sourcePath)) {
      const encrypted = cipher.update(chunk as Buffer)
      if (encrypted.length) await out.write(encrypted)
    }
    const last = cipher.final()
    if (last.length) await out.write(last)
    await out.write(cipher.getAuthTag())
    await out.sync()
    await out.close()
    if (existsSync(destinationPath)) rmSync(destinationPath, { force: true })
    renameSync(partial, destinationPath)
  } catch (error) {
    await out.close().catch(() => undefined)
    rmSync(partial, { force: true })
    throw error
  }
}

/**
 * Decrypts `sourcePath` into `destinationPath`. The key comes from `material`
 * when the file was made with this computer's key, otherwise from `secret`.
 * Returns the data key so a restore on a new computer can adopt it. The output
 * is removed again when the file fails authentication.
 */
export async function decryptFile(
  sourcePath: string,
  destinationPath: string,
  unlock: { material?: BackupKeyMaterial | null; secret?: BackupSecret },
): Promise<{ dek: Buffer; keyId: string; wraps: KeyWrap[] }> {
  const { header, prefix, size } = readFileHeader(sourcePath)
  let dek: Buffer
  if (unlock.material && sameKeyId(unlock.material.keyId, header.keyId)) {
    dek = unlock.material.dek
  } else if (unlock.secret && (unlock.secret.password || unlock.secret.recoveryKey)) {
    dek = await unlockWraps(header.wraps, header.keyId, unlock.secret)
  } else {
    throw new BackupSecretError(BACKUP_LOCKED_MESSAGE)
  }

  const tag = Buffer.alloc(TAG_LENGTH)
  const fd = openSync(sourcePath, 'r')
  try {
    readSync(fd, tag, 0, TAG_LENGTH, size - TAG_LENGTH)
  } finally {
    closeSync(fd)
  }

  const decipher = createDecipheriv('aes-256-gcm', dek, Buffer.from(header.iv, 'base64'))
  decipher.setAAD(prefix)
  decipher.setAuthTag(tag)
  rmSync(destinationPath, { force: true })
  const out = await open(destinationPath, 'w')
  try {
    const bodyEnd = size - TAG_LENGTH - 1
    if (bodyEnd >= prefix.length) {
      for await (const chunk of createReadStream(sourcePath, { start: prefix.length, end: bodyEnd })) {
        const plain = decipher.update(chunk as Buffer)
        if (plain.length) await out.write(plain)
      }
    }
    try {
      const last = decipher.final()
      if (last.length) await out.write(last)
    } catch {
      throw new Error('Encrypted backup is damaged or was changed')
    }
    await out.close()
  } catch (error) {
    await out.close().catch(() => undefined)
    rmSync(destinationPath, { force: true })
    throw error
  }
  return { dek, keyId: header.keyId, wraps: header.wraps }
}
