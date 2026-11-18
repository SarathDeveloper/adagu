import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Customer } from '@shared/types'
import { BACKUP_LOCKED_MESSAGE } from '@shared/backupRetention'
import { removeBackupKeyForTests } from '../../server/db/backupKey'
import { isEncryptedFile } from '../../server/lib/backupCrypto'
import { getUploadsDir } from '../../server/lib/paths'
import { localDateIso } from '../../shared/localDate'
import {
  getTestAgent,
  IPC_CHANNELS,
  ipc,
  loginAsAdmin,
  uniqueCustomerPhone,
  useIntegrationEnv,
} from './helpers/testEnv'

const PASSWORD = 'counter-safe-42'

async function seedCustomer(name: string): Promise<Customer> {
  const response = await getTestAgent()
    .post('/api/customers')
    .send({ name, phone: uniqueCustomerPhone(), address: 'Salem' })
  if (response.status !== 201) throw new Error(`Customer seed failed: ${response.text}`)
  return response.body as Customer
}

async function enable(): Promise<string> {
  const response = await getTestAgent().post('/api/backup/encryption').send({ password: PASSWORD })
  expect(response.status).toBe(200)
  return response.body.recoveryKey as string
}

function binary(request: ReturnType<ReturnType<typeof getTestAgent>['get']>) {
  return request.buffer(true).parse((res, callback) => {
    const chunks: Buffer[] = []
    res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
    res.on('end', () => callback(null, Buffer.concat(chunks)))
  })
}

async function exportFile(path: '/api/backup/export' | '/api/backup/export-full'): Promise<{ file: string; name: string }> {
  const response = await binary(getTestAgent().get(path))
  expect(response.status).toBe(200)
  const name = /filename="?([^";]+)"?/.exec(String(response.headers['content-disposition']))?.[1] ?? 'export'
  const file = join(tmpdir(), `pd-enc-${Date.now()}-${name}`)
  writeFileSync(file, response.body as Buffer)
  return { file, name }
}

async function customerNames(): Promise<string[]> {
  return (await ipc<Customer[]>(IPC_CHANNELS.CUSTOMERS_LIST)).map((customer) => customer.name)
}

