// Refuses a release build that shops could not update from, before the long
// build starts: versions out of step, no updater key, or no signing key.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(root, path), 'utf8')

const problems = []
const pkg = JSON.parse(read('package.json'))
const conf = JSON.parse(read('src-tauri/tauri.conf.json'))
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(read('src-tauri/Cargo.toml'))?.[1]

if (pkg.version !== conf.version || pkg.version !== cargoVersion) {
  problems.push(
    `Versions differ: package.json ${pkg.version}, tauri.conf.json ${conf.version}, Cargo.toml ${cargoVersion}. Set all three to the release version.`,
  )
}

const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : process.env.RELEASE_TAG
if (tag && tag !== `v${pkg.version}`) {
  problems.push(`Tag ${tag} does not match version ${pkg.version} (expected v${pkg.version}).`)
}

if (!conf.plugins?.updater?.pubkey?.trim()) {
  problems.push(
    'plugins.updater.pubkey in src-tauri/tauri.conf.json is empty. Generate a key with `npx tauri signer generate -w <path outside the repo>` and paste the .pub contents there.',
  )
}

if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
  problems.push('TAURI_SIGNING_PRIVATE_KEY is not set, so the update files cannot be signed.')
}

if (problems.length) {
  console.error(`Release check failed:\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log(`Release check passed for v${pkg.version}`)
