import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getUploadsDir } from '../../server/lib/paths'
import { IPC_CHANNELS, getTestAgent, ipc, invokeIpcForTests, useIntegrationEnv } from './helpers/testEnv'

// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n', 'latin1')

function uploadedFile(path: string): string {
  return join(getUploadsDir(), path.slice('/uploads/'.length))
}

const sampleCustomer = {
  name: 'Raja',
  phone: '9876543210',
  address: 'Salem',
  guardianName: 'Perumal',
  aadhaar: '123456789012',
  pan: 'ABCDE1234F',
}

describe('customers IPC', () => {
  useIntegrationEnv()

  it('creates, lists, updates, and deletes a customer', async () => {
    const created = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, sampleCustomer)
    expect(created.name).toBe(sampleCustomer.name)
    expect(created.guardianName).toBe(sampleCustomer.guardianName)
    expect(created.aadhaar).toBe(sampleCustomer.aadhaar)
    expect(created.pan).toBe(sampleCustomer.pan)

    const listed = await ipc(IPC_CHANNELS.CUSTOMERS_LIST)
    expect(listed).toHaveLength(1)

    const updated = await ipc(IPC_CHANNELS.CUSTOMERS_UPDATE, {
      id: created.id,
      input: { ...sampleCustomer, name: 'Raja Updated', pan: 'xyzab5678c' },
    })
    expect(updated.name).toBe('Raja Updated')
    expect(updated.pan).toBe('XYZAB5678C')

    await ipc(IPC_CHANNELS.CUSTOMERS_DELETE, created.id)
    const afterDelete = await ipc(IPC_CHANNELS.CUSTOMERS_LIST)
    expect(afterDelete).toHaveLength(0)
  })

  it('rejects invalid mobile numbers', async () => {
    const result = await invokeIpcForTests(IPC_CHANNELS.CUSTOMERS_CREATE, {
      ...sampleCustomer,
      phone: '12345',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/10 digits/i)
  })

  it('stores a photo and KYC scans, replacing the photo and capping scans at two', async () => {
    const created = await ipc<{ id: number }>(IPC_CHANNELS.CUSTOMERS_CREATE, sampleCustomer)
    const base = `/api/customers/${created.id}/documents`

    const photo = await getTestAgent().post(base).field('kind', 'photo').attach('file', PNG, 'me.png')
    expect(photo.status).toBe(201)
    expect(photo.body.path).toMatch(/^\/uploads\/[0-9a-f-]+\.png$/)
    expect(photo.body.mimeType).toBe('image/png')

    const newPhoto = await getTestAgent().post(base).field('kind', 'photo').attach('file', PNG, 'me2.png')
    expect(newPhoto.status).toBe(201)
    expect(existsSync(uploadedFile(photo.body.path))).toBe(false)

    const pdfPhoto = await getTestAgent()
      .post(base)
      .field('kind', 'photo')
      .attach('file', PDF, { filename: 'me.pdf', contentType: 'application/pdf' })
    expect(pdfPhoto.status).toBe(400)

    const front = await getTestAgent()
      .post(base)
      .field('kind', 'aadhaar')
      .attach('file', PDF, { filename: 'front.pdf', contentType: 'application/pdf' })
    expect(front.status).toBe(201)
    expect(front.body.path).toMatch(/\.pdf$/)
    await getTestAgent().post(base).field('kind', 'aadhaar').attach('file', PNG, 'back.png').expect(201)
    const third = await getTestAgent().post(base).field('kind', 'aadhaar').attach('file', PNG, 'extra.png')
    expect(third.status).toBe(400)

    // A file whose bytes are not an image or PDF is refused even with an image type.
    const fake = await getTestAgent()
      .post(base)
      .field('kind', 'pan')
      .attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' })
    expect(fake.status).toBe(400)

    const list = await getTestAgent().get(base)
    expect(list.body.map((doc: { kind: string }) => doc.kind)).toEqual(['photo', 'aadhaar', 'aadhaar'])

    const removed = await getTestAgent().delete(`${base}/${front.body.id}`)
    expect(removed.status).toBe(200)
    expect(existsSync(uploadedFile(front.body.path))).toBe(false)

    // Deleting the customer removes the remaining files.
    await ipc(IPC_CHANNELS.CUSTOMERS_DELETE, created.id)
    expect(existsSync(uploadedFile(newPhoto.body.path))).toBe(false)
  })

  it('keeps dated notes and starts the log with the note given at creation', async () => {
    const created = await ipc<{ id: number }>(IPC_CHANNELS.CUSTOMERS_CREATE, {
      ...sampleCustomer,
      notes: 'Prefers morning visits',
    })
    const base = `/api/customers/${created.id}/notes`

    const initial = await getTestAgent().get(base)
    expect(initial.body).toHaveLength(1)
    expect(initial.body[0].body).toBe('Prefers morning visits')

    const empty = await getTestAgent().post(base).send({ body: '   ' })
    expect(empty.status).toBe(400)

    const added = await getTestAgent().post(base).send({ body: 'Called about renewal' })
    expect(added.status).toBe(201)
    expect(added.body.createdBy).toBe('admin')

    const list = await getTestAgent().get(base)
    expect(list.body.map((note: { body: string }) => note.body)).toEqual([
      'Called about renewal',
      'Prefers morning visits',
    ])

    await getTestAgent().delete(`${base}/${added.body.id}`).expect(200)
    const after = await getTestAgent().get(base)
    expect(after.body).toHaveLength(1)

    const missing = await getTestAgent().get('/api/customers/999999/notes')
    expect(missing.status).toBe(404)
  })
})
