/**
 * Tests for the offline queue logic.
 *
 *   npm run test:offline
 *
 * This is the riskiest code in the app. A queue bug does not crash anything —
 * it quietly posts a customer's ₹5,000 deposit twice, or loses it. Both leave
 * the shop's books disagreeing with the cash in the drawer, and they find out
 * days later.
 *
 * The IndexedDB layer is modelled here with an in-memory map; what is being
 * tested is the ordering, retry and idempotency logic, not the browser API.
 */

// ── Mirror of isPermanent() from lib/offline/sync.ts ─────────────────────────
function isPermanent(message) {
  return /already closed|not found|cannot add a deposit to a closed loan|before the (issue date|loan was issued)|must be greater than zero|is required|photo data is missing|photo too large|unsupported image type|trial has ended|subscription is not active|limited to \d+ loans/i
    .test(message)
}

const MAX_ATTEMPTS = 8

// ── A stand-in server that enforces idempotency the way migration 010 does ───
function makeServer() {
  const applied = new Map()   // key → result
  const log = []
  return {
    applied, log,
    apply(key, kind, payload, { fail } = {}) {
      if (fail) throw new Error(fail)
      if (applied.has(key)) {
        return { ...applied.get(key), replayed: true }   // exactly-once
      }
      const row = { id: applied.size + 1, kind, ...payload }
      applied.set(key, row)
      log.push(row)
      return { ...row, replayed: false }
    },
  }
}

// ── The drain loop from syncQueue(), minus the browser bits ──────────────────
function drain(queue, server, { failWith } = {}) {
  const result = { synced: 0, failed: 0, errors: [] }

  for (const w of [...queue].sort((a, b) => a.createdAt - b.createdAt)) {
    if (w.syncedAt) continue
    try {
      server.apply(w.key, w.kind, w.payload, { fail: failWith?.(w) })
      w.syncedAt = Date.now()
      result.synced++
    } catch (e) {
      const msg = String(e.message)
      w.attempts++
      w.lastError = msg
      if (isPermanent(msg) || w.attempts >= MAX_ATTEMPTS) {
        w.dropped = true
        result.failed++
        result.errors.push({ key: w.key, kind: w.kind, message: msg })
      } else {
        break   // stop on transient failure; preserve order
      }
    }
  }
  return result
}

const q = (key, kind, payload, createdAt) =>
  ({ key, kind, payload, createdAt, attempts: 0 })

let fail = 0
const eq = (label, a, b) => {
  const A = JSON.stringify(a), B = JSON.stringify(b)
  if (A === B) console.log(`  ✓ ${label}`)
  else { fail++; console.log(`  ✗ ${label}: expected ${B}, got ${A}`) }
}
const section = n => console.log(`\n\x1b[1m${n}\x1b[0m`)

// ─────────────────────────────────────────────────────────────────────────────
section('Exactly-once: the thing that must never break')

{
  const server = makeServer()
  const queue = [q('k1', 'deposit', { loan_id: 4471, amount: 5000 }, 1000)]

  drain(queue, server)
  eq('first sync applies it', server.log.length, 1)

  // Response lost, tab reloaded, queue still holds it → replayed.
  queue[0].syncedAt = undefined
  drain(queue, server)
  eq('replay does NOT double-post', server.log.length, 1)

  // Two tabs draining at once.
  queue[0].syncedAt = undefined
  drain(queue, server)
  drain([q('k1', 'deposit', { loan_id: 4471, amount: 5000 }, 1000)], server)
  eq('concurrent drains still post once', server.log.length, 1)

  const total = server.log.reduce((s, r) => s + (r.amount ?? 0), 0)
  eq('the shop is credited ₹5,000 exactly once', total, 5000)
}

section('Distinct writes are not confused with replays')

{
  const server = makeServer()
  // Same customer pays the same amount twice in one day — a real scenario,
  // and it must produce two deposits, not one.
  const queue = [
    q('k1', 'deposit', { loan_id: 4471, amount: 5000 }, 1000),
    q('k2', 'deposit', { loan_id: 4471, amount: 5000 }, 2000),
  ]
  drain(queue, server)
  eq('identical amounts, different keys → two rows', server.log.length, 2)
  eq('total credited', server.log.reduce((s, r) => s + r.amount, 0), 10000)
}

// ─────────────────────────────────────────────────────────────────────────────
section('Ordering — cash is a running balance')

