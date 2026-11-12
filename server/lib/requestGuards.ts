import type { RequestHandler } from 'express'

/**
 * The API only ever listens on 127.0.0.1, and the app is always opened as
 * http://127.0.0.1:<port> (or localhost through the Vite dev proxy).
 */
const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]'])

function hostnameOf(host: string): string {
  // "[::1]:3000" keeps its brackets; "127.0.0.1:3000" drops the port.
  if (host.startsWith('[')) {
    const end = host.indexOf(']')
    return end === -1 ? host : host.slice(0, end + 1)
  }
  const colon = host.indexOf(':')
  return (colon === -1 ? host : host.slice(0, colon)).toLowerCase()
}

/**
 * Refuses requests addressed to any other host name. A website can point its
 * own domain at 127.0.0.1 (DNS rebinding) and then counts as same-origin with
 * the API; its requests still carry that domain in the Host header, so they
 * stop here.
 */
export const localHostOnly: RequestHandler = (req, res, next) => {
  const host = req.headers.host
  if (!host || !LOCAL_HOSTNAMES.has(hostnameOf(host))) {
    res.status(421).json({ error: 'This address is not served here' })
    return
  }
  next()
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Refuses state-changing requests sent by a page from another origin.
 *
 * Without CORS a foreign page cannot send JSON, but it can still submit a
 * multipart form (backup restore, image uploads), and every app on 127.0.0.1
 * shares cookies regardless of port, so the session cookie would go along.
 * Browsers name the sending page in Origin; requests without one (the desktop
 * shell, scripts, tests) are not browser-driven and are left alone.
 */
export const sameOriginWrites: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next()
    return
  }
  const origin = req.headers.origin
  if (origin === undefined) {
    next()
    return
  }
  if (origin !== `${req.protocol}://${req.headers.host}`) {
    res.status(403).json({ error: 'Cross-origin request refused' })
    return
  }
  next()
}

/**
 * Content-Security-Policy for the app's own pages. Scripts load only from the
 * app (the bundles use no eval), so a file that slipped into /uploads or a
 * script injected through data cannot run. Inline styles are needed by the
 * boot screen and React style props. The Tauri IPC origins let the desktop
 * window reach its native commands.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ipc: http://ipc.localhost",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ')

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  next()
}
