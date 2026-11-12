import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { hashPasswordToHex } from '../../server/auth/password'
import { getDatabase, getUserDataDir, recoverInterruptedReplace } from '../../server/db'
import { allowFullBackupEntry, backupDatabaseTo } from '../../server/db/backup'
import {
  getTestAgent,
  ipc,
  IPC_CHANNELS,
  loginAsAdmin,
  newTestAgent,
  skipPasswordChange,
  useIntegrationEnv,
} from './helpers/testEnv'

/**
 * Regression tests for the security review: each reproduces the original
 * weakness through the API (or the function behind it) and checks the fix.
 */

async function createUser(username: string, features: string[], role: 'staff' | 'admin' = 'staff') {
  const created = await getTestAgent()
    .post('/api/users')
    .send({ username, password: 'temp-pass', role, features })
  expect(created.status).toBe(201)
  return created.body as { id: number }
}

async function signIn(username: string, password = 'temp-pass', client = getTestAgent()) {
  const res = await client.post('/api/auth/login').send({ username, password })
  expect(res.status).toBe(200)
  return res
}

describe('security fixes', () => {
  useIntegrationEnv()

  describe('passwords and sessions', () => {
    it('enforces the forced password change on the server, not only in the UI', async () => {
      await createUser('new-cashier', ['customers'])
      await getTestAgent().post('/api/auth/logout')
      await signIn('new-cashier')

      const blocked = await getTestAgent().get('/api/customers')
      expect(blocked.status).toBe(403)
      expect(blocked.body.error).toMatch(/change your password/i)
      // What the change-password screen needs still works.
      expect((await getTestAgent().get('/api/auth/me')).status).toBe(200)
      expect((await getTestAgent().get('/api/settings')).status).toBe(200)

      const same = await getTestAgent()
        .post('/api/auth/change-password')
        .send({ currentPassword: 'temp-pass', newPassword: 'temp-pass' })
      expect(same.status).toBe(400)

      const changed = await getTestAgent()
        .post('/api/auth/change-password')
        .send({ currentPassword: 'temp-pass', newPassword: 'my-own-pass' })
      expect(changed.status).toBe(200)
      expect((await getTestAgent().get('/api/customers')).status).toBe(200)
    })

    it('signs out other sessions when the password changes', async () => {
      await createUser('two-tabs', ['customers'])
      skipPasswordChange('two-tabs')
      await getTestAgent().post('/api/auth/logout')
      const other = newTestAgent()
      await signIn('two-tabs', 'temp-pass', other)
      await signIn('two-tabs')
      expect((await other.get('/api/auth/me')).status).toBe(200)

      const changed = await getTestAgent()
        .post('/api/auth/change-password')
        .send({ currentPassword: 'temp-pass', newPassword: 'rotated-pass' })
      expect(changed.status).toBe(200)

      expect((await other.get('/api/auth/me')).status).toBe(401)
      // The browser that made the change stays signed in.
      expect((await getTestAgent().get('/api/auth/me')).status).toBe(200)
    })

    it('slows down repeated wrong passwords', async () => {
      const client = newTestAgent()
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const wrong = await client.post('/api/auth/login').send({ username: 'admin', password: `nope-${attempt}` })
        expect(wrong.status).toBe(401)
      }
      const locked = await client.post('/api/auth/login').send({ username: 'admin', password: 'admin123' })
      expect(locked.status).toBe(429)
      expect(locked.headers['retry-after']).toBeTruthy()
    })

    it('answers normally when another app left a malformed cookie', async () => {
      const res = await newTestAgent().get('/api/version').set('Cookie', 'other=%E0%A4%A')
      expect(res.status).toBe(200)
    })
  })

  describe('cross-site access', () => {
    it('does not grant CORS to other websites', async () => {
      const preflight = await newTestAgent()
        .options('/api/customers')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'POST')
      expect(preflight.headers['access-control-allow-origin']).toBeUndefined()
      expect(preflight.headers['access-control-allow-credentials']).toBeUndefined()
    })

    it('refuses requests for a foreign host name (DNS rebinding)', async () => {
      const res = await getTestAgent().get('/api/auth/me').set('Host', 'evil.example:3000')
      expect(res.status).toBe(421)
    })

    it('refuses state-changing requests sent from another origin', async () => {
      const foreign = await getTestAgent()
        .post('/api/auth/logout')
        .set('Origin', 'http://127.0.0.1:9999')
      expect(foreign.status).toBe(403)
      expect((await getTestAgent().get('/api/auth/me')).status).toBe(200)

      const same = await getTestAgent()
        .post('/api/auth/logout')
        .set('Host', '127.0.0.1:3000')
        .set('Origin', 'http://127.0.0.1:3000')
      expect(same.status).toBe(204)
    })

    it('keeps file paths out of the public version endpoint', async () => {
      const anonymous = await newTestAgent().get('/api/version')
      expect(anonymous.body.version).toBeTruthy()
      expect(anonymous.body.dbPath).toBeUndefined()
      const signedIn = await getTestAgent().get('/api/version')
      expect(signedIn.body.dbPath).toBeTruthy()
    })

    it('sends a content security policy with the app', async () => {
      const res = await newTestAgent().get('/api/version')
      expect(res.headers['content-security-policy']).toContain("script-src 'self'")
    })

    it('folds newlines in crash messages so log lines cannot be forged', async () => {
      const res = await newTestAgent()
        .post('/api/diagnostics/host')
        .send({ message: 'WebView died\n[2026-01-01] JTP-ERR fake entry', fatal: true })
      expect(res.status).toBe(200)
      const pending = await newTestAgent().get('/api/diagnostics/pending')
      expect(pending.body.message).not.toMatch(/\n/)
      await newTestAgent().post('/api/diagnostics/pending/ack')
    })
  })

  describe('backup and restore', () => {
    it('keeps exports and restore admin-only for staff with Settings access', async () => {
      await createUser('settings-staff', ['settings'])
      skipPasswordChange('settings-staff')
      await getTestAgent().post('/api/auth/logout')
      await signIn('settings-staff')

      expect((await getTestAgent().get('/api/backup/status')).status).toBe(200)
      expect((await getTestAgent().get('/api/backup/export')).status).toBe(403)
      expect((await getTestAgent().get('/api/backup/export-excel')).status).toBe(403)
      expect(
        (await getTestAgent().post('/api/backup/restore-local').send({ name: 'jeweltrackerpro-2026-01-01.db' }))
          .status,
      ).toBe(403)
      expect(
        (await getTestAgent().post('/api/backup/restore').attach('file', Buffer.from('x'), 'evil.db')).status,
      ).toBe(403)
      expect((await getTestAgent().put('/api/backup/settings').send({ frequency: 'daily', time: '09:00' })).status).toBe(
        403,
      )
    })

    it('signs everyone out after a restore', async () => {
      const destination = join(getUserDataDir(), 'restore-sessions.db')
      await backupDatabaseTo(destination)
      await ipc(IPC_CHANNELS.APP_RESTORE_DB, { sourcePath: destination })
      expect((await getTestAgent().get('/api/auth/me')).status).toBe(401)
      await loginAsAdmin()
    })

    it('refuses a backup with no active admin', async () => {
      const destination = join(getUserDataDir(), 'no-admin.db')
      await backupDatabaseTo(destination)
      const copy = new Database(destination)
      copy.prepare(`UPDATE users SET active = 0 WHERE role = 'admin'`).run()
      const { hashHex, saltHex } = hashPasswordToHex('staff123')
      copy
        .prepare(
          `INSERT INTO users (username, password_hash, password_salt, role, must_change_password, active)
           VALUES ('only-staff', ?, ?, 'staff', 0, 1)`,
        )
        .run(hashHex, saltHex)
      copy.close()

      const before = getDatabase().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }
      const result = await getTestAgent()
        .post('/api/backup/restore')
        .attach('file', destination, 'no-admin.db')
      expect(result.status).toBe(400)
      expect(result.body.error).toMatch(/no active admin/i)
      const after = getDatabase().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }
      expect(after.n).toBe(before.n)
    })

    it('only restores PNG and JPEG files into uploads', () => {
      expect(allowFullBackupEntry('uploads/photo.png')).toBe(true)
      expect(allowFullBackupEntry('uploads/photo.JPG')).toBe(true)
      expect(allowFullBackupEntry('uploads/page.html')).toBe(false)
      expect(allowFullBackupEntry('uploads/script.js')).toBe(false)
      expect(allowFullBackupEntry('uploads/photo.png.html')).toBe(false)
    })

    it('recovers the database left aside by an interrupted replace', () => {
      const dir = mkdtempSync(join(tmpdir(), 'jtp-recover-'))
      try {
        const dbPath = join(dir, 'jeweltrackerpro.db')
        writeFileSync(`${dbPath}.replacing`, 'previous data')
        recoverInterruptedReplace(dbPath)
        expect(existsSync(dbPath)).toBe(true)
        expect(existsSync(`${dbPath}.replacing`)).toBe(false)

        rmSync(dbPath)
        writeFileSync(`${dbPath}.restore.tmp`, 'new data')
        expect(() => recoverInterruptedReplace(dbPath)).toThrow(/restore was interrupted/i)
        expect(existsSync(dbPath)).toBe(false)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })

  describe('WhatsApp opener', () => {
    it('needs Adagu access and the loan customer’s own number', async () => {
      const customer = await ipc<{ id: number }>(IPC_CHANNELS.CUSTOMERS_CREATE, {
        name: 'Reminder Owner',
        phone: '9300000001',
        address: 'Salem',
        notes: '',
      })
      const pledge = await getTestAgent().post('/api/pledges').send({
        customerId: customer.id,
        pledgeDate: '2026-08-01',
        assessedValue: 40000,
        loanAmount: 20000,
        interestPct: 2,
        items: [{ description: 'Chain', metal: 'Gold', purity: '22K', grossWeight: 10, netWeight: 10, pieces: 1 }],
      })
      expect(pledge.status).toBe(201)

      process.env.JEWELTRACKERPRO_NO_OPEN = '1'
      try {
        const wrongNumber = await getTestAgent()
          .post('/api/system/open-whatsapp')
          .send({ pledgeId: pledge.body.id, url: 'https://wa.me/919999999999?text=hello' })
        expect(wrongNumber.status).toBe(400)
        const own = await getTestAgent()
          .post('/api/system/open-whatsapp')
          .send({ pledgeId: pledge.body.id, url: 'https://wa.me/919300000001?text=hello' })
        expect(own.status).toBe(200)

        await createUser('no-adagu', ['customers'])
        skipPasswordChange('no-adagu')
        await getTestAgent().post('/api/auth/logout')
        await signIn('no-adagu')
        const denied = await getTestAgent()
          .post('/api/system/open-whatsapp')
          .send({ pledgeId: pledge.body.id, url: 'https://wa.me/919300000001?text=hello' })
        expect(denied.status).toBe(403)
      } finally {
        delete process.env.JEWELTRACKERPRO_NO_OPEN
      }
    })
  })
})
