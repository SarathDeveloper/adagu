import { once } from 'node:events'
import {
  closeSync,
  createReadStream,
  createWriteStream,
  fstatSync,
  mkdirSync,
  openSync,
  readSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { dirname, isAbsolute, resolve, sep } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createDeflateRaw, createInflateRaw } from 'node:zlib'

const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let crc = i
  for (let j = 0; j < 8; j++) {
    crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  CRC_TABLE[i] = crc >>> 0
}

const NOT_A_BACKUP = 'This file is not an AdaguTrackerPro backup'
const DAMAGED = 'Backup file is damaged and cannot be used'
const MAX_ZIP_ENTRY_BYTES = 2 * 1024 * 1024 * 1024
const FLAG_UTF8_AND_DESCRIPTOR = 0x0808
const METHOD_STORE = 0
const METHOD_DEFLATE = 8

export type ZipSource = {
  name: string
  compress: boolean
  data?: Buffer
  filePath?: string
}

type ZipEntryInfo = {
  name: string
  method: number
  crc: number
  compressedSize: number
  uncompressedSize: number
  dataOffset: number
}

export function createCrc32(): { update(buffer: Buffer): void; digest(): number } {
  let crc = 0xffffffff
  return {
    update(buffer: Buffer) {
      for (let i = 0; i < buffer.length; i++) {
        crc = CRC_TABLE[(crc ^ buffer[i]!) & 0xff]! ^ (crc >>> 8)
      }
    },
    digest() {
      return (crc ^ 0xffffffff) >>> 0
    },
  }
}

export function crc32(buffer: Buffer): number {
  const hasher = createCrc32()
  hasher.update(buffer)
  return hasher.digest()
}

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value >>> 0, 0)
  return buffer
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value >>> 0, 0)
  return buffer
}

export function assertSafeZipName(name: string): void {
  if (!name || name.includes('\\') || name.includes(':') || isAbsolute(name)) {
    throw new Error(NOT_A_BACKUP)
  }
  const parts = name.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(NOT_A_BACKUP)
  }
}

async function writeAll(handle: FileHandle, buffer: Buffer): Promise<void> {
  let offset = 0
  while (offset < buffer.length) {
    const { bytesWritten } = await handle.write(buffer.subarray(offset))
    if (bytesWritten <= 0) {
      throw new Error('Could not write the backup file')
    }
    offset += bytesWritten
  }
}

async function writePayload(
  handle: FileHandle,
  source: Readable,
  compress: boolean,
): Promise<{ crc: number; compressedSize: number; uncompressedSize: number }> {
  const hasher = createCrc32()
  let uncompressedSize = 0
  let compressedSize = 0
  let chain = Promise.resolve()
  const writeOut = (buffer: Buffer) => {
    compressedSize += buffer.length
    if (compressedSize > MAX_ZIP_ENTRY_BYTES) {
      throw new Error('Backup is too large to store')
    }
    chain = chain.then(async () => {
      await writeAll(handle, buffer)
    })
  }

  try {
    if (!compress) {
      for await (const chunk of source) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        hasher.update(buffer)
        uncompressedSize += buffer.length
        writeOut(buffer)
      }
      await chain
      return { crc: hasher.digest(), compressedSize, uncompressedSize }
    }

    const deflater = createDeflateRaw()
    const finished = new Promise<void>((resolvePromise, reject) => {
      deflater.on('data', (chunk: Buffer) => {
        try {
          writeOut(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Could not write the backup file'))
        }
      })
      deflater.on('error', reject)
      deflater.on('end', () => resolvePromise())
    })
    try {
      for await (const chunk of source) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        hasher.update(buffer)
        uncompressedSize += buffer.length
        if (uncompressedSize > MAX_ZIP_ENTRY_BYTES) {
          throw new Error('Backup is too large to store')
        }
        if (!deflater.write(buffer)) {
          await once(deflater, 'drain')
        }
      }
      deflater.end()
      await finished
      await chain
    } catch (error) {
      deflater.destroy()
      source.destroy()
      throw error
    }
    return { crc: hasher.digest(), compressedSize, uncompressedSize }
  } catch (error) {
    source.destroy()
    throw error
  }
}

function sourceFor(entry: ZipSource): Readable {
  if (entry.data) return Readable.from(entry.data)
  if (entry.filePath) return createReadStream(entry.filePath)
  throw new Error('Missing backup entry')
}

