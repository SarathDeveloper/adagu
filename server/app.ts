import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import { getAppRoot, getAppVersion } from './lib/appPaths'
import express from 'express'
import {
  attachSession,
  requireAuth,
  requireFeature,
  requirePasswordChanged,
  requireRole,
} from './auth/middleware'
import { getDbPath } from './db'
import { errorMiddleware } from './lib/http'
import { getLogsDir } from './lib/logger'
import { getUploadsDir } from './lib/paths'
import { localHostOnly, sameOriginWrites, securityHeaders } from './lib/requestGuards'
import authRoutes from './routes/auth.routes'
import backupRoutes from './routes/backup.routes'
import customersRoutes from './routes/customers.routes'
import dashboardRoutes from './routes/dashboard.routes'
import diagnosticsRoutes from './routes/diagnostics.routes'
import duesRoutes from './routes/dues.routes'
import metalRatesRoutes from './routes/metalRates.routes'
import pledgesRoutes from './routes/pledges.routes'
import reportsRoutes from './routes/reports.routes'
import settingsRoutes from './routes/settings.routes'
import systemRoutes from './routes/system.routes'
import usersRoutes from './routes/users.routes'
import goldSavingsRoutes from './routes/goldSavings.routes'

export function createApp(): express.Express {
  const rootDir = getAppRoot()
  const app = express()
  // No CORS: the app is always served from this same origin (directly, or
  // through the Vite dev proxy), so no other site needs to call the API. The
  // old `cors({ origin: true, credentials: true })` let any web page the shop
  // computer opened read and change data with the signed-in user's cookie.
  app.use(localHostOnly)
  app.use(sameOriginWrites)
  app.use(securityHeaders)
  app.use(express.json({ limit: '2mb' }))
  app.use(attachSession)
  // Uploads are named with a random UUID and never overwritten, so a given URL
  // always serves the same bytes and can be cached indefinitely. Shop logos and
  // signatures are requested on every print preview, so this matters.
  app.use('/uploads', express.static(getUploadsDir(), { maxAge: '365d', immutable: true }))

  // The desktop shell polls this before anyone signs in, so it stays open;
  // the file paths (which contain the Windows user name) need a session.
  app.get('/api/version', (req, res) => {
    res.json({
      version: getAppVersion(),
      ...(req.user ? { dbPath: getDbPath(), logsPath: getLogsDir() } : {}),
    })
  })

  app.use('/api', requirePasswordChanged)

  app.use('/api/auth', authRoutes)
  app.use('/api/diagnostics', diagnosticsRoutes)
  app.use('/api/users', requireAuth, requireRole('admin'), usersRoutes)
  app.use('/api/backup', requireAuth, requireFeature('settings'), backupRoutes)
  app.use('/api/dashboard', requireAuth, requireFeature('dashboard'), dashboardRoutes)
  app.use('/api/customers', requireAuth, requireFeature('customers'), customersRoutes)
  app.use('/api/dues', requireAuth, requireFeature('dues'), duesRoutes)
  app.use('/api/pledges', requireAuth, requireFeature('adagu'), pledgesRoutes)
  app.use('/api/metal-rates', requireAuth, metalRatesRoutes)
  app.use('/api/settings', settingsRoutes)
  app.use('/api/reports', requireAuth, requireFeature('reports'), reportsRoutes)
  app.use('/api/gold-savings', requireAuth, requireFeature('gold_savings'), goldSavingsRoutes)
  app.use('/api/system', systemRoutes)

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  const distDir = join(rootDir, 'dist')
  if (existsSync(distDir)) {
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          // Vite fingerprints everything under assets/, so those files are safe
          // to cache forever. The two HTML documents are not, because they are
          // what points at the current fingerprints.
          if (filePath.includes(`${sep}assets${sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          } else {
            res.setHeader('Cache-Control', 'no-cache')
          }
        },
      }),
    )
    // Print documents are a separate, much smaller entry so the preview iframe
    // does not have to load the whole application.
    const printDocument = join(distDir, 'print.html')
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        next()
        return
      }
      const isPrint = req.path === '/print' || req.path.startsWith('/print/')
      res.sendFile(isPrint && existsSync(printDocument) ? printDocument : join(distDir, 'index.html'))
    })
  }

  app.use(errorMiddleware)
  return app
}
