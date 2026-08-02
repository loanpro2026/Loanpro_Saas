/**
 * Service worker navigation tests.
 *
 * These exist because of a bug that was invisible in the code and obvious in
 * use: leave the app idle for a few minutes, come back, and every navigation
 * landed on the "No internet" page despite a working connection.
 *
 * The cause was that the worker raced the fetch against a 3s timer and treated
 * losing that race as being offline. Every page under (app) does real work
 * before it can respond — middleware getUser(), layout getUser() plus a users
 * select plus my_settings, then the page's own queries — and after an idle
 * period the Vercel function is cold. Over three seconds routinely.
 *
 * The first case below is that exact scenario: a four-second response on a
 * healthy connection. It fails against the old worker and passes against the
 * current one. The rest pin down the behaviour that must NOT change while
 * fixing it — the offline page still has to appear when the shop really has no
 * internet, which is the whole reason the worker exists.
 *
 * Run: node scripts/lib/sw.test.mjs
 */
import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SW_PATH = path.join(HERE, '..', '..', 'public', 'sw.js')
const SRC = fs.readFileSync(SW_PATH, 'utf8')

// The cache version is read out of the worker rather than hard-coded, so
// bumping CACHE_VERSION (which every change to sw.js should do) does not
// silently turn these tests into no-ops against empty caches.
const VERSION = /const CACHE_VERSION = '([^']+)'/.exec(SRC)?.[1]
if (!VERSION) throw new Error('Could not read CACHE_VERSION out of sw.js')
const SHELL = `loanpro-shell-${VERSION}`
const PAGES = `loanpro-pages-${VERSION}`

// ─── Stubs ──────────────────────────────────────────────────────────────────
// Deliberately not permissive: cache.put rejects a redirected response and
// FakeCache.match is exact, the same as the real Cache API. A stub that
// accepts everything proves nothing.

function mkRes(body, { status = 200, redirected = false } = {}) {
  const r = new Response(body, { status })
  Object.defineProperty(r, 'redirected', { value: redirected })
  r.clone = () => mkRes(body, { status, redirected })
  return r
}

class FakeCache {
  constructor() { this.m = new Map() }
  async put(req, res) {
    if (res.redirected) throw new TypeError('redirected response cannot be cached')
    this.m.set(typeof req === 'string' ? req : req.url, res)
  }
  async add(u) { this.m.set(u, mkRes('shell ' + u)) }
  async match(req) { return this.m.get(typeof req === 'string' ? req : req.url) }
}

function makeEnv({ online, fetchImpl, seed = {} }) {
  const caches_ = {
    store: new Map(),
    async open(n) {
      if (!this.store.has(n)) this.store.set(n, new FakeCache())
      return this.store.get(n)
    },
    async keys() { return [...this.store.keys()] },
    async delete(n) { return this.store.delete(n) },
    async match(req) {
      const url = typeof req === 'string' ? req : req.url
      for (const c of this.store.values()) {
        const hit = await c.match(url)
        if (hit) return hit
      }
      return undefined
    },
  }
  for (const [name, entries] of Object.entries(seed)) {
    const c = new FakeCache()
    for (const [k, v] of Object.entries(entries)) c.m.set(k, mkRes(v))
    caches_.store.set(name, c)
  }

  const listeners = {}
  const self_ = {
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f) },
    location: new URL('https://app.example.com/sw.js'),
    navigator: { onLine: online },
    skipWaiting: async () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration: { showNotification: async () => {} },
    caches: caches_,
  }

  const ctx = vm.createContext({
    self: self_, caches: caches_, fetch: fetchImpl, Response, URL,
    setTimeout, clearTimeout, console, TypeError,
  })
  vm.runInContext(SRC, ctx)
  return { listeners, caches_ }
}

/** Drive one request through the worker's real fetch listener. */
async function go(env, url, { method = 'GET', mode = 'navigate', destination = 'document' } = {}) {
  let responded = null
  const event = {
    request: { url, method, mode, destination },
    respondWith: p => { responded = p },
  }
  for (const f of env.listeners.fetch) f(event)
  return responded ? await responded : null
}