async function writeZipEntry(
  handle: FileHandle,
  offset: number,
  entry: ZipSource,
): Promise<{ nextOffset: number; central: Buffer }> {
  const name = Buffer.from(entry.name, 'utf8')
  const method = entry.compress ? METHOD_DEFLATE : METHOD_STORE
  const local = Buffer.concat([
    u32(0x04034b50),
    u16(20),
    u16(FLAG_UTF8_AND_DESCRIPTOR),
    u16(method),
    u16(0),
    u16(0),
    u32(0),
    u32(0),
    u32(0),
    u16(name.length),
    u16(0),
    name,
  ])
  await writeAll(handle, local)
  const stats = await writePayload(handle, sourceFor(entry), entry.compress)
  const descriptor = Buffer.concat([
    u32(0x08074b50),
    u32(stats.crc),
    u32(stats.compressedSize),
    u32(stats.uncompressedSize),
  ])
  await writeAll(handle, descriptor)
  const central = Buffer.concat([
    u32(0x02014b50),
    u16(20),
    u16(20),
    u16(FLAG_UTF8_AND_DESCRIPTOR),
    u16(method),
    u16(0),
    u16(0),
    u32(stats.crc),
    u32(stats.compressedSize),
    u32(stats.uncompressedSize),
    u16(name.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(offset),
    name,
  ])
  return {
    nextOffset: offset + local.length + stats.compressedSize + descriptor.length,
    central,
  }
}

/** Writes a zip archive one entry at a time. Names must be relative and safe. */
export async function writeZipFile(destinationPath: string, entries: ZipSource[]): Promise<void> {
  if (entries.length > 0xffff) {
    throw new Error('Backup is too large to store')
  }
  for (const entry of entries) {
    assertSafeZipName(entry.name)
  }
  const handle = await open(destinationPath, 'w')
  try {
    let offset = 0
    const centrals: Buffer[] = []
    for (const entry of entries) {
      const written = await writeZipEntry(handle, offset, entry)
      offset = written.nextOffset
      centrals.push(written.central)
    }
    const centralBytes = Buffer.concat(centrals)
    const eocd = Buffer.concat([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(entries.length),
      u16(entries.length),
      u32(centralBytes.length),
      u32(offset),
      u16(0),
    ])
    await writeAll(handle, Buffer.concat([centralBytes, eocd]))
  } finally {
    await handle.close()
  }
}

function readExact(fd: number, length: number, position: number): Buffer {
  const buffer = Buffer.alloc(length)
  let offset = 0
  while (offset < length) {
    const bytes = readSync(fd, buffer, offset, length - offset, position + offset)
    if (bytes <= 0) {
      throw new Error(DAMAGED)
    }
    offset += bytes
  }
  return buffer
}

function readEocd(fd: number, size: number): { entries: number; cdSize: number; cdOffset: number } {
  const tailLen = Math.min(size, 22 + 65535)
  const tail = readExact(fd, tailLen, size - tailLen)
  for (let i = tailLen - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) !== 0x06054b50) continue
    const commentLen = tail.readUInt16LE(i + 20)
    if (i + 22 + commentLen !== tailLen) continue
    const entries = tail.readUInt16LE(i + 10)
    const cdSize = tail.readUInt32LE(i + 12)
    const cdOffset = tail.readUInt32LE(i + 16)
    if (entries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      throw new Error(NOT_A_BACKUP)
    }
    return { entries, cdSize, cdOffset }
  }
  throw new Error(NOT_A_BACKUP)
}

function readEntries(zipPath: string): ZipEntryInfo[] {
  const fd = openSync(zipPath, 'r')
  try {
    const size = fstatSync(fd).size
    if (size < 22) {
      throw new Error(NOT_A_BACKUP)
    }
    const eocd = readEocd(fd, size)
    if (eocd.cdOffset + eocd.cdSize > size) {
      throw new Error(DAMAGED)
    }
    const cd = readExact(fd, eocd.cdSize, eocd.cdOffset)
    const entries: ZipEntryInfo[] = []
    let position = 0
    while (position + 46 <= cd.length) {
      if (cd.readUInt32LE(position) !== 0x02014b50) {
        throw new Error(DAMAGED)
      }
      const flags = cd.readUInt16LE(position + 8)
      const method = cd.readUInt16LE(position + 10)
      const crc = cd.readUInt32LE(position + 16)
      const compressedSize = cd.readUInt32LE(position + 20)
      const uncompressedSize = cd.readUInt32LE(position + 24)
      const nameLen = cd.readUInt16LE(position + 28)
      const extraLen = cd.readUInt16LE(position + 30)
      const commentLen = cd.readUInt16LE(position + 32)
      const localOffset = cd.readUInt32LE(position + 42)
      const nameStart = position + 46
      const nameEnd = nameStart + nameLen
      if (nameEnd + extraLen + commentLen > cd.length) {
        throw new Error(DAMAGED)
      }
      if (flags & 0x1 || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
        throw new Error(NOT_A_BACKUP)
      }
      const name = cd.toString('utf8', nameStart, nameEnd)
      if (localOffset + 30 > size) {
        throw new Error(DAMAGED)
      }
      const local = readExact(fd, 30, localOffset)
      if (local.readUInt32LE(0) !== 0x04034b50) {
        throw new Error(DAMAGED)
      }
      const localNameLen = local.readUInt16LE(26)
      const localExtraLen = local.readUInt16LE(28)
      const dataOffset = localOffset + 30 + localNameLen + localExtraLen
      if (dataOffset + compressedSize > size) {
        throw new Error(DAMAGED)
      }
      entries.push({ name, method, crc, compressedSize, uncompressedSize, dataOffset })
      position = nameEnd + extraLen + commentLen
    }
    if (entries.length !== eocd.entries && eocd.entries !== 0) {
      // Some writers leave the count matching. A short directory is damaged.
      if (position !== cd.length) {
        throw new Error(DAMAGED)
      }
    }
    return entries
  } finally {
    closeSync(fd)
  }
}

