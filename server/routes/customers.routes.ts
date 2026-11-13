import { randomUUID } from 'node:crypto'
import { renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { customerDocumentKindSchema, customerInputSchema, customerNoteInputSchema } from '@shared/schemas'
import type { Customer, CustomerDocumentKind, CustomerInput } from '@shared/types'
import {
  addCustomerDocument,
  addCustomerNote,
  deleteCustomerDocument,
  deleteCustomerNote,
  loadCustomerDocuments,
  loadCustomerNotes,
  removeUploadFile,
  sniffUploadType,
} from '../customers/documents'
import { getDatabase } from '../db'
import { asyncHandler, HttpError, parseBody, parseIdParam } from '../lib/http'
import { getUploadsDir } from '../lib/paths'

const router = Router()

/** Scans are photographed on a phone or saved as PDF; images are shrunk in the browser first. */
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024

const EXTENSION_BY_TYPE = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'application/pdf': '.pdf',
} as const

const documentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, getUploadsDir()),
    // Renamed to the extension of the content once it has been checked.
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.upload`),
  }),
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/^(image\/(png|jpe?g)|application\/pdf)$/i.test(file.mimetype)) {
      cb(new HttpError(400, 'File must be PNG, JPEG or PDF'))
      return
    }
    cb(null, true)
  },
})

function discardUpload(fullPath: string): void {
  try {
    unlinkSync(fullPath)
  } catch {
    // Nothing else to do; an orphaned temp file is harmless.
  }
}

function assertCustomerExists(id: number): void {
  const row = getDatabase().prepare('SELECT id FROM customers WHERE id = ?').get(id)
  if (!row) {
    throw new HttpError(404, 'Customer not found')
  }
}

type CustomerRow = {
  id: number
  name: string
  phone: string
  address: string
  guardian_name: string
  notes: string
  gstin: string
  aadhaar: string
  pan: string
  id_proof_type: string
  created_at: string
}

function mapCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    guardianName: row.guardian_name ?? '',
    notes: row.notes,
    gstin: row.gstin ?? '',
    aadhaar: row.aadhaar ?? '',
    pan: row.pan ?? '',
    idProofType: row.id_proof_type ?? '',
    createdAt: row.created_at,
  }
}

router.get(
  '/',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const term = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const rows = term
      ? (db
          .prepare(
            `SELECT * FROM customers
             WHERE name LIKE ? OR phone LIKE ?
             ORDER BY created_at DESC`,
          )
          .all(`%${term}%`, `%${term}%`) as CustomerRow[])
      : (db.prepare('SELECT * FROM customers ORDER BY created_at DESC').all() as CustomerRow[])
    res.json(rows.map(mapCustomer))
  }),
)

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const row = getDatabase().prepare('SELECT * FROM customers WHERE id = ?').get(id) as
      | CustomerRow
      | undefined
    if (!row) {
      throw new Error('Customer not found')
    }
    res.json(mapCustomer(row))
  }),
)

router.post(
  '/',
  asyncHandler((req, res) => {
    const input = parseBody(customerInputSchema, req.body) as CustomerInput
    const db = getDatabase()
    const result = db
      .prepare(
        `INSERT INTO customers (name, phone, address, guardian_name, notes, gstin, aadhaar, pan, id_proof_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(
        input.name,
        input.phone,
        input.address,
        input.guardianName ?? '',
        input.notes ?? '',
        input.gstin ?? '',
        input.aadhaar ?? '',
        input.pan ?? '',
        input.idProofType ?? '',
      )
    const customerId = Number(result.lastInsertRowid)
    const firstNote = (input.notes ?? '').trim()
    if (firstNote) {
      addCustomerNote(db, customerId, firstNote, req.user?.username ?? '')
    }
    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as CustomerRow
    res.status(201).json(mapCustomer(row))
  }),
)