{
  const server = makeServer()
  const queue = [
    q('c3', 'cash', { type: 'remove', amount: 2000 }, 3000),   // 3pm
    q('c1', 'cash', { type: 'add', amount: 10000 }, 1000),     // 10am
    q('c2', 'cash', { type: 'add', amount: 500 }, 2000),       // noon
  ]
  drain(queue, server)

  eq('posted oldest first', server.log.map(r => r.amount), [10000, 500, 2000])

  // Replaying in queue order keeps the balance non-negative throughout.
  let bal = 0
  const dips = []
  for (const r of server.log) {
    bal += r.type === 'add' ? r.amount : -r.amount
    if (bal < 0) dips.push(bal)
  }
  eq('balance never goes negative', dips.length, 0)
  eq('final balance', bal, 8500)
}

// ─────────────────────────────────────────────────────────────────────────────
section('Transient failure — stop, keep order, retry later')

{
  const server = makeServer()
  const queue = [
    q('a', 'deposit', { loan_id: 1, amount: 100 }, 1000),
    q('b', 'deposit', { loan_id: 1, amount: 200 }, 2000),
    q('c', 'deposit', { loan_id: 1, amount: 300 }, 3000),
  ]

  // Network drops again after the first one.
  let r = drain(queue, server, { failWith: w => w.key !== 'a' ? 'fetch failed' : null })
  eq('one posted before the drop', r.synced, 1)
  eq('nothing dropped',            r.failed, 0)
  eq('stopped rather than skipping ahead', server.log.length, 1)
  eq('b recorded an attempt',      queue[1].attempts, 1)
  eq('c untouched — order preserved', queue[2].attempts, 0)

  // Connection returns.
  r = drain(queue, server)
  eq('remaining two post on retry', r.synced, 2)
  eq('all three landed, in order', server.log.map(x => x.amount), [100, 200, 300])
  eq('none duplicated', server.applied.size, 3)
}

// ─────────────────────────────────────────────────────────────────────────────
section('Permanent failure — surfaced, not retried forever')

{
  const server = makeServer()
  const queue = [
    q('x', 'deposit', { loan_id: 999, amount: 500 }, 1000),
    q('y', 'deposit', { loan_id: 1, amount: 700 }, 2000),
  ]

  const r = drain(queue, server, {
    failWith: w => w.key === 'x' ? 'Loan not found' : null,
  })

  eq('bad write dropped after one try', queue[0].attempts, 1)
  eq('marked dropped',                  queue[0].dropped, true)
  eq('reported to the user',            r.errors.length, 1)
  eq('error names the reason',          r.errors[0].message, 'Loan not found')
  eq('the good write still posted',     r.synced, 1)
  eq('queue did not stall on it',       server.log.length, 1)
}

section('Which errors are permanent')

eq('already closed',    isPermanent('Loan 4471 is already closed'), true)
eq('not found',         isPermanent('Loan not found'), true)
eq('deposit on closed', isPermanent('Cannot add a deposit to a closed loan'), true)
eq('date before issue', isPermanent('Deposit date cannot be before the loan was issued (2026-03-01)'), true)
eq('zero amount',       isPermanent('Deposit must be greater than zero'), true)

eq('network error is transient',  isPermanent('fetch failed'), false)
eq('timeout is transient',        isPermanent('Request timed out'), false)
eq('502 is transient',            isPermanent('Bad Gateway'), false)
eq('connection reset transient',  isPermanent('ECONNRESET'), false)

// Plan errors: retrying every 30s for a shop whose trial ended would never
// succeed and would bury the real message under noise.
eq('trial ended',       isPermanent('Your trial has ended. Subscribe to keep adding loans'), true)
eq('subscription off',  isPermanent('Your subscription is not active. Renew to keep adding'), true)
eq('loan cap reached',  isPermanent('This plan is limited to 100 loans. Upgrade to add more.'), true)
eq('photo too large',   isPermanent('Photo too large'), true)
eq('bad image type',    isPermanent('Unsupported image type'), true)

section('Photo queue')

{
  const server = makeServer()
  // A 250KB capture, which is what compressImage produces at 1600px/q0.8.
  const queue = [
    q('p1', 'photo', { loan_id: 4471 }, 1000),
    q('d1', 'deposit', { loan_id: 4471, amount: 5000 }, 2000),
  ]
  queue[0].blob = { size: 256_000 }

  const r = drain(queue, server)
  eq('photo and deposit both post', r.synced, 2)
  eq('photo went first (older)',    server.log[0].kind, 'photo')

  // Replaying a photo overwrites the same loan's image with identical bytes,
  // so it is naturally safe — but it must still not post twice.
  queue[0].syncedAt = undefined
  drain(queue, server)
  eq('replayed photo does not duplicate', server.log.filter(x => x.kind === 'photo').length, 1)
}

