/**
 * Slows down password guessing on the login endpoint.
 *
 * Failures are counted per username and per client address. After
 * FREE_ATTEMPTS failures inside WINDOW_MS, each further attempt has to wait,
 * starting at BASE_LOCK_MS and doubling up to MAX_LOCK_MS. A successful
 * sign-in clears the username's count. Everything is in memory: the API is a
 * single local process, and a restart clearing the counters is acceptable.
 */

const FREE_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000
const BASE_LOCK_MS = 30 * 1000
const MAX_LOCK_MS = 15 * 60 * 1000

type Entry = { failures: number; firstFailureAt: number; lockedUntil: number }

const entries = new Map<string, Entry>()

function keysFor(username: string, address: string | undefined): string[] {
  return [`user:${username.trim().toLowerCase()}`, `addr:${address ?? 'unknown'}`]
}

function current(key: string, now: number): Entry | null {
  const entry = entries.get(key)
  if (!entry) return null
  if (now - entry.firstFailureAt > WINDOW_MS && entry.lockedUntil <= now) {
    entries.delete(key)
    return null
  }
  return entry
}

/** Seconds the caller must wait before trying again, or 0 when allowed. */
export function loginRetryAfterSeconds(
  username: string,
  address: string | undefined,
  now = Date.now(),
): number {
  let waitMs = 0
  for (const key of keysFor(username, address)) {
    const entry = current(key, now)
    if (entry && entry.lockedUntil > now) {
      waitMs = Math.max(waitMs, entry.lockedUntil - now)
    }
  }
  return Math.ceil(waitMs / 1000)
}

export function recordLoginFailure(
  username: string,
  address: string | undefined,
  now = Date.now(),
): void {
  for (const key of keysFor(username, address)) {
    const entry = current(key, now) ?? { failures: 0, firstFailureAt: now, lockedUntil: 0 }
    entry.failures += 1
    if (entry.failures >= FREE_ATTEMPTS) {
      const extra = entry.failures - FREE_ATTEMPTS
      entry.lockedUntil = now + Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** extra)
    }
    entries.set(key, entry)
  }
}

export function recordLoginSuccess(username: string): void {
  entries.delete(keysFor(username, undefined)[0])
}

export function resetLoginThrottleForTests(): void {
  entries.clear()
}