router.put(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(customerInputSchema, req.body) as CustomerInput
    const db = getDatabase()
    const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(id) as
      | { id: number }
      | undefined
    if (!existing) {
      throw new Error('Customer not found')
    }
    db.prepare(
      `UPDATE customers SET name = ?, phone = ?, address = ?, guardian_name = ?, notes = ?, gstin = ?, aadhaar = ?, pan = ?, id_proof_type = ? WHERE id = ?`,
    ).run(
      input.name,
      input.phone,
      input.address,
      input.guardianName ?? '',
      input.notes ?? '',
      input.gstin ?? '',
      input.aadhaar ?? '',
      input.pan ?? '',
      input.idProofType ?? '',
      id,
    )
    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as CustomerRow
    res.json(mapCustomer(row))
  }),
)

router.delete(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(id) as
      | { id: number }
      | undefined
    if (!existing) {
      throw new Error('Customer not found')
    }
    const dueEntry = db.prepare('SELECT id FROM customer_dues WHERE customer_id = ? LIMIT 1').get(id)
    if (dueEntry) {
      throw new Error('Cannot delete customer with existing dues entries')
    }
    const pledge = db.prepare('SELECT id FROM pledges WHERE customer_id = ? LIMIT 1').get(id)
    if (pledge) {
      throw new Error('Cannot delete customer with existing pledges')
    }
    const schemeAccount = db
      .prepare('SELECT id FROM gold_saving_accounts WHERE customer_id = ? LIMIT 1')
      .get(id)
    if (schemeAccount) {
      throw new Error('Cannot delete customer with existing gold savings accounts')
    }
    const documents = loadCustomerDocuments(db, id)
    const result = db.prepare('DELETE FROM customers WHERE id = ?').run(id)
    if (result.changes === 0) {
      throw new Error('Customer not found')
    }
    for (const document of documents) removeUploadFile(document.path)
    res.status(204).end()
  }),
)

router.get(
  '/:id/documents',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    assertCustomerExists(id)
    res.json(loadCustomerDocuments(getDatabase(), id))
  }),
)

router.post(
  '/:id/documents',
  documentUpload.single('file'),
  asyncHandler((req, res) => {
    const file = req.file
    try {
      const id = parseIdParam(req.params.id)
      assertCustomerExists(id)
      if (!file) {
        throw new HttpError(400, 'File is required')
      }
      const kind = customerDocumentKindSchema.parse(
        typeof req.body?.kind === 'string' ? req.body.kind.trim() : '',
      ) as CustomerDocumentKind
      const sniffed = sniffUploadType(file.path)
      if (!sniffed) {
        throw new HttpError(400, 'File must be PNG, JPEG or PDF')
      }
      if (kind === 'photo' && sniffed === 'application/pdf') {
        throw new HttpError(400, 'Photo must be PNG or JPEG')
      }
      const fileName = file.filename.replace(/\.upload$/, EXTENSION_BY_TYPE[sniffed])
      renameSync(file.path, join(getUploadsDir(), fileName))
      const db = getDatabase()
      try {
        const { document, replaced } = db.transaction(() =>
          addCustomerDocument(db, id, kind, {
            path: `/uploads/${fileName}`,
            mimeType: sniffed,
            originalName: file.originalname,
          }),
        )()
        for (const path of replaced) removeUploadFile(path)
        res.status(201).json(document)
      } catch (error) {
        removeUploadFile(`/uploads/${fileName}`)
        throw error
      }
    } catch (error) {
      if (file) discardUpload(file.path)
      throw error
    }
  }),
)

router.delete(
  '/:id/documents/:documentId',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const removed = deleteCustomerDocument(getDatabase(), id, parseIdParam(req.params.documentId))
    removeUploadFile(removed.path)
    res.json(removed)
  }),
)

router.get(
  '/:id/notes',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    assertCustomerExists(id)
    res.json(loadCustomerNotes(getDatabase(), id))
  }),
)

router.post(
  '/:id/notes',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    assertCustomerExists(id)
    const { body } = parseBody(customerNoteInputSchema, req.body)
    res.status(201).json(addCustomerNote(getDatabase(), id, body, req.user?.username ?? ''))
  }),
)

router.delete(
  '/:id/notes/:noteId',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    res.json(deleteCustomerNote(getDatabase(), id, parseIdParam(req.params.noteId)))
  }),
)

export default router
