#!/usr/bin/env node
/**
 * Dependency guard.
 *
 *   npm run check:deps
 *
 * Two failures this catches, both of which actually happened:
 *
 *   1. `package.json` silently reverting to `next@^9.3.3`. Next 9 predates the
 *      App Router by six majors, so nothing in app/ can compile — but the
 *      error you get is a peer-dependency conflict about React, which sends
 *      you looking in the wrong place entirely.
 *
 *   2. A stale `package-lock.json` pinning the old versions, so a corrected
 *      package.json is ignored and npm installs Next 9 anyway.
 *
 * Also flags dependencies nothing imports. Every unused package is install
 * time, bundle weight, and audit noise for no benefit.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const pkg = require(path.join(ROOT, 'package.json'))

let problems = 0
const fail = (title, detail) => {
  problems++
  console.log(`\n\x1b[31m✗ ${title}\x1b[0m`)
  console.log(`     ${detail}`)
}

// ── Minimum major versions ──────────────────────────────────────────────────
// Anything below these cannot build this codebase.
const MINIMUM = {
  next: 15,     // App Router, async params, React 19
  react: 19,
  'react-dom': 19,
  typescript: 5,
}

for (const [name, min] of Object.entries(MINIMUM)) {
  const range = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]
  if (!range) { fail(`${name} is missing`, 'It is required to build.'); continue }

  const major = Number(String(range).replace(/^[^\d]*/, '').split('.')[0])
  if (!Number.isFinite(major) || major < min) {
    fail(
      `${name} is pinned to ${range}`,
      `Needs ${min}.x or later. If this reverted on its own, something ran\n` +
      `     \`npm audit fix --force\` — it rewrites package.json and will happily\n` +
      `     downgrade you six major versions to resolve a peer conflict.`
    )
  }
}

// ── Stale lockfile ──────────────────────────────────────────────────────────
const lockPath = path.join(ROOT, 'package-lock.json')
if (fs.existsSync(lockPath)) {
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
    const locked = lock.packages?.['node_modules/next']?.version
    if (locked) {
      const lockedMajor = Number(locked.split('.')[0])
      if (lockedMajor < MINIMUM.next) {
        fail(
          `package-lock.json pins next@${locked}`,
          'The lockfile wins over package.json. Delete it and node_modules,\n' +
          '     then reinstall:\n' +
          '       rm -rf node_modules package-lock.json && npm install'
        )
      }
    }
  } catch {
    // A malformed lockfile is npm's problem to report, not ours.
  }
}

// ── Security overrides ──────────────────────────────────────────────────────
// Next.js hard-pins `postcss: 8.4.31` and carries `sharp` as an optional
// dependency. Both currently have advisories, and no released Next version
// fixes them — the advisory covers every version from 9.3.4 to 16.3.
//
// `npm audit fix --force` "resolves" this by offering to install next@9.3.3,
// which is not a fix: it is a six-major downgrade to a version that predates
// the dependency. Taking that advice is what broke this project once already.
//
// The real fix is an override forcing patched versions inside Next's tree.
// If these disappear, the vulnerabilities come back silently.
const REQUIRED_OVERRIDES = {
  postcss: 8.5,   // >= 8.5.18 — XSS + path traversal in source-map loading
  sharp: 0.35,    // >= 0.35.0 — inherited libvips CVEs
}

for (const [name, minMinor] of Object.entries(REQUIRED_OVERRIDES)) {
  const range = pkg.overrides?.[name]
  if (!range) {
    fail(
      `missing override for ${name}`,
      `Next.js pulls in a vulnerable ${name}. Add to package.json:\n` +
      `       "overrides": { "${name}": "^${minMinor}.x" }\n` +
      `     Do NOT run \`npm audit fix --force\` — it offers next@9.3.3 instead.`
    )
    continue
  }
  const [maj, min] = String(range).replace(/^[^\d]*/, '').split('.').map(Number)
  const got = Number(`${maj}.${min}`)
  if (!Number.isFinite(got) || got < minMinor) {
    fail(`override ${name} is ${range}`, `Needs at least ${minMinor}.x`)
  }
}

// ── Unused dependencies ─────────────────────────────────────────────────────
let src = ''
for (const dir of ['app', 'components', 'lib', 'scripts', 'types']) {
  const full = path.join(ROOT, dir)
  if (!fs.existsSync(full)) continue
  ;(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) src += fs.readFileSync(p, 'utf8')
    }
  })(full)
}
for (const f of ['next.config.ts', 'tailwind.config.ts', 'postcss.config.js']) {
  const p = path.join(ROOT, f)
  if (fs.existsSync(p)) src += fs.readFileSync(p, 'utf8')
}

// Pulled in by the framework or the toolchain rather than by an import.
const IMPLICIT = new Set(['react-dom', 'next', 'typescript', 'tailwindcss',
                          'postcss', 'autoprefixer', 'eslint', 'eslint-config-next'])

const unused = []
for (const name of Object.keys(pkg.dependencies ?? {})) {
  if (IMPLICIT.has(name)) continue
  const esc = name.replace(/[/@]/g, '\\$&')
  const re = new RegExp(`from ['"]${esc}|import\\(['"]${esc}|require\\(['"]${esc}`)
  if (!re.test(src)) unused.push(name)
}

if (unused.length) {
  console.log(`\n\x1b[33m⚠ nothing imports:\x1b[0m ${unused.join(', ')}`)
  console.log('     Not an error — but each one is install time, bundle weight')
  console.log('     and audit noise. Remove them unless they are intentional.')
}

if (problems === 0) {
  const n = Object.keys(pkg.dependencies ?? {}).length
  console.log(`\n\x1b[32mDependencies look right — ${n} runtime packages\x1b[0m`)
  process.exit(0)
}

console.log(`\n\x1b[31m${problems} problem(s)\x1b[0m`)
process.exit(1)
