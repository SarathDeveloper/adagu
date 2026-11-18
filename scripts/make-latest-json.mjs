// Writes latest.json, the file installed apps poll for updates, from the signed
// bundles the release jobs produced.
//
// Usage: node scripts/make-latest-json.mjs <assets dir> <repo owner/name> <tag>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [dir, repo, tag] = process.argv.slice(2)
if (!dir || !repo || !tag) {
  console.error('Usage: node scripts/make-latest-json.mjs <assets dir> <owner/name> <tag>')
  process.exit(1)
}

const files = readdirSync(dir)
const base = `https://github.com/${repo}/releases/download/${tag}`

/** Updater bundle for a platform, with the signature Tauri wrote beside it. */
function entry(match) {
  const bundle = files.find((name) => match.test(name) && !name.endsWith('.sig'))
  if (!bundle) return null
  const sig = `${bundle}.sig`
  if (!files.includes(sig)) {
    console.error(`${bundle} has no ${sig}; was TAURI_SIGNING_PRIVATE_KEY set for that build?`)
    process.exit(1)
  }
  return {
    signature: readFileSync(join(dir, sig), 'utf8').trim(),
    url: `${base}/${encodeURIComponent(bundle)}`,
  }
}

const platforms = {}
const windows = entry(/_x64-setup\.exe$/)
if (windows) platforms['windows-x86_64'] = windows
const mac = entry(/\.app\.tar\.gz$/)
if (mac) platforms['darwin-aarch64'] = mac

if (Object.keys(platforms).length === 0) {
  console.error(`No signed updater bundles found in ${dir}`)
  process.exit(1)
}

const notes = process.env.RELEASE_NOTES?.trim() || `PawnDesk ${tag}`
const manifest = {
  version: tag.replace(/^v/, ''),
  notes,
  pub_date: new Date().toISOString(),
  platforms,
}
writeFileSync(join(dir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`latest.json written for ${Object.keys(platforms).join(', ')}`)
