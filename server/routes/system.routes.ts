import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import {
  buildWhatsAppTextUrl,
  messageDate,
  normalizeWhatsAppPhone,
  renderAdaguReceiptMessage,
  whatsAppUrlPhone,
  whatsAppUrlText,
} from '@shared/adagu/reminders'
import { pledgeReminderSkipSchema, pledgeWhatsAppOpenSchema } from '@shared/schemas'
import type { WhatsAppReceiptResult } from '@shared/types'
import { requireAuth, requireFeature } from '../auth/middleware'
import { getDatabase } from '../db'
import { asyncHandler, HttpError, parseBody, parseIdParam } from '../lib/http'
import { autoPasteIntoWhatsApp, copyFileToClipboard, openExternalUrl } from '../lib/openExternal'
import { getDataDir } from '../lib/paths'
import { buildPledgePaymentReceipt } from '../pledges/paymentReceipt'
import { loadShopSettings } from '../lib/settingsStore'

const router = Router()

const MAX_RECEIPT_PDF_BYTES = 8 * 1024 * 1024

/** The browser renders the receipt PDF; it is held in memory and checked before saving. */
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RECEIPT_PDF_BYTES, files: 1 },
})

function insertReminderLog(input: {
  pledgeId: number
  kind: string
  status: 'sent' | 'skipped'
  message: string
  sentBy: string
  paymentId?: number | null
}): void {
  getDatabase()
    .prepare(
      `INSERT INTO pledge_reminders (pledge_id, kind, channel, status, message, sent_by, payment_id, sent_at)
       VALUES (?, ?, 'whatsapp', ?, ?, ?, ?, ?)`,
    )
    .run(
      input.pledgeId,
      input.kind,
      input.status,
      input.message,
      input.sentBy,
      input.paymentId ?? null,
      // UTC like datetime('now'), but from the app clock so "sent today"
      // agrees with the app's own today.
      new Date().toISOString().slice(0, 19).replace('T', ' '),
    )
}

function loanPhone(pledgeId: number): string | null {
  const row = getDatabase()
    .prepare(`SELECT c.phone FROM pledges p JOIN customers c ON c.id = p.customer_id WHERE p.id = ?`)
    .get(pledgeId) as { phone: string | null } | undefined
  if (!row) throw new HttpError(404, 'Pledge not found')
  return normalizeWhatsAppPhone(row.phone ?? '')
}

/** Folder for receipt PDFs sent on WhatsApp, kept so a send can be repeated. */
function receiptsDir(): string {
  const dir = join(getDataDir(), 'receipts')
  mkdirSync(dir, { recursive: true })
  return dir
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'receipt'
}

/**
 * Open a WhatsApp reminder in WhatsApp Desktop and log that it was sent. The
 * link is rebuilt from the shop template on the reminders endpoint, validated
 * again here, and only then handed to the operating system.
 */
router.post(
  '/open-whatsapp',
  requireAuth,
  // Reminders are part of the Adagu screens; logging one writes to a loan.
  requireFeature('adagu'),
  asyncHandler((req, res) => {
    const input = parseBody(pledgeWhatsAppOpenSchema, req.body ?? {})
    const db = getDatabase()
    const pledge = db.prepare('SELECT id FROM pledges WHERE id = ?').get(input.pledgeId)
    if (!pledge) {
      res.status(404).json({ error: 'Pledge not found' })
      return
    }
    // The link must go to this loan's customer, not any number a request names.
    const expected = loanPhone(input.pledgeId)
    if (!expected || whatsAppUrlPhone(input.url) !== expected) {
      throw new HttpError(400, "This WhatsApp link is not for the loan's customer")
    }

    openExternalUrl(input.url)
    insertReminderLog({
      pledgeId: input.pledgeId,
      kind: input.kind || 'interest',
      status: 'sent',
      message: whatsAppUrlText(input.url),
      sentBy: req.user?.username ?? '',
    })

    res.json({ ok: true })
  }),
)

/** Record that a loan was skipped in today's reminder queue. */
router.post(
  '/reminders/skip',
  requireAuth,
  requireFeature('adagu'),
  asyncHandler((req, res) => {
    const input = parseBody(pledgeReminderSkipSchema, req.body ?? {})
    const pledge = getDatabase().prepare('SELECT id FROM pledges WHERE id = ?').get(input.pledgeId)
    if (!pledge) throw new HttpError(404, 'Pledge not found')
    insertReminderLog({
      pledgeId: input.pledgeId,
      kind: input.kind || 'interest',
      status: 'skipped',
      message: '',
      sentBy: req.user?.username ?? '',
    })
    res.json({ ok: true })
  }),
)

/**
 * Send a payment receipt on WhatsApp: save the PDF the app rendered, put it on
 * the clipboard as a file, open the customer's chat with a short message, then
 * paste the PDF into it (Windows). Staff check the attachment and press Enter.
 */
router.post(
  '/whatsapp-receipt/:paymentId',
  requireAuth,
  requireFeature('adagu'),
  receiptUpload.single('file'),
  asyncHandler((req, res) => {
    const paymentId = parseIdParam(req.params.paymentId)
    const db = getDatabase()
    const receipt = buildPledgePaymentReceipt(db, paymentId)

    const file = req.file
    if (!file || file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new HttpError(400, 'Receipt PDF is required')
    }

    const settings = loadShopSettings(db)
    const message = renderAdaguReceiptMessage(settings.adaguReceiptTemplate, {
      name: receipt.customerName,
      receiptNo: receipt.receiptNo,
      amount: receipt.payment.amount,
      date: messageDate(receipt.payment.paymentDate),
      paidUpto: messageDate(receipt.interestPaidUpto),
      principal: receipt.principalAfter,
      shopName: settings.shopName,
      reference: receipt.payment.reference,
    })
    const url = buildWhatsAppTextUrl(receipt.customerPhone, message)
    if (!url) {
      throw new HttpError(400, 'Add a valid mobile number to this customer to send on WhatsApp')
    }

    const filePath = join(
      receiptsDir(),
      `${safeFilePart(receipt.receiptNo)}-payment-${receipt.payment.id}.pdf`,
    )
    writeFileSync(filePath, file.buffer)

    // Clipboard first, so the file is ready by the time the chat opens.
    const copied = copyFileToClipboard(filePath)
    openExternalUrl(url)
    // With the PDF on the clipboard, paste it into the chat once it is open.
    const autoPasted = copied && autoPasteIntoWhatsApp()
    insertReminderLog({
      pledgeId: receipt.pledgeId,
      kind: 'receipt',
      status: 'sent',
      message,
      sentBy: req.user?.username ?? '',
      paymentId: receipt.payment.id,
    })

    const result: WhatsAppReceiptResult = { ok: true, copied, autoPasted, filePath }
    res.json(result)
  }),
)

export default router
