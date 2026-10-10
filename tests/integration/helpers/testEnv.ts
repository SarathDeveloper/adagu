import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach } from 'vitest'
import request from 'supertest'
import type { IpcResult } from '@shared/types'
import { createApp } from '../../../server/app'
import { clearAllSessionsForTests } from '../../../server/auth/session'
import { seedE2eAdmin } from '../../../server/auth/users'
import { backupDatabaseTo, restoreDatabaseFrom } from '../../../server/db/backup'
import { closeDatabase, getDatabase, initDatabase } from '../../../server/db'

export const IPC_CHANNELS = {
  APP_VERSION: 'app:version',
  APP_EXPORT_DB: 'app:exportDb',
  APP_RESTORE_DB: 'app:restoreDb',
  APP_BACKUP_STATUS: 'app:backupStatus',
  CUSTOMERS_LIST: 'customers:list',
  CUSTOMERS_GET: 'customers:get',
  CUSTOMERS_CREATE: 'customers:create',
  CUSTOMERS_UPDATE: 'customers:update',
  CUSTOMERS_DELETE: 'customers:delete',
  DUES_LIST: 'dues:list',
  DUES_CREATE: 'dues:create',
  DUES_UPDATE: 'dues:update',
  DUES_DELETE: 'dues:delete',
  DUES_RECORD_PAYMENT: 'dues:recordPayment',
  DUES_MARK_PAID: 'dues:markPaid',
  REPORTS_CATALOG: 'reports:catalog',
  REPORTS_RUN: 'reports:run',
  SETTINGS_GET: 'settings:get',
  SETTINGS_COUNTS: 'settings:counts',
  SETTINGS_UPDATE: 'settings:update',
  METAL_RATES_LATEST: 'metalRates:latest',
  METAL_RATES_LIST: 'metalRates:list',
  METAL_RATES_UPSERT: 'metalRates:upsert',
} as const

let tempDir = ''
let app = createApp()
let httpAgent = request.agent(app)

function agent() {
  return httpAgent
}

function toResult(response: request.Response): IpcResult<unknown> {
  if (response.status >= 200 && response.status < 300) {
    return { ok: true, data: response.status === 204 ? undefined : response.body }
  }
  const error =
    typeof response.body?.error === 'string' ? response.body.error : response.text || 'Request failed'
  const referenceId = typeof response.body?.referenceId === 'string' ? response.body.referenceId : undefined
  return referenceId ? { ok: false, error, referenceId } : { ok: false, error }
}

export async function loginAsAdmin(): Promise<void> {
  seedE2eAdmin(getDatabase())
  const response = await agent().post('/api/auth/login').send({
    username: 'admin',
    password: 'admin123',
  })
  if (response.status !== 200) {
    throw new Error(`Admin login failed: ${response.text}`)
  }
}