describe('backup encryption', () => {
  useIntegrationEnv()

  it('starts off, turns on once, and reports it in the backup status', async () => {
    const agent = getTestAgent()
    expect((await agent.get('/api/backup/encryption')).body.enabled).toBe(false)
    expect((await agent.get('/api/backup/status')).body.encrypted).toBe(false)

    const short = await agent.post('/api/backup/encryption').send({ password: 'short' })
    expect(short.status).toBe(400)

    const recoveryKey = await enable()
    expect(recoveryKey).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/)
    expect((await agent.get('/api/backup/encryption')).body.enabled).toBe(true)
    expect((await agent.get('/api/backup/status')).body.encrypted).toBe(true)

    const again = await agent.post('/api/backup/encryption').send({ password: PASSWORD })
    expect(again.status).toBe(409)
  })

  it('encrypts the off-machine database, workbook and photos and removes plain copies', async () => {
    await seedCustomer('Lakshmi Aadhaar')
    const agent = getTestAgent()
    const offsiteDir = mkdtempSync(join(tmpdir(), 'pd-enc-offsite-'))
    const today = localDateIso()
    const photo = 'kyc-front.jpg'
    writeFileSync(join(getUploadsDir(), photo), 'aadhaar-scan-bytes')
    try {
      await agent.put('/api/backup/settings').send({ frequency: 'daily', time: '21:00', offsiteDir })
      // A plain copy first, as an existing shop would have before turning encryption on.
      expect((await agent.post('/api/backup/offsite-copy')).status).toBe(200)
      expect(existsSync(join(offsiteDir, `pawndesk-${today}.db`))).toBe(true)
      expect(existsSync(join(offsiteDir, 'uploads', photo))).toBe(true)

      await enable()
      const copied = await agent.post('/api/backup/offsite-copy')
      expect(copied.status).toBe(200)
      expect(copied.body.lastOffsiteError).toBeNull()

      const db = join(offsiteDir, `pawndesk-${today}.db.pdenc`)
      const xlsx = join(offsiteDir, `pawndesk-${today}.xlsx.pdenc`)
      const sealedPhoto = join(offsiteDir, 'uploads', `${photo}.pdenc`)
      for (const file of [db, xlsx, sealedPhoto]) {
        expect(isEncryptedFile(file)).toBe(true)
      }
      expect(readFileSync(db).includes(Buffer.from('Lakshmi'))).toBe(false)
      expect(readFileSync(sealedPhoto).includes(Buffer.from('aadhaar-scan'))).toBe(false)
      // Today's plain copies are superseded and removed.
      expect(existsSync(join(offsiteDir, `pawndesk-${today}.db`))).toBe(false)
      expect(existsSync(join(offsiteDir, `pawndesk-${today}.xlsx`))).toBe(false)
      expect(existsSync(join(offsiteDir, 'uploads', photo))).toBe(false)
      expect(readdirSync(offsiteDir).filter((name) => name.startsWith('~$'))).toEqual([])

      // Restoring on this computer opens the copy with its own key and brings the photo back.
      rmSync(join(getUploadsDir(), photo))
      await seedCustomer('Added later')
      const restored = await agent.post('/api/backup/restore').attach('file', db)
      expect(restored.status).toBe(200)
      await loginAsAdmin()
      expect(await customerNames()).toEqual(['Lakshmi Aadhaar'])
      expect(readFileSync(join(getUploadsDir(), photo), 'utf8')).toBe('aadhaar-scan-bytes')
    } finally {
      rmSync(offsiteDir, { recursive: true, force: true })
    }
  })

  it('asks a new computer for the password, refuses a wrong one, and accepts the recovery key', async () => {
    await seedCustomer('Murugan')
    const recoveryKey = await enable()
    const { file, name } = await exportFile('/api/backup/export')
    try {
      expect(name).toMatch(/\.db\.pdenc$/)
      expect(isEncryptedFile(file)).toBe(true)

      // Same computer: its own key opens the file without asking.
      await seedCustomer('Someone else')
      // A different computer has no key.
      removeBackupKeyForTests()
      const agent = getTestAgent()
      const locked = await agent.post('/api/backup/restore').attach('file', file)
      expect(locked.status).toBe(400)
      expect(locked.body.error).toBe(BACKUP_LOCKED_MESSAGE)

      const wrong = await agent.post('/api/backup/restore').field('password', 'not-the-password').attach('file', file)
      expect(wrong.status).toBe(400)
      expect(wrong.body.error).toMatch(/not correct/)
      expect(await customerNames()).toHaveLength(2)

      const restored = await agent
        .post('/api/backup/restore')
        .field('recoveryKey', recoveryKey.toLowerCase())
        .attach('file', file)
      expect(restored.status).toBe(200)
      await loginAsAdmin()
      expect(await customerNames()).toEqual(['Murugan'])
      // The new computer keeps that key, so later backups stay encrypted.
      expect((await getTestAgent().get('/api/backup/encryption')).body.enabled).toBe(true)
    } finally {
      rmSync(file, { force: true })
    }
  })

  it('encrypts the full backup and restores it with the password', async () => {
    await seedCustomer('Full backup customer')
    writeFileSync(join(getUploadsDir(), 'pledge.png'), 'pledge-photo')
    await enable()
    const { file, name } = await exportFile('/api/backup/export-full')
    try {
      expect(name).toMatch(/\.zip\.pdenc$/)
      expect(readFileSync(file).subarray(0, 2).toString()).not.toBe('PK')

      removeBackupKeyForTests()
      rmSync(join(getUploadsDir(), 'pledge.png'))
      await seedCustomer('Later')
      const restored = await getTestAgent()
        .post('/api/backup/restore')
        .field('password', PASSWORD)
        .attach('file', file)
      expect(restored.status).toBe(200)
      await loginAsAdmin()
      expect(await customerNames()).toEqual(['Full backup customer'])
      expect(readFileSync(join(getUploadsDir(), 'pledge.png'), 'utf8')).toBe('pledge-photo')
    } finally {
      rmSync(file, { force: true })
    }
  })

  it('writes a full backup to a chosen path as .pdenc when encryption is on', async () => {
    await enable()
    const dir = mkdtempSync(join(tmpdir(), 'pd-enc-dest-'))
    try {
      const response = await getTestAgent()
        .post('/api/backup/export-full')
        .send({ path: join(dir, 'shop.zip') })
      expect(response.status).toBe(200)
      expect(response.body.path).toBe(join(dir, 'shop.zip.pdenc'))
      expect(isEncryptedFile(join(dir, 'shop.zip.pdenc'))).toBe(true)
      expect(existsSync(join(dir, 'shop.zip'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('changes the password only with the current password or recovery key', async () => {
    await seedCustomer('Password change')
    const recoveryKey = await enable()
    const agent = getTestAgent()

    const wrong = await agent
      .put('/api/backup/encryption/password')
      .send({ currentPassword: 'nope-nope', newPassword: 'brand-new-pass' })
    expect(wrong.status).toBe(400)
    const missing = await agent.put('/api/backup/encryption/password').send({ newPassword: 'brand-new-pass' })
    expect(missing.status).toBe(400)

    const changed = await agent
      .put('/api/backup/encryption/password')
      .send({ recoveryKey, newPassword: 'brand-new-pass' })
    expect(changed.status).toBe(200)

    const { file } = await exportFile('/api/backup/export')
    try {
      removeBackupKeyForTests()
      const old = await getTestAgent().post('/api/backup/restore').field('password', PASSWORD).attach('file', file)
      expect(old.status).toBe(400)
      const ok = await getTestAgent()
        .post('/api/backup/restore')
        .field('password', 'brand-new-pass')
        .attach('file', file)
      expect(ok.status).toBe(200)
    } finally {
      rmSync(file, { force: true })
    }
  })

  it('keeps encryption settings admin-only', async () => {
    const agent = getTestAgent()
    const created = await agent.post('/api/users').send({
      username: 'counterstaff',
      password: 'staff-pass-1',
      role: 'staff',
      features: ['settings'],
    })
    expect(created.status).toBe(201)
    await agent.post('/api/auth/logout')
    const { skipPasswordChange } = await import('./helpers/testEnv')
    skipPasswordChange('counterstaff')
    const login = await agent.post('/api/auth/login').send({ username: 'counterstaff', password: 'staff-pass-1' })
    expect(login.status).toBe(200)
    expect((await agent.get('/api/backup/encryption')).status).toBe(200)
    expect((await agent.post('/api/backup/encryption').send({ password: PASSWORD })).status).toBe(403)
  })
})
