#!/usr/bin/env node
/**
 * Internal link checker.
 *
 * Every href="/something" in the app must resolve to a real route. A broken
 * link on a public marketing page is the kind of thing nobody notices until a
 * customer does.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const APP = path.join(ROOT, 'app')

// ── Every route with a page ─────────────────────────────────────────────────
const routes = new Set(['/'])
;(function walk(dir, prefix = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    // Route groups like (marketing) do not appear in the URL.
    const seg = e.name.startsWith('(') && e.name.endsWith(')') ? '' : '/' + e.name
    const p = path.join(dir, e.name)
    if (fs.existsSync(path.join(p, 'page.tsx'))) routes.add(prefix + seg || '/')
    walk(p, prefix + seg)
  }
})(APP)

// ── Every internal link ─────────────────────────────────────────────────────
const files = []
;(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(e.name)) walk(p)
    } else if (/\.tsx$/.test(e.name)) files.push(p)
  }
})(ROOT)

let broken = 0
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/')
  const src = fs.readFileSync(f, 'utf8')

  for (const m of src.matchAll(/href[=:]\s*[{]?['"](\/[^'"#?${]*)/g)) {
    const link = m[1].replace(/\/$/, '') || '/'

    // Dynamic segments are template literals and are skipped by the regex.
    if (routes.has(link)) continue
    // API routes and static files are not pages.
    if (link.startsWith('/api/') || /\.\w+$/.test(link)) continue

    broken++
    console.log(`\n\x1b[31m✗ broken link\x1b[0m  ${rel}`)
    console.log(`     ${link}`)
  }
}

if (broken === 0) {
  console.log(`\n\x1b[32mAll internal links resolve — ${routes.size} routes\x1b[0m`)
  process.exit(0)
}
console.log(`\n\x1b[31m${broken} broken link(s)\x1b[0m`)
process.exit(1)
