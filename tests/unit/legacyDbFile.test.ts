import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateLegacyDbFile } from '../../server/db/index'
import { resetLoggerStateForTests } from '../../server/lib/logger'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pd-legacy-db-'))
  process.env.PAWNDESK_E2E_USER_DATA = dir
  resetLoggerStateForTests()
})

afterEach(() => {
  delete process.env.PAWNDESK_E2E_USER_DATA
  rmSync(dir, { recursive: true, force: true })
})

describe('legacy database file name', () => {
  it('moves jeweltrackerpro.db and its WAL/SHM files to pawndesk.db', () => {
    writeFileSync(join(dir, 'jeweltrackerpro.db'), 'main')
    writeFileSync(join(dir, 'jeweltrackerpro.db-wal'), 'wal')
    writeFileSync(join(dir, 'jeweltrackerpro.db-shm'), 'shm')

    migrateLegacyDbFile(join(dir, 'pawndesk.db'))

    expect(readFileSync(join(dir, 'pawndesk.db'), 'utf8')).toBe('main')
    expect(readFileSync(join(dir, 'pawndesk.db-wal'), 'utf8')).toBe('wal')
    expect(readFileSync(join(dir, 'pawndesk.db-shm'), 'utf8')).toBe('shm')
    expect(existsSync(join(dir, 'jeweltrackerpro.db'))).toBe(false)
    expect(existsSync(join(dir, 'jeweltrackerpro.db-wal'))).toBe(false)
  })

  it('leaves both files alone once a pawndesk.db exists', () => {
    writeFileSync(join(dir, 'pawndesk.db'), 'new')
    writeFileSync(join(dir, 'jeweltrackerpro.db'), 'old')

    migrateLegacyDbFile(join(dir, 'pawndesk.db'))

    expect(readFileSync(join(dir, 'pawndesk.db'), 'utf8')).toBe('new')
    expect(readFileSync(join(dir, 'jeweltrackerpro.db'), 'utf8')).toBe('old')
  })

  it('finishes a move that stopped after the companions were renamed', () => {
    writeFileSync(join(dir, 'pawndesk.db-wal'), 'wal')
    writeFileSync(join(dir, 'jeweltrackerpro.db'), 'main')

    migrateLegacyDbFile(join(dir, 'pawndesk.db'))

    expect(readFileSync(join(dir, 'pawndesk.db'), 'utf8')).toBe('main')
    expect(readFileSync(join(dir, 'pawndesk.db-wal'), 'utf8')).toBe('wal')
  })

  it('does nothing on a fresh install', () => {
    migrateLegacyDbFile(join(dir, 'pawndesk.db'))
    expect(existsSync(join(dir, 'pawndesk.db'))).toBe(false)
  })
})
