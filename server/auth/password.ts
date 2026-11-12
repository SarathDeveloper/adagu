import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LEN = 64

export function createSalt(): Buffer {
  return randomBytes(16)
}

export function hashPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LEN)
}

function hashPasswordAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LEN, (error, key) => (error ? reject(error) : resolve(key)))
  })
}

function matches(expectedHex: string, actual: Buffer): boolean {
  const expected = Buffer.from(expectedHex, 'hex')
  if (expected.length !== actual.length) {
    return false
  }
  return timingSafeEqual(expected, actual)
}

export function verifyPassword(password: string, hashHex: string, saltHex: string): boolean {
  return matches(hashHex, hashPassword(password, Buffer.from(saltHex, 'hex')))
}

/**
 * Same check off the event loop. scrypt is deliberately slow; doing it
 * synchronously on every login lets a burst of attempts stall every other
 * request the API is serving.
 */
export async function verifyPasswordAsync(
  password: string,
  hashHex: string,
  saltHex: string,
): Promise<boolean> {
  return matches(hashHex, await hashPasswordAsync(password, Buffer.from(saltHex, 'hex')))
}

let dummy: { hashHex: string; saltHex: string } | null = null

/**
 * Spends the same time as a real check for a username that does not exist, so
 * the response time does not reveal which usernames are real.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPasswordToHex(randomBytes(16).toString('hex'))
  await verifyPasswordAsync(password, dummy.hashHex, dummy.saltHex)
}

export function hashPasswordToHex(password: string, salt = createSalt()): {
  hashHex: string
  saltHex: string
} {
  return {
    hashHex: hashPassword(password, salt).toString('hex'),
    saltHex: salt.toString('hex'),
  }
}
