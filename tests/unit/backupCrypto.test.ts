import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BackupSecretError,
  createKeyMaterial,
  decryptFile,
  encryptFile,
  generateRecoveryKey,
  isEncryptedFile,
  normalizeRecoveryKey,
  rewrapPassword,
} from '../../server/lib/backupCrypto'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pd-crypto-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function plainFile(content: string | Buffer = 'Aadhaar 1234 5678 9012'): string {
  const path = join(dir, 'plain.db')
  writeFileSync(path, content)
  return path
}

describe('backup encryption', () => {
  it('round-trips with the computer key, the password and the recovery key', async () => {
    const { material, recoveryKey } = await createKeyMaterial('shop-secret-1')
    const source = plainFile()
    const sealed = join(dir, 'copy.db.pdenc')
    await encryptFile(source, sealed, material)

    expect(isEncryptedFile(sealed)).toBe(true)
    expect(isEncryptedFile(source)).toBe(false)
    expect(readFileSync(sealed).includes(Buffer.from('Aadhaar'))).toBe(false)

    for (const unlock of [
      { material },
      { secret: { password: 'shop-secret-1' } },
      { secret: { recoveryKey: recoveryKey.toLowerCase().replace(/-/g, ' ') } },
    ]) {
      const out = join(dir, 'out.db')
      await decryptFile(sealed, out, unlock)
      expect(readFileSync(out, 'utf8')).toBe('Aadhaar 1234 5678 9012')
    }
  })

  it('handles an empty file and a file larger than one read chunk', async () => {
    const { material } = await createKeyMaterial('shop-secret-1')
    for (const content of [Buffer.alloc(0), Buffer.alloc(300_000, 7)]) {
      const source = plainFile(content)
      const sealed = join(dir, 'copy.pdenc')
      const out = join(dir, 'out.bin')
      await encryptFile(source, sealed, material)
      await decryptFile(sealed, out, { material })
      expect(readFileSync(out).equals(content)).toBe(true)
    }
  })

  it('refuses a wrong password or no secret, and leaves no output', async () => {
    const { material } = await createKeyMaterial('shop-secret-1')
    const sealed = join(dir, 'copy.pdenc')
    await encryptFile(plainFile(), sealed, material)
    const out = join(dir, 'out.db')

    await expect(decryptFile(sealed, out, { secret: { password: 'wrong-password' } })).rejects.toBeInstanceOf(
      BackupSecretError,
    )
    await expect(decryptFile(sealed, out, {})).rejects.toBeInstanceOf(BackupSecretError)
    const other = await createKeyMaterial('another-shop')
    await expect(decryptFile(sealed, out, { material: other.material })).rejects.toBeInstanceOf(BackupSecretError)
  })

  it('detects a changed byte in the body or the header', async () => {
    const { material } = await createKeyMaterial('shop-secret-1')
    const sealed = join(dir, 'copy.pdenc')
    await encryptFile(plainFile('x'.repeat(5000)), sealed, material)
    const original = readFileSync(sealed)
    const out = join(dir, 'out.db')

    const body = Buffer.from(original)
    body[body.length - 100] ^= 1
    writeFileSync(sealed, body)
    await expect(decryptFile(sealed, out, { material })).rejects.toThrow(/damaged|changed/)

    const header = Buffer.from(original)
    const ivAt = header.indexOf(Buffer.from('"iv":"')) + 6
    header[ivAt] = header[ivAt] === 0x41 ? 0x42 : 0x41
    writeFileSync(sealed, header)
    await expect(decryptFile(sealed, out, { material })).rejects.toThrow()
  })

  it('keeps old files readable after the password changes', async () => {
    const { material, recoveryKey } = await createKeyMaterial('old-password')
    const sealedOld = join(dir, 'old.pdenc')
    await encryptFile(plainFile(), sealedOld, material)

    const updated = await rewrapPassword(material, 'new-password')
    expect(updated.keyId).toBe(material.keyId)
    const sealedNew = join(dir, 'new.pdenc')
    await encryptFile(plainFile(), sealedNew, updated)
    const out = join(dir, 'out.db')

    await decryptFile(sealedNew, out, { secret: { password: 'new-password' } })
    await expect(decryptFile(sealedNew, out, { secret: { password: 'old-password' } })).rejects.toBeInstanceOf(
      BackupSecretError,
    )
    await decryptFile(sealedOld, out, { secret: { password: 'old-password' } })
    await decryptFile(sealedNew, out, { secret: { recoveryKey } })
  })

  it('makes recovery keys that survive common typing slips', () => {
    const key = generateRecoveryKey()
    expect(key).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(normalizeRecoveryKey(key.toLowerCase().replace(/-/g, ''))).toBe(key)
    expect(normalizeRecoveryKey('o1il-0000')).toBe('0111-0000')
  })
})
