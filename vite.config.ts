import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** Same `PORT` as `server/index.ts` (default 3000). Set `PORT=3001` when 3000 is taken. */
const apiPort = process.env.PORT || '3000'
const apiTarget = `http://127.0.0.1:${apiPort}`

/**
 * This folder, with the drive letter cased the way the file system reports it.
 *
 * Vite takes its root from process.cwd(), and a Windows terminal opened as
 * `c:\…` (VS Code does this) gives `c:/…`, while Vite resolves the HTML inputs
 * through the real path, `C:/…`. Vite then cannot find the inline <style> in
 * index.html and print.html ("No matching HTML proxy module found") and the
 * build fails. realpathSync.native returns the real casing.
 */
const projectRoot = realpathSync.native(__dirname)

/**
 * Serves `print.html` for `/print/*` during development.
 *
 * In production the Express fallback picks the document, but the Vite dev
 * server (and `npm run tauri:dev`, which runs Vite) has to do the same thing or
 * a print URL would load the whole application shell.
 *
 * Runs before Vite's own middlewares, so the rewrite happens before the SPA
 * fallback would have sent `index.html`. Vite still transforms and serves
 * `print.html` itself.
 */
function printDocumentPlugin(): Plugin {
  return {
    name: 'jeweltrackerpro-print-document',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? ''
        const queryAt = url.indexOf('?')
        const pathname = queryAt === -1 ? url : url.slice(0, queryAt)
        if (pathname === '/print' || pathname.startsWith('/print/')) {
          // Keep the query so the document loads exactly as requested.
          req.url = `/print.html${queryAt === -1 ? '' : url.slice(queryAt)}`
        }
        next()
      })
    },
  }
}

export default defineConfig({
  root: projectRoot,
  plugins: [react(), printDocumentPlugin()],
  resolve: {
    alias: {
      '@shared': resolve(projectRoot, 'shared'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      // Two documents: the application, and the lighter print preview that
      // loads in the preview iframe.
      input: {
        main: resolve(projectRoot, 'index.html'),
        print: resolve(projectRoot, 'print.html'),
      },
    },
  },
  server: {
    // Desktop and web dev load http://127.0.0.1:5173 — bind IPv4 explicitly (localhost may be IPv6-only).
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/uploads': apiTarget,
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    proxy: {
      '/api': apiTarget,
      '/uploads': apiTarget,
    },
  },
})