{
  const server = makeServer()
  const queue = [q('p2', 'photo', { loan_id: 1 }, 1000)]   // no blob attached
  const r = drain(queue, server, { failWith: () => 'Photo data is missing' })
  eq('a photo with no bytes is dropped, not retried', queue[0].dropped, true)
  eq('and reported',                                  r.errors.length, 1)
}

section('Offline new loan with its pledge photo')

{
  const server = makeServer()
  let photoUploads = 0

  const replayBundle = (failPhoto) => {
    // Mirrors applyOne('loan'): the RPC is idempotent and returns the same loan
    // row before the attached photo is attempted.
    const loan = server.apply('loan-with-photo', 'loan', { name: 'Ramesh' })
    if (failPhoto) throw new Error('fetch failed')
    photoUploads++
    return loan.id
  }

  try { replayBundle(true) } catch {}
  eq('loan lands before an interrupted photo upload', server.log.length, 1)

  const loanId = replayBundle(false)
  eq('retry reuses the same loan ID', loanId, server.log[0].id)
  eq('retry does not duplicate the loan', server.log.length, 1)
  eq('pledge photo is attached on retry', photoUploads, 1)
}

section('Queue size accounting')

{
  const writes = [
    { blob: { size: 256_000 } },
    { blob: { size: 240_000 } },
    { },                              // a deposit — no blob
  ]
  const bytes = writes.reduce((s, w) => s + (w.blob?.size ?? 0) + 512, 0)
  eq('roughly half a megabyte for two photos', Math.round(bytes / 1024), 486)
  // A day offline at twenty captures is ~5MB, which is fine. A week is worth
  // warning about before the browser evicts the origin under storage pressure.
  eq('twenty photos is about 5MB', Math.round((20 * 256_512) / 1024 / 1024), 5)
}

section('Retry ceiling')

{
  const server = makeServer()
  const queue = [q('z', 'deposit', { loan_id: 1, amount: 100 }, 1000)]

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    drain(queue, server, { failWith: () => 'fetch failed' })
  }
  eq(`gives up after ${MAX_ATTEMPTS} attempts`, queue[0].attempts, MAX_ATTEMPTS)
  eq('dropped rather than retried forever',      queue[0].dropped, true)
  eq('reason kept for the user', queue[0].lastError, 'fetch failed')
}

// ─────────────────────────────────────────────────────────────────────────────
section('Offline search ranking')

// Mirror of searchCachedLoans scoring
function score(l, q) {
  const asNumber = /^\d+$/.test(q) ? Number(q) : null
  if (asNumber !== null && l.id === asNumber) return 100
  if (l.name?.toLowerCase() === q) return 90
  if (l.name?.toLowerCase().startsWith(q)) return 70
  if (l.name?.toLowerCase().includes(q)) return 50
  if (l.father_name?.toLowerCase().includes(q)) return 35
  if (l.location?.toLowerCase().includes(q)) return 25
  return 0
}

const cache = [
  { id: 4471, name: 'Ramesh Kumar', father_name: 'Suresh', location: 'Rau' },
  { id: 12,   name: 'Suresh Patel', father_name: 'Ramesh', location: 'Mhow' },
  { id: 88,   name: 'Anita Devi',   father_name: 'Mohan',  location: 'Rau' },
]

const byTicket = cache.map(l => ({ l, s: score(l, '4471') }))
  .filter(x => x.s > 0).sort((a, b) => b.s - a.s)
eq('ticket number wins outright', byTicket[0].l.id, 4471)
eq('and is the only hit',         byTicket.length, 1)

const byName = cache.map(l => ({ l, s: score(l, 'ramesh') }))
  .filter(x => x.s > 0).sort((a, b) => b.s - a.s)
eq('name prefix beats father-name match', byName[0].l.id, 4471)
eq('father-name match still found',       byName.length, 2)

const byPlace = cache.map(l => ({ l, s: score(l, 'rau') }))
  .filter(x => x.s > 0)
eq('location matches both Rau loans', byPlace.length, 2)

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${fail} failure(s)\x1b[0m`)
process.exit(fail ? 1 : 0)
