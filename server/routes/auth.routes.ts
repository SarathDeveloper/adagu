import { Router } from 'express'
import { changePasswordSchema, loginSchema } from '@shared/schemas'
import { getDatabase } from '../db'
import { asyncHandler, HttpError, parseBody } from '../lib/http'
import { burnPasswordCheck, hashPasswordToHex, verifyPasswordAsync } from '../auth/password'
import {
  loginRetryAfterSeconds,
  recordLoginFailure,
  recordLoginSuccess,
} from '../auth/loginThrottle'
import {
  clearSessionCookieValue,
  createSession,
  destroySession,
  destroySessionsForUser,
  parseCookies,
  SESSION_COOKIE,
  sessionCookieValue,
} from '../auth/session'
import { findUserById, findUserByUsername, mapUser } from '../auth/users'
import { requireAuth } from '../auth/middleware'

const router = Router()

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = parseBody(loginSchema, req.body)
    const address = req.socket.remoteAddress
    const waitSeconds = loginRetryAfterSeconds(input.username, address)
    if (waitSeconds > 0) {
      res.setHeader('Retry-After', String(waitSeconds))
      throw new HttpError(
        429,
        `Too many failed sign-in attempts. Try again in ${waitSeconds} seconds.`,
      )
    }
    const db = getDatabase()
    const row = findUserByUsername(db, input.username)
    const valid =
      row && row.active === 1
        ? await verifyPasswordAsync(input.password, row.password_hash, row.password_salt)
        : (await burnPasswordCheck(input.password), false)
    if (!row || !valid) {
      recordLoginFailure(input.username, address)
      throw new HttpError(401, 'Invalid username or password')
    }
    recordLoginSuccess(input.username)
    const session = createSession({ id: row.id, username: row.username, role: row.role })
    res.setHeader('Set-Cookie', sessionCookieValue(session.id))
    res.json(mapUser(db, row))
  }),
)

router.post(
  '/logout',
  asyncHandler((req, res) => {
    const cookies = parseCookies(req.headers.cookie)
    destroySession(cookies[SESSION_COOKIE])
    res.setHeader('Set-Cookie', clearSessionCookieValue())
    res.status(204).end()
  }),
)

router.get(
  '/me',
  requireAuth,
  asyncHandler((req, res) => {
    res.json(req.user)
  }),
)

router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = parseBody(changePasswordSchema, req.body)
    const db = getDatabase()
    const row = findUserById(db, req.user!.id)
    if (!row) {
      throw new HttpError(401, 'Authentication required')
    }
    if (!(await verifyPasswordAsync(input.currentPassword, row.password_hash, row.password_salt))) {
      throw new HttpError(400, 'Current password is incorrect')
    }
    // The forced change exists to replace a password someone else knows (the
    // default admin123, or one an admin typed in), so it has to be different.
    if (input.newPassword === input.currentPassword) {
      throw new HttpError(400, 'Choose a new password that is different from the current one')
    }
    const { hashHex, saltHex } = hashPasswordToHex(input.newPassword)
    db.prepare(
      `UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0 WHERE id = ?`,
    ).run(hashHex, saltHex, row.id)
    // Anyone else signed in with the old password is signed out; this browser
    // gets a fresh session so the person changing it stays signed in.
    destroySessionsForUser(row.id)
    const session = createSession({ id: row.id, username: row.username, role: row.role })
    res.setHeader('Set-Cookie', sessionCookieValue(session.id))
    const updated = findUserById(db, row.id)!
    res.json(mapUser(db, updated))
  }),
)

export default router
