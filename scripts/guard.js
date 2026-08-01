#!/usr/bin/env node
/**
 * Repository guards — patterns that have caused real bugs here.
 *
 *   npm run check:guard
 *
 * There is an ESLint rule for the date one too, but this runs without
 * installing anything and without a Next.js toolchain, so it works in CI, in a
 * git hook, and on a machine where `npm install` has not finished. Each guard
 * exists because the bug it catches actually happened.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

const GUARDS = [
  {
    id: 'utc-date',
    // Appeared in five independent places written at different times: the
    // migration script, the dashboard, the cash page, the deposits page and
    // the new-loan form.
    pattern: /new Date\(\)\s*\.toISOString\(\)\s*\.(split|slice)\s*\(/,
    message:
      "UTC date. `new Date().toISOString().split('T')[0]` returns TOMORROW for a\n" +
      '     shop in India between 18:30 and midnight UTC — an evening entry gets filed\n' +
      '     against the wrong day and disappears from that day\'s report.\n' +
      '     Use todayIST() from @/lib/utils.',
    allow: ['lib/utils.ts'],
  },
  {
    id: 'public-storage-url',
    // Customer identity photos must never have a permanent public URL. The
    // original scaffold used getPublicUrl() for exactly this.
    pattern: /getPublicUrl\s*\(/,
    message:
      'Public storage URL. Customer photos are identity documents and the R2\n' +
      '     bucket is private. Serve them through /api/photos/:loanId, which authorises\n' +
      '     the request and then issues a 5-minute presigned URL.',
    allow: [],
  },
  {
    id: 'client-tenant-insert',
    // tenant_id must come from the session (get_tenant_id() in Postgres), never
    // from a value the client chose. /api/auth/register originally took it from
    // the request body.
    pattern: /\.from\(\s*['"](loans|deposits|cash_transactions)['"]\s*\)\s*\n?\s*\.insert\(/,
    message:
      'Direct insert into a money table. These go through the Postgres functions\n' +
      '     (create_loan, add_deposit, record_cash_transaction) so that tenant_id comes\n' +
      '     from the session and daily_cash_summary is re-chained in the same transaction.',
    allow: ['scripts/'],
  },
]

// ── .gitignore must cover the dangerous patterns ────────────────────────────
// A sibling repo in this project shipped `.env.backup` to a public GitHub repo
// because its .gitignore listed `.env`, `.env.local` and `.env.production`
// individually — and `.env.backup` matched none of them. It contained a Mongo
// connection string, a GitHub token and an FCM private key.
//
// Enumerate nothing. Use `.env*` and un-ignore the example.
{
  const gi = path.join(ROOT, '.gitignore')

  if (!fs.existsSync(gi)) {
    console.log('\n\x1b[31m✗ no .gitignore\x1b[0m')
    console.log('     `git add .` would commit node_modules and any .env file present.')
    process.exit(1)
  }

  const rules = fs.readFileSync(gi, 'utf8')
    .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))

  const REQUIRED = [
    // Must be a WILDCARD. A bare `.env` line does not match `.env.backup`,
    // `.env.old` or `.env.prod` — which is precisely how the sibling repo
    // published its Mongo URI.
    { pattern: /^\.env\*$|^\.env\.\*$/, what: '.env* (with the wildcard)',
      why: 'holds the Supabase service role key, which bypasses row-level security entirely' },
    { pattern: /^node_modules\/?$/, what: 'node_modules/',
      why: 'thousands of files, and it is reinstallable' },
    { pattern: /^\/?\.next\/?$/, what: '.next/',
      why: 'build output' },
    { pattern: /migration-issues/, what: 'migration-issues-*.csv',
      why: 'the migration script writes real customer names and loan numbers to it' },
  ]

  let missing = 0
  for (const r of REQUIRED) {
    if (!rules.some(line => r.pattern.test(line))) {
      missing++
      console.log(`\n\x1b[31m✗ .gitignore does not cover ${r.what}\x1b[0m`)
      console.log(`     ${r.why}`)
    }
  }

  // Listing .env variants one by one is how the sibling repo leaked.
  const enumerated = rules.filter(l => /^\.env\./.test(l) && l !== '.env.example')
  if (enumerated.length && !rules.some(l => /^\.env\*?$|^\.env\.\*$/.test(l))) {
    missing++
    console.log('\n\x1b[31m✗ .gitignore enumerates .env variants\x1b[0m')
    console.log(`     Found: ${enumerated.join(', ')}`)
    console.log('     Anything you did not think of — .env.backup, .env.old, .env.prod —')
    console.log('     will be committed. Use `.env*` with `!.env.example` instead.')
  }

  if (missing) process.exit(1)
}

const files = []
;(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!['node_modules', '.next', '.git', 'supabase'].includes(e.name)) walk(p)
    } else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) {
      files.push(p)
    }
  }
})(ROOT)

let violations = 0

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  const lines = fs.readFileSync(file, 'utf8').split('\n')

  for (const guard of GUARDS) {
    if (guard.allow.some(a => rel === a || rel.startsWith(a))) continue
    // The guard definitions themselves contain the patterns.
    if (rel === 'scripts/guard.js') continue

    lines.forEach((line, i) => {
      // Skip comments — several files explain these bugs in prose.
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return

      if (guard.pattern.test(line)) {
        violations++
        console.log(`\n\x1b[31m✗ ${guard.id}\x1b[0m  ${rel}:${i + 1}`)
        console.log(`     ${trimmed.slice(0, 100)}`)
        console.log(`\x1b[2m     ${guard.message}\x1b[0m`)
      }
    })
  }
}

if (violations === 0) {
  console.log(`\n\x1b[32m${GUARDS.length} guards clean across ${files.length} files\x1b[0m`)
  process.exit(0)
}

console.log(`\n\x1b[31m${violations} violation(s)\x1b[0m`)
process.exit(1)