// ─── Cases ──────────────────────────────────────────────────────────────────
const DASH = 'https://app.example.com/dashboard'
const OFFLINE_SEED = { [SHELL]: { '/offline': 'OFFLINE PAGE' } }
const results = []
const check = (name, pass, detail = '') => results.push({ name, pass, detail })

// 1 & 2 — the reported bug.
{
  const slow = () => new Promise(r => setTimeout(() => r(mkRes('<h1>Dashboard</h1>')), 4000))
  const env = makeEnv({ online: true, fetchImpl: slow, seed: OFFLINE_SEED })
  const body = await (await go(env, DASH)).text()
  check('a slow (4s) navigation on a healthy connection returns the REAL page',
    body.includes('Dashboard'), `got ${JSON.stringify(body)}`)
  // The old worker abandoned the request, so the success-path cache write never
  // ran and the page was never cached — which is why it failed every time
  // rather than once.
  check('...and that page is cached, so a later failure has something to serve',
    !!(await (await env.caches_.open(PAGES)).match(DASH)))
}

// 3 — the normal case.
{
  const env = makeEnv({ online: true, fetchImpl: async () => mkRes('<h1>Dashboard</h1>') })
  check('a fast navigation returns the real page',
    (await (await go(env, DASH)).text()).includes('Dashboard'))
}

// 4 & 5 — genuinely offline. This is what the worker is for and must still work.
{
  const env = makeEnv({
    online: false,
    fetchImpl: async () => { throw new Error('fetch must not be called when offline') },
    seed: { [PAGES]: { [DASH]: '<h1>Cached Dashboard</h1>' }, ...OFFLINE_SEED },
  })
  check('offline with the page cached -> serves the cached page',
    (await (await go(env, DASH)).text()).includes('Cached Dashboard'))
}
{
  const env = makeEnv({
    online: false,
    fetchImpl: async () => { throw new Error('fetch must not be called when offline') },
    seed: OFFLINE_SEED,
  })
  check('offline with nothing cached -> serves /offline',
    (await (await go(env, DASH)).text()).includes('OFFLINE PAGE'))
}

// 6 — navigator.onLine lies in the positive direction (captive wifi portals),
// so a real fetch failure must still reach the offline page.
{
  const env = makeEnv({
    online: true,
    fetchImpl: async () => { throw new TypeError('Failed to fetch') },
    seed: OFFLINE_SEED,
  })
  check('a real network failure still falls back to /offline',
    (await (await go(env, DASH)).text()).includes('OFFLINE PAGE'))
}

// 7 — a redirected response replayed for a navigation throws in the browser
// rather than rendering, so it must never enter the cache.
{
  const env = makeEnv({ online: true, fetchImpl: async () => mkRes('', { redirected: true }) })
  await go(env, DASH)
  check('a redirected response is NOT cached',
    !(await (await env.caches_.open(PAGES)).match(DASH)))
}

// 8 — caching a 500 means serving that error until the next successful load.
{
  const env = makeEnv({ online: true, fetchImpl: async () => mkRes('boom', { status: 500 }) })
  await go(env, DASH)
  check('a 500 is NOT cached',
    !(await (await env.caches_.open(PAGES)).match(DASH)))
}

// 9 — a cached POST would mean replaying a write.
{
  const env = makeEnv({ online: true, fetchImpl: async () => mkRes('x') })
  check('POST is never intercepted', (await go(env, DASH, { method: 'POST' })) === null)
}

// 10 & 11 — Supabase and our own API routes are authenticated or short-lived.
{
  const env = makeEnv({ online: false, fetchImpl: async () => mkRes('x') })
  check('cross-origin (Supabase, R2) is left alone',
    (await go(env, 'https://xyz.supabase.co/rest/v1/loans', { mode: 'cors', destination: 'empty' })) === null)
}
{
  const env = makeEnv({ online: false, fetchImpl: async () => mkRes('x') })
  check('/api/ is left alone even when offline',
    (await go(env, 'https://app.example.com/api/photos/upload-url', { mode: 'cors', destination: 'empty' })) === null)
}

let bad = 0
for (const r of results) {
  if (!r.pass) bad++
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${!r.pass && r.detail ? '  -- ' + r.detail : ''}`)
}
console.log(`\nservice worker: ${results.length - bad}/${results.length} passed`)
process.exit(bad ? 1 : 0)
