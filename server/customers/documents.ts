import { closeSync, existsSync, openSync, readSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import type { CustomerDocument, CustomerDocumentKind, CustomerNote } from '@shared/types'
import { HttpError } from '../lib/http'
import { getUploadsDir } from '../lib/paths'

/** Most files a customer may keep per kind: one photo, front and back of each card. */
export const CUSTOMER_DOCUMENT_LIMITS: Record<CustomerDocumentKind, number> = {
  photo: 1,
  aadhaar: 2,
  pan: 2,
}

type CustomerDocumentRow = {
  id: number
  customer_id: number
  kind: CustomerDocumentKind
  path: string
  mime_type: string
  original_name: string
  created_at: string
}

type CustomerNoteRow = {
  id: number
  customer_id: number
  body: string
  created_by: string
  created_at: string
}

function mapDocument(row: CustomerDocumentRow): CustomerDocument {
  return {
    id: row.id,
    customerId: row.customer_id,
    kind: row.kind,
    path: row.path,
    mimeType: row.mime_type,
    originalName: row.original_name,
    createdAt: row.created_at,
  }
}

function mapNote(row: CustomerNoteRow): CustomerNote {
  return {
    id: row.id,
    customerId: row.customer_id,
    body: row.body,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

const DOCUMENT_COLUMNS = 'id, customer_id, kind, path, mime_type, original_name, created_at'

export function loadCustomerDocuments(db: Database.Database, customerId: number): CustomerDocument[] {
  const rows = db
    .prepare(`SELECT ${DOCUMENT_COLUMNS} FROM customer_documents WHERE customer_id = ? ORDER BY id ASC`)
    .all(customerId) as CustomerDocumentRow[]
  return rows.map(mapDocument)
}

/**
 * What the file's first bytes say it is. The browser-supplied MIME type is only
 * a hint, so the stored type always comes from the content.
 */
export function sniffUploadType(filePath: string): 'image/png' | 'image/jpeg' | 'application/pdf' | null {
  const header = Buffer.alloc(8)
  let fd: number | null = null
  try {
    fd = openSync(filePath, 'r')
    const read = readSync(fd, header, 0, header.length, 0)
    if (read >= 8 && header.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return 'image/png'
    }
    if (read >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
      return 'image/jpeg'
    }
    if (read >= 5 && header.subarray(0, 5).toString('latin1') === '%PDF-') {
      return 'application/pdf'
    }
    return null
  } catch {
    return null
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

export function removeUploadFile(path: string): void {
  const fileName = path.startsWith('/uploads/') ? path.slice('/uploads/'.length) : ''
  if (!fileName || fileName.includes('/') || fileName.includes('\\')) return
  const fullPath = join(getUploadsDir(), fileName)
  if (!existsSync(fullPath)) return
  try {
    unlinkSync(fullPath)
  } catch {
    // The row is already gone; a stray file is harmless.
  }
}

/**
 * Store an uploaded file against the customer. A new photo replaces the old one;
 * Aadhaar and PAN keep up to two files (front and back) and refuse a third.
 * Returns the paths of files that were replaced so the caller can remove them
 * once the transaction has committed.
 */
export function addCustomerDocument(
  db: Database.Database,
  customerId: number,
  kind: CustomerDocumentKind,
  file: { path: string; mimeType: string; originalName: string },
): { document: CustomerDocument; replaced: string[] } {
  const existing = db
    .prepare(`SELECT ${DOCUMENT_COLUMNS} FROM customer_documents WHERE customer_id = ? AND kind = ? ORDER BY id ASC`)
    .all(customerId, kind) as CustomerDocumentRow[]

  const replaced: string[] = []
  if (kind === 'photo') {
    for (const row of existing) {
      db.prepare('DELETE FROM customer_documents WHERE id = ?').run(row.id)
      replaced.push(row.path)
    }
  } else if (existing.length >= CUSTOMER_DOCUMENT_LIMITS[kind]) {
    throw new HttpError(400, 'Remove a file before adding another (front and back only)')
  }

  const info = db
    .prepare(
      `INSERT INTO customer_documents (customer_id, kind, path, mime_type, original_name)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(customerId, kind, file.path, file.mimeType, file.originalName.slice(0, 200))
  const row = db
    .prepare(`SELECT ${DOCUMENT_COLUMNS} FROM customer_documents WHERE id = ?`)
    .get(Number(info.lastInsertRowid)) as CustomerDocumentRow
  return { document: mapDocument(row), replaced }
}

export function deleteCustomerDocument(
  db: Database.Database,
  customerId: number,
  documentId: number,
): CustomerDocument {
  const row = db
    .prepare(`SELECT ${DOCUMENT_COLUMNS} FROM customer_documents WHERE id = ? AND customer_id = ?`)
    .get(documentId, customerId) as CustomerDocumentRow | undefined
  if (!row) {
    throw new HttpError(404, 'Document not found')
  }
  db.prepare('DELETE FROM customer_documents WHERE id = ?').run(documentId)
  return mapDocument(row)
}

export function loadCustomerNotes(db: Database.Database, customerId: number): CustomerNote[] {
  const rows = db
    .prepare(
      `SELECT id, customer_id, body, created_by, created_at
       FROM customer_notes WHERE customer_id = ? ORDER BY created_at DESC, id DESC`,
    )
    .all(customerId) as CustomerNoteRow[]
  return rows.map(mapNote)
}

export function addCustomerNote(
  db: Database.Database,
  customerId: number,
  body: string,
  createdBy: string,
): CustomerNote {
  const info = db
    .prepare('INSERT INTO customer_notes (customer_id, body, created_by) VALUES (?, ?, ?)')
    .run(customerId, body, createdBy)
  const row = db
    .prepare('SELECT id, customer_id, body, created_by, created_at FROM customer_notes WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as CustomerNoteRow
  return mapNote(row)
}

export function deleteCustomerNote(db: Database.Database, customerId: number, noteId: number): CustomerNote {
  const row = db
    .prepare('SELECT id, customer_id, body, created_by, created_at FROM customer_notes WHERE id = ? AND customer_id = ?')
    .get(noteId, customerId) as CustomerNoteRow | undefined
  if (!row) {
    throw new HttpError(404, 'Note not found')
  }
  db.prepare('DELETE FROM customer_notes WHERE id = ?').run(noteId)
  return mapNote(row)
}
