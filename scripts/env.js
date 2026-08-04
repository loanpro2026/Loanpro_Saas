#!/usr/bin/env node
/**
 * Environment check.
 *
 *   npm run check:env          # checks .env.local
 *
 * Catches the mistakes that cost a deploy cycle to discover:
 *   • a required variable missing entirely
 *   • the SERVICE ROLE key pasted where the ANON key belongs (they look
 *     almost identical, and the mistake hands every visitor full database
 *     access with row-level security bypassed)
 *   • a service-role key exposed through a NEXT_PUBLIC_ variable
 *   • placeholder values from .env.example left in
 *   • an app URL with a trailing slash or a missing scheme
 *
 * It never prints a secret — only whether one is present and shaped right.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const envPath = path.join(ROOT, process.argv[2] || '.env.local')

if (!fs.existsSync(envPath)) {
  console.log(`\n\x1b[31m✗ ${path.basename(envPath)} not found\x1b[0m`)
  console.log('     Copy .env.example to .env.local and fill it in.')
  process.exit(1)
}

// Minimal .env parser — good enough, and avoids a dependency.
const env = {}
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i < 0) continue
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}

let problems = 0
let warnings = 0
const fail = (msg, detail) => {
  problems++
  console.log(`\n\x1b[31m✗ ${msg}\x1b[0m`)
  if (detail) console.log(`     ${detail}`)
}
const warn = (msg, detail) => {
  warnings++
  console.log(`\n\x1b[33m⚠ ${msg}\x1b[0m`)
  if (detail) console.log(`     ${detail}`)
}
const ok = msg => console.log(`  \x1b[32m✓\x1b[0m ${msg}`)

const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_CONTACT_EMAIL',
]

const PLACEHOLDERS = [
  'your-', 'yourdomain', 'xxxx', 'BNxxxx', 'rzp_live_xxx', 'changeme', 'TODO',
]

console.log(`\nChecking ${path.basename(envPath)}\n`)

for (const key of REQUIRED) {
  const v = env[key]
  if (!v) { fail(`${key} is missing`); continue }
  if (PLACEHOLDERS.some(p => v.toLowerCase().includes(p.toLowerCase()))) {
    fail(`${key} still has the placeholder from .env.example`, `value starts "${v.slice(0, 14)}…"`)
    continue
  }
  ok(key)
}

// ── Supabase JWTs decode, so we can tell the two keys apart ────────────────
function jwtRole(token) {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString('utf8')
    )
    return payload.role
  } catch { return null }
}

const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = env.SUPABASE_SERVICE_ROLE_KEY

if (anon && service) {
  const anonRole = jwtRole(anon)
  const serviceRole = jwtRole(service)

  // The single most dangerous configuration mistake available here.
  if (anonRole === 'service_role') {
    fail(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY contains the SERVICE ROLE key',
      'This key ships to every browser and bypasses row-level security entirely.\n' +
      '     Any visitor could read and write every shop\'s records.\n' +
      '     Swap the two values, and rotate the service role key — it has been\n' +
      '     in a client bundle.'
    )
  } else if (anonRole === 'anon') {
    ok('anon key really is the anon role')
  }

  if (serviceRole === 'anon') {
    fail(
      'SUPABASE_SERVICE_ROLE_KEY contains the ANON key',
      'Server-side writes that must bypass RLS will fail — tenant provisioning,\n' +
      '     the camera relay, the enquiries table.'
    )
  } else if (serviceRole === 'service_role') {
    ok('service role key really is the service role')
  }

  if (anon === service) {
    fail('anon and service role keys are identical', 'One of them is pasted in the wrong place.')
  }
}

// ── Nothing secret may be NEXT_PUBLIC_ ─────────────────────────────────────
for (const [key, value] of Object.entries(env)) {
  if (!key.startsWith('NEXT_PUBLIC_')) continue
  if (jwtRole(value) === 'service_role') {
    fail(`${key} exposes a service role key to the browser`, 'Rotate it immediately.')
  }
  if (/^(sk_|rzp_.*secret|-----BEGIN)/i.test(value)) {
    fail(`${key} looks like a secret`, 'NEXT_PUBLIC_ values are embedded in the client bundle.')
  }
}
if (env.R2_SECRET_ACCESS_KEY && Object.keys(env).some(
  k => k.startsWith('NEXT_PUBLIC_') && env[k] === env.R2_SECRET_ACCESS_KEY
)) {
  fail('the R2 secret is also in a NEXT_PUBLIC_ variable', 'Rotate the R2 token.')
}

// ── URL shape ──────────────────────────────────────────────────────────────
const url = env.NEXT_PUBLIC_APP_URL
if (url) {
  if (!/^https?:\/\//.test(url)) {
    fail('NEXT_PUBLIC_APP_URL has no scheme', `Use https://… — got "${url}"`)
  } else if (url.endsWith('/')) {
    warn('NEXT_PUBLIC_APP_URL ends with a slash',
         'Links are built by concatenation, so you will get double slashes.')
  } else if (url.includes('localhost') || url.includes('127.0.0.1')) {
    warn('NEXT_PUBLIC_APP_URL points at localhost',
         'Fine locally. In Vercel this must be the real domain or staff\n' +
         '     invitation links will point at the invitee\'s own machine.')
  } else {
    ok('NEXT_PUBLIC_APP_URL looks right')
  }
}

const supaUrl = env.NEXT_PUBLIC_SUPABASE_URL
if (supaUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(supaUrl.replace(/\/$/, ''))) {
  warn('NEXT_PUBLIC_SUPABASE_URL is an unusual shape',
       'Expected https://<ref>.supabase.co')
}

// â”€â”€ Optional Cloud Run mobile capture: both values or neither â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const mobileCaptureUrl = env.MOBILE_CAPTURE_API_BASE_URL
const mobileCaptureKey = env.MOBILE_CAPTURE_API_KEY
if (Boolean(mobileCaptureUrl) !== Boolean(mobileCaptureKey)) {
  fail(
    'Cloud Run mobile capture is only partly configured',
    `Missing: ${mobileCaptureUrl ? 'MOBILE_CAPTURE_API_KEY' : 'MOBILE_CAPTURE_API_BASE_URL'}`
  )
} else if (mobileCaptureUrl && mobileCaptureKey) {
  if (!/^https:\/\//.test(mobileCaptureUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(mobileCaptureUrl)) {
    fail('MOBILE_CAPTURE_API_BASE_URL must use HTTPS', 'Only localhost may use HTTP during development.')
  } else if (mobileCaptureUrl.endsWith('/')) {
    warn('MOBILE_CAPTURE_API_BASE_URL ends with a slash', 'Remove it; server routes append their own paths.')
  } else {
    ok('Cloud Run mobile capture configured')
  }
}

// ── Razorpay: all four together, or none ───────────────────────────────────
const rzp = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
             'NEXT_PUBLIC_RAZORPAY_KEY_ID', 'RAZORPAY_WEBHOOK_SECRET']
const rzpSet = rzp.filter(k => env[k])
if (rzpSet.length > 0 && rzpSet.length < 4) {
  warn(`Razorpay is partly configured (${rzpSet.length} of 4)`,
       `Missing: ${rzp.filter(k => !env[k]).join(', ')}\n` +
       '     Leave all four blank until you take payments — plans are set by\n' +
       '     hand in the Supabase dashboard meanwhile.')
} else if (rzpSet.length === 4) {
  if (env.RAZORPAY_KEY_ID !== env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
    fail('RAZORPAY_KEY_ID and NEXT_PUBLIC_RAZORPAY_KEY_ID differ',
         'They are the same value — the public one just needs to reach the browser.')
  }
  if (env.RAZORPAY_KEY_ID?.startsWith('rzp_test_')) {
    warn('Razorpay is in TEST mode', 'Real payments will not be taken.')
  }
  ok('Razorpay configured')
}

// ── Migration vars must never be in a deployed environment ─────────────────
const migrate = Object.keys(env).filter(k => k.startsWith('MIGRATE_MYSQL_'))
if (migrate.length && process.env.VERCEL) {
  fail('MIGRATE_MYSQL_* are set in a deployed environment',
       'These belong only on your own machine.')
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log()
if (problems === 0 && warnings === 0) {
  console.log('\x1b[32mEnvironment looks good.\x1b[0m')
  process.exit(0)
}
if (problems === 0) {
  console.log(`\x1b[33m${warnings} warning(s), nothing blocking.\x1b[0m`)
  process.exit(0)
}
console.log(`\x1b[31m${problems} problem(s)${warnings ? `, ${warnings} warning(s)` : ''}\x1b[0m`)
process.exit(1)
