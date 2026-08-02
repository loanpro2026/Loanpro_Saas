/**
 * LoanPro service worker.
 *
 * Handles:
 *   1. App-shell caching, so a hard reload with no connection still loads
 *   2. Web Push notifications (camera capture requests)
 *   3. Background sync trigger for the offline write queue
 *
 * Bump CACHE_VERSION on any change here — the activate handler deletes every
 * cache that does not match, which is how a stale shell gets evicted after a
 * deploy. Without that, a shop can be stuck on a months-old bundle.
 */

const CACHE_VERSION = 'v3'
const SHELL_CACHE = `loanpro-shell-${CACHE_VERSION}`
const ASSET_CACHE = `loanpro-assets-${CACHE_VERSION}`
const PAGE_CACHE = `loanpro-pages-${CACHE_VERSION}`

/** Fetched at install so they are available even on a first offline load. */
const SHELL_URLS = [
  '/offline',
  '/manifest.json',
  '/icons/icon-192.png',
]


// ─── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // Individually, so one 404 does not fail the whole install and leave the
      // worker permanently un-activated.
      .then(cache => Promise.allSettled(SHELL_URLS.map(u => cache.add(u))))
      .then(() => self.skipWaiting())
  )
})

// ─── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const keep = [SHELL_CACHE, ASSET_CACHE, PAGE_CACHE]
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// ─── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only GET is cacheable. A POST must never be served from cache — that would
  // mean replaying a write.
  if (request.method !== 'GET') return

  let url
  try { url = new URL(request.url) } catch { return }

  // Cross-origin: Supabase, R2, Razorpay. Leave them alone — they are
  // authenticated, short-lived, or both.
  if (url.origin !== self.location.origin) return

  // Our own API routes always go to the network. Serving a cached
  // /api/photos/:id would hand back an expired presigned URL, and a cached
  // report would be quietly wrong.
  if (url.pathname.startsWith('/api/')) return

  // Immutable build output — cache first, it never changes for a given URL.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
    return
  }

  // Other static assets.
  if (['image', 'script', 'style', 'font'].includes(request.destination)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
    return
  }

  // Navigations — network first, then cache, then the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request))
    return
  }
})

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch (err) {
    // An asset miss with no network is unrecoverable; let it fail rather than
    // returning a bogus 200 the page might try to execute.
    throw err
  }
}

/**
 * Slow is not the same as offline.
 *
 * This used to race the fetch against a 3s timer and, on timeout, fall through
 * to the offline page. That is wrong for this app in a way that showed up as a
 * bug people actually hit: leave the app idle, come back, and every navigation
 * lands on "No internet" despite a perfectly good connection.
 *
 * The reason it was reliable rather than occasional: after a few idle minutes
 * the Vercel function has scaled to zero and the Supabase connection is cold,
 * and every page under (app) does real work before it can respond — the
 * middleware calls getUser(), the layout calls getUser() again plus a users
 * select plus my_settings, and the dashboard fires seven more RPCs. A cold
 * first request through that chain is routinely over three seconds. It then
 * failed twice over: the timeout fired, so the `cache.put` on the success path
 * never ran, so the page was never in PAGE_CACHE either, so the fallback went
 * all the way to /offline. Every single time.
 *
 * The 3s timer also could not abort the request it abandoned — which is why
 * going back to the domain and signing in appeared to fix it. It did not fix
 * anything; the abandoned request had warmed the function, so the next attempt
 * came back under the limit.
 *
 * So: no timer. Serve the cache only when the network genuinely fails, or when
 * the OS says there is no network at all. A slow page is a slow page, and the
 * browser keeps the previous page on screen while it waits — nobody is staring
 * at a white screen, which was the original worry.
 */
async function navigationHandler(request) {
  // `navigator.onLine === false` is trustworthy: the OS is saying there is no
  // usable interface. `true` is NOT a promise of reachability (a captive wifi
  // portal reports true), which is why it is only used in this direction —
  // to skip a fetch that cannot possibly succeed rather than to conclude one
  // will.
  if (self.navigator && self.navigator.onLine === false) {
    return offlineFallback(request)
  }

  try {
    const response = await fetch(request)

    // Only cache real pages. Caching a 500 means serving that error until the
    // next successful load; caching a redirect is worse still, because a
    // redirected response replayed for a navigation throws in the browser
    // rather than rendering anything at all.
    if (response.ok && !response.redirected) {
      const cache = await caches.open(PAGE_CACHE)
      // Never let a cache write break the response the shop is waiting on.
      cache.put(request, response.clone()).catch(() => {})
    }
    return response
  } catch {
    // A real failure: DNS, refused connection, the browser's own timeout.
    return offlineFallback(request)
  }
}

async function offlineFallback(request) {
  const cached = await caches.match(request, { ignoreSearch: true })
  if (cached) return cached

  const fallback = await caches.match('/offline')
  if (fallback) return fallback

  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
    '<body style="font-family:system-ui;padding:2rem;text-align:center">' +
    '<h1>No internet</h1><p>Reconnect and try again. Anything you saved on ' +
    'this device is still there and will sync automatically.</p>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

// ─── Background sync ────────────────────────────────────────────────────────
// Asks any open tab to drain the queue. The queue itself lives in the page,
// not here, because it needs the Supabase session — a service worker has no
// access to the auth cookies the client library uses.
self.addEventListener('sync', (event) => {
  if (event.tag !== 'loanpro-sync') return
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => clients.forEach(c => c.postMessage({ type: 'sync-queue' })))
  )
})

// ─── Push ───────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'LoanPro', body: event.data.text() }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'LoanPro', {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      data: payload.data || {},
      tag: payload.tag || 'loanpro',
      renotify: true,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const key = event.notification.data?.session_key
  const target = key ? `/camera?key=${encodeURIComponent(key)}` : '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        // Reuse an open tab rather than piling up windows on a shop's counter
        // machine that never gets closed.
        for (const c of clients) {
          if (c.url.includes(target) && 'focus' in c) return c.focus()
        }
        return self.clients.openWindow(target)
      })
  )
})
