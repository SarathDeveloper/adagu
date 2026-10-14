import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const binariesDir = join(root, 'src-tauri', 'binaries')
const resources = join(root, 'src-tauri', 'resources')
const migrationsSrc = join(root, 'server', 'db', 'migrations')

function sidecarPaths() {
  if (process.platform === 'win32') {
    return {
      sidecar: join(binariesDir, 'jeweltrackerpro-api-x86_64-pc-windows-msvc.exe'),
      sqliteAddon: join(binariesDir, 'better-sqlite3-win32-x64.node'),
    }
  }
  if (process.platform === 'darwin') {
    return {
      sidecar: join(binariesDir, 'jeweltrackerpro-api-aarch64-apple-darwin'),
      sqliteAddon: join(binariesDir, 'better-sqlite3-darwin-arm64.node'),
    }
  }
  console.error('tauri:dev is only set up for Windows and Apple Silicon macOS.')
  process.exit(1)
}

function runScript(name) {
  const result = spawnSync(process.execPath, [join(root, 'scripts', name)], {
    cwd: root,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

mkdirSync(join(resources, 'dist'), { recursive: true })
if (existsSync(migrationsSrc)) {
  mkdirSync(join(resources, 'migrations'), { recursive: true })
  cpSync(migrationsSrc, join(resources, 'migrations'), { recursive: true })
}
if (!existsSync(join(resources, 'package.json'))) {
  cpSync(join(root, 'package.json'), join(resources, 'package.json'))
}

const { sidecar, sqliteAddon } = sidecarPaths()
if (!existsSync(sidecar) || !existsSync(sqliteAddon)) {
  console.log('API sidecar is missing. Packaging it for tauri:dev...')
  runScript('build-sidecar.mjs')
  runScript('package-sidecar.mjs')
  runScript('verify-sidecar.mjs')
}