function destinationFor(destDir: string, name: string): string {
  assertSafeZipName(name)
  const target = resolve(destDir, name)
  const root = resolve(destDir)
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(NOT_A_BACKUP)
  }
  return target
}

async function extractEntry(zipPath: string, entry: ZipEntryInfo, destDir: string): Promise<void> {
  const dest = destinationFor(destDir, entry.name)
  mkdirSync(dirname(dest), { recursive: true })
  if (entry.compressedSize === 0) {
    if (entry.uncompressedSize !== 0 || entry.crc !== 0) {
      throw new Error(DAMAGED)
    }
    writeFileSync(dest, Buffer.alloc(0))
    return
  }
  const hasher = createCrc32()
  let written = 0
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      written += buffer.length
      if (written > entry.uncompressedSize || written > MAX_ZIP_ENTRY_BYTES) {
        callback(new Error(DAMAGED))
        return
      }
      hasher.update(buffer)
      callback(null, buffer)
    },
  })
  const input = createReadStream(zipPath, {
    start: entry.dataOffset,
    end: entry.dataOffset + entry.compressedSize - 1,
  })
  const output = createWriteStream(dest)
  try {
    if (entry.method === METHOD_STORE) {
      await pipeline(input, counter, output)
    } else if (entry.method === METHOD_DEFLATE) {
      await pipeline(input, createInflateRaw(), counter, output)
    } else {
      throw new Error(NOT_A_BACKUP)
    }
  } catch (error) {
    output.destroy()
    rmSync(dest, { force: true })
    if (error instanceof Error && (error.message === DAMAGED || error.message === NOT_A_BACKUP)) {
      throw error
    }
    throw new Error(DAMAGED, { cause: error })
  }
  if (written !== entry.uncompressedSize || hasher.digest() !== entry.crc) {
    rmSync(dest, { force: true })
    throw new Error(DAMAGED)
  }
}

/**
 * Extracts a backup archive into `destDir`. Every name is checked before any
 * file is written. `allow` rejects entries that are not part of a full backup.
 */
export async function extractZipFile(
  zipPath: string,
  destDir: string,
  allow: (name: string) => boolean,
): Promise<void> {
  const entries = readEntries(zipPath)
  for (const entry of entries) {
    if (entry.name.endsWith('/')) {
      assertSafeZipName(entry.name.slice(0, -1))
      continue
    }
    assertSafeZipName(entry.name)
    if (!allow(entry.name)) {
      throw new Error(NOT_A_BACKUP)
    }
    if (entry.method !== METHOD_STORE && entry.method !== METHOD_DEFLATE) {
      throw new Error(NOT_A_BACKUP)
    }
    if (entry.compressedSize > MAX_ZIP_ENTRY_BYTES || entry.uncompressedSize > MAX_ZIP_ENTRY_BYTES) {
      throw new Error(DAMAGED)
    }
  }
  mkdirSync(destDir, { recursive: true })
  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue
    await extractEntry(zipPath, entry, destDir)
  }
}

export function isZipFile(filePath: string): boolean {
  let fd: number | null = null
  try {
    fd = openSync(filePath, 'r')
    const header = Buffer.alloc(4)
    const bytes = readSync(fd, header, 0, 4, 0)
    return bytes === 4 && header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04
  } catch {
    return false
  } finally {
    if (fd !== null) {
      closeSync(fd)
    }
  }
}
