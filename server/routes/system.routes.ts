import { Router } from 'express'
import { normalizeWhatsAppPhone } from '@shared/adagu/reminders'
import { pledgeWhatsAppOpenSchema } from '@shared/schemas'
import { requireAuth, requireFeature } from '../auth/middleware'
import { getDatabase } from '../db'
import { asyncHandler, HttpError, parseBody } from '../lib/http'
import { openExternalUrl } from '../lib/openExternal'

const router = Router()

/**
 * Open a WhatsApp reminder in the browser and log that it was sent. The link is
 * rebuilt from the shop template on the reminders endpoint, validated again
 * here, and only then handed to the operating system.
 */
router.post(
  '/open-whatsapp',
  requireAuth,
  // Reminders are part of the Adagu screens; logging one writes to a loan.
  requireFeature('adagu'),
  asyncHandler((req, res) => {
    const input = parseBody(pledgeWhatsAppOpenSchema, req.body ?? {})
    const db = getDatabase()
    const pledge = db
      .prepare(
        `SELECT p.id, c.phone FROM pledges p JOIN customers c ON c.id = p.customer_id WHERE p.id = ?`,
      )
      .get(input.pledgeId) as { id: number; phone: string | null } | undefined
    if (!pledge) {
      res.status(404).json({ error: 'Pledge not found' })
      return
    }
    // The link must go to this loan's customer, not any number a request names.
    const expected = normalizeWhatsAppPhone(pledge.phone ?? '')
    const target = /^https:\/\/wa\.me\/(\d+)\?/.exec(input.url)?.[1]
    if (!expected || target !== expected) {
      throw new HttpError(400, "This WhatsApp link is not for the loan's customer")
    }

    openExternalUrl(input.url)
    db.prepare(
      `INSERT INTO pledge_reminders (pledge_id, kind, channel, sent_at)
       VALUES (?, ?, 'whatsapp', datetime('now'))`,
    ).run(input.pledgeId, input.kind || 'interest')

    res.json({ ok: true })
  }),
)

export default router
