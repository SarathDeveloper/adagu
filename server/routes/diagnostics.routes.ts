import { Router } from 'express'
import { clientCrashReportSchema, hostCrashReportSchema } from '@shared/schemas'
import type { DiagnosticSource } from '@shared/types'
import { getAppVersion } from '../lib/appPaths'
import { asyncHandler, parseBody } from '../lib/http'
import { logDiagnostic } from '../lib/logger'
import { clearPendingFatal, readPendingFatal, writePendingFatal } from '../lib/pendingFatal'

/**
 * Reports a crash once. A page that throws on every render would otherwise fill
 * the log: identical messages inside the window share one reference ID.
 */
const DUPLICATE_WINDOW_MS = 5000

let lastCrash:
  | { message: string; at: number; referenceId: string; timestamp: string }
  | null = null

/**
 * A crash message is one log line. Newlines in it would let a caller forge
 * extra entries in the log, so they are folded into spaces; the stack trace
 * travels separately as the error.
 */
function oneLine(message: string): string {
  return message.replace(/[\r\n\u2028\u2029]+/g, ' ').trim()
}

function recordCrash(rawMessage: string, error?: unknown): { referenceId: string; timestamp: string } {
  const message = oneLine(rawMessage)
  const now = Date.now()
  if (lastCrash && lastCrash.message === message && now - lastCrash.at < DUPLICATE_WINDOW_MS) {
    return { referenceId: lastCrash.referenceId, timestamp: lastCrash.timestamp }
  }

  const result = logDiagnostic('crash', message, error)
  lastCrash = { message, at: now, ...result }
  return result
}

function describeSource(source: DiagnosticSource): string {
  if (source === 'window') {
    return 'Uncaught error'
  }
  if (source === 'rejection') {
    return 'Unhandled rejection'
  }
  return 'Unexpected error'
}

const router = Router()

// These are deliberately unauthenticated: a crash can happen on the login
// screen, and the desktop shell reports WebView2 failures with no session.
// What keeps other websites out is in app.ts: no CORS, so a page from another
// origin cannot send these JSON requests, and the Host check refuses DNS
// rebinding.
router.post(
  '/client',
  asyncHandler((req, res) => {
    const input = parseBody(clientCrashReportSchema, req.body)
    const reference = recordCrash(
      `${describeSource(input.source)}: ${input.message}`,
      input.stack ? new Error(input.stack) : undefined,
    )
    res.json({ ...reference, version: getAppVersion() })
  }),
)

router.post(
  '/host',
  asyncHandler((req, res) => {
    const input = parseBody(hostCrashReportSchema, req.body)
    const reference = recordCrash(
      input.message,
      input.detail ? new Error(input.detail) : undefined,
    )
    if (input.fatal) {
      writePendingFatal({
        referenceId: reference.referenceId,
        timestamp: reference.timestamp,
        version: getAppVersion(),
        category: 'crash',
        message: oneLine(input.message),
        ...(input.detail ? { stack: input.detail } : {}),
      })
    }
    res.json({ ...reference, version: getAppVersion() })
  }),
)

router.get(
  '/pending',
  asyncHandler((_req, res) => {
    res.json(readPendingFatal())
  }),
)

router.post(
  '/pending/ack',
  asyncHandler((_req, res) => {
    clearPendingFatal()
    res.status(204).end()
  }),
)

export default router