export async function invokeIpcForTests<T>(channel: string, rawInput?: unknown): Promise<IpcResult<T>> {
  const input = rawInput as Record<string, unknown> | string | number | undefined
  let response: request.Response

  switch (channel) {
    case IPC_CHANNELS.APP_VERSION:
      response = await agent().get('/api/version')
      break
    case IPC_CHANNELS.APP_BACKUP_STATUS:
      response = await agent().get('/api/backup/status')
      break
    case IPC_CHANNELS.APP_EXPORT_DB: {
      const destinationPath = (input as { destinationPath: string }).destinationPath
      try {
        const data = await backupDatabaseTo(destinationPath)
        return { ok: true, data: data as T }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Export failed',
        }
      }
    }
    case IPC_CHANNELS.APP_RESTORE_DB: {
      const sourcePath = (input as { sourcePath: string }).sourcePath
      try {
        const data = await restoreDatabaseFrom(sourcePath)
        return { ok: true, data: data as T }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Restore failed'
        return { ok: false, error: message }
      }
    }
    case IPC_CHANNELS.CUSTOMERS_LIST:
      response = await agent().get('/api/customers').query(typeof input === 'string' ? { q: input } : {})
      break
    case IPC_CHANNELS.CUSTOMERS_GET:
      response = await agent().get(`/api/customers/${input}`)
      break
    case IPC_CHANNELS.CUSTOMERS_CREATE:
      response = await agent().post('/api/customers').send(input)
      break
    case IPC_CHANNELS.CUSTOMERS_UPDATE: {
      const { id, input: body } = input as { id: number; input: unknown }
      response = await agent().put(`/api/customers/${id}`).send(body)
      break
    }
    case IPC_CHANNELS.CUSTOMERS_DELETE:
      response = await agent().delete(`/api/customers/${input}`)
      break
    case IPC_CHANNELS.DUES_LIST:
      response = await agent().get('/api/dues').query(typeof input === 'string' ? { q: input } : {})
      break
    case IPC_CHANNELS.DUES_CREATE:
      response = await agent().post('/api/dues').send(input)
      break
    case IPC_CHANNELS.DUES_UPDATE:
      response = await agent()
        .put(`/api/dues/${(input as { id: number }).id}`)
        .send(input)
      break
    case IPC_CHANNELS.DUES_DELETE:
      response = await agent().delete(`/api/dues/${input}`)
      break
    case IPC_CHANNELS.DUES_RECORD_PAYMENT:
      response = await agent()
        .post(`/api/dues/${(input as { dueEntryId: number }).dueEntryId}/payment`)
        .send(input)
      break
    case IPC_CHANNELS.DUES_MARK_PAID:
      response = await agent().post(`/api/dues/${input}/mark-paid`)
      break
    case IPC_CHANNELS.REPORTS_CATALOG:
      response = await agent().get('/api/reports')
      break
    case IPC_CHANNELS.REPORTS_RUN: {
      const { id, ...query } = input as {
        id: string
        from?: string
        to?: string
        customerId?: number
      }
      response = await agent().get(`/api/reports/${id}`).query(query)
      break
    }
    case IPC_CHANNELS.SETTINGS_GET:
      response = await agent().get('/api/settings')
      break
    case IPC_CHANNELS.SETTINGS_COUNTS:
      response = await agent().get('/api/settings/counts')
      break
    case IPC_CHANNELS.SETTINGS_UPDATE:
      response = await agent().put('/api/settings').send(input)
      break
    case IPC_CHANNELS.METAL_RATES_LATEST:
      response = await agent().get('/api/metal-rates/latest')
      break
    case IPC_CHANNELS.METAL_RATES_LIST:
      response = await agent().get('/api/metal-rates')
      break
    case IPC_CHANNELS.METAL_RATES_UPSERT:
      response = await agent().post('/api/metal-rates').send(input)
      break
    default:
      throw new Error(`No HTTP mapping for ${channel}`)
  }

  return toResult(response) as IpcResult<T>
}

export function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.data
}

export async function ipc<T>(channel: string, input?: unknown): Promise<T> {
  return unwrap(await invokeIpcForTests<T>(channel, input))
}

export function useIntegrationEnv(): void {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'jtp-int-'))
    process.env.JEWELTRACKERPRO_E2E_USER_DATA = tempDir
    clearAllSessionsForTests()
    closeDatabase()
    initDatabase()
    app = createApp()
    httpAgent = request.agent(app)
    await loginAsAdmin()
  })

  afterEach(() => {
    clearAllSessionsForTests()
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
    delete process.env.JEWELTRACKERPRO_E2E_USER_DATA
  })
}

export function getTestAgent() {
  return agent()
}

export function dbVersions(): number[] {
  const db = getDatabase()
  return db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((row) => (row as { version: number }).version)
}

let customerSerial = 0

export function uniqueCustomerPhone(): string {
  customerSerial += 1
  return `9${String(100000000 + customerSerial).slice(0, 9)}`
}
