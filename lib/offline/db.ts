/**
 * IndexedDB storage for offline operation.
 *
 * Two stores:
 *   • `loans`  — a read cache so the shop can look up a customer's record when
 *                the connection is down. This is the critical counter task:
 *                someone hands over a paper ticket and wants their gold back.
 *   • `queue`  — writes made while offline, replayed on reconnect.
 *
 * IndexedDB rather than localStorage because the queue holds money movements
 * and must survive a tab crash, a reload, and a phone running out of battery.
 * localStorage is synchronous, size-capped, and gets cleared more eagerly by
 * mobile browsers under memory pressure.
 */

const DB_NAME = 'loanpro-offline'
const DB_VERSION = 1
const STORE_LOANS = 'loans'
const STORE_QUEUE = 'queue'
const STORE_META = 'meta'

export type QueuedKind = 'deposit' | 'loan' | 'cash' | 'photo'

export interface QueuedWrite {
  /** Client-generated UUID. The database refuses to apply the same one twice. */
  key: string
  kind: QueuedKind
  payload: Record<string, unknown>
  /**
   * Image bytes for a queued photo capture.
   *
   * Stored as a Blob directly — IndexedDB handles binary natively, whereas
   * base64 would inflate a 250KB photo to 333KB and cost a decode on every
   * read of the queue.
   */
  blob?: Blob
  /** When the shop actually performed the action, not when it synced. */
  createdAt: number
  attempts: number
  lastError?: string
  /** Set once the server has confirmed; kept briefly so the UI can show it. */
  syncedAt?: number
}

export interface CachedLoan {
  id: number
  name: string
  father_name: string | null
  location: string | null
  amount: number
  interest: number | null
  category_type: string
  detailed_type: string | null
  weight: number | null
  issue_date: string
  status: string
  total_deposits: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'))
  }

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_LOANS)) {
        const s = db.createObjectStore(STORE_LOANS, { keyPath: 'id' })
        s.createIndex('name', 'name')
        s.createIndex('status', 'status')
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const s = db.createObjectStore(STORE_QUEUE, { keyPath: 'key' })
        s.createIndex('createdAt', 'createdAt')
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'k' })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  return dbPromise
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest
): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  }))
}

// ─── Loan cache ─────────────────────────────────────────────────────────────

export async function cacheLoans(loans: CachedLoan[]): Promise<void> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_LOANS, 'readwrite')
    const s = t.objectStore(STORE_LOANS)
    // Replace wholesale: a loan closed on another device must disappear here
    // too, and a stale "active" record at the counter is worse than none.
    s.clear()
    for (const l of loans) s.put(l)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

export async function getCachedLoans(): Promise<CachedLoan[]> {
  try {
    return await tx<CachedLoan[]>(STORE_LOANS, 'readonly', s => s.getAll())
  } catch {
    return []
  }
}

export async function findCachedLoan(id: number): Promise<CachedLoan | null> {
  try {
    return (await tx<CachedLoan>(STORE_LOANS, 'readonly', s => s.get(id))) ?? null
  } catch {
    return null
  }
}

/**
 * Offline search over the cache. Deliberately simple — substring matching on
 * the fields a shop actually searches by, plus exact loan number, which is
 * what they use most because it is printed on the ticket.
 */
export async function searchCachedLoans(query: string, limit = 20): Promise<CachedLoan[]> {
  const q = query.trim().toLowerCase()
  if (q.length < 1) return []

  const all = await getCachedLoans()
  const asNumber = /^\d+$/.test(q) ? Number(q) : null

  const scored = all
    .map(l => {
      let score = 0
      if (asNumber !== null && l.id === asNumber) score = 100
      else if (l.name?.toLowerCase() === q) score = 90
      else if (l.name?.toLowerCase().startsWith(q)) score = 70
      else if (l.name?.toLowerCase().includes(q)) score = 50
      else if (l.father_name?.toLowerCase().includes(q)) score = 35
      else if (l.location?.toLowerCase().includes(q)) score = 25
      return { l, score }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || b.l.id - a.l.id)

  return scored.slice(0, limit).map(x => x.l)
}

// ─── Write queue ────────────────────────────────────────────────────────────

export async function enqueue(write: Omit<QueuedWrite, 'attempts'>): Promise<void> {
  await tx(STORE_QUEUE, 'readwrite', s => s.put({ ...write, attempts: 0 }))
}

/**
 * Roughly how much space the queue is using.
 *
 * Photos dominate this. A device that has been offline for a day with twenty
 * captures is holding ~5MB, which is fine — but a device offline for a week
 * is worth warning about before the browser evicts the origin's storage under
 * pressure and takes the pending writes with it.
 */
export async function queueBytes(): Promise<number> {
  const all = await getQueue()
  return all.reduce((sum, w) => sum + (w.blob?.size ?? 0) + 512, 0)
}

export async function getQueue(): Promise<QueuedWrite[]> {
  try {
    const all = await tx<QueuedWrite[]>(STORE_QUEUE, 'readonly', s => s.getAll())
    // Oldest first: a deposit taken at 10am should post before one at 3pm, so
    // the activity log reads in the order things actually happened.
    return all.sort((a, b) => a.createdAt - b.createdAt)
  } catch {
    return []
  }
}

export async function pendingCount(): Promise<number> {
  const q = await getQueue()
  return q.filter(w => !w.syncedAt).length
}

export async function markSynced(key: string): Promise<void> {
  const existing = await tx<QueuedWrite>(STORE_QUEUE, 'readonly', s => s.get(key))
  if (!existing) return
  await tx(STORE_QUEUE, 'readwrite', s => s.put({ ...existing, syncedAt: Date.now() }))
}

export async function markFailed(key: string, error: string): Promise<void> {
  const existing = await tx<QueuedWrite>(STORE_QUEUE, 'readonly', s => s.get(key))
  if (!existing) return
  await tx(STORE_QUEUE, 'readwrite', s => s.put({
    ...existing,
    attempts: existing.attempts + 1,
    lastError: error,
  }))
}

export async function dequeue(key: string): Promise<void> {
  await tx(STORE_QUEUE, 'readwrite', s => s.delete(key))
}

/** Clear entries confirmed more than an hour ago. Keeps the recent ones so the
 *  UI can still show "3 items synced" after a reconnect. */
export async function pruneSynced(olderThanMs = 3600_000): Promise<void> {
  const all = await getQueue()
  const cutoff = Date.now() - olderThanMs
  for (const w of all) {
    if (w.syncedAt && w.syncedAt < cutoff) await dequeue(w.key)
  }
}

// ─── Metadata ───────────────────────────────────────────────────────────────

export async function setMeta(k: string, v: unknown): Promise<void> {
  await tx(STORE_META, 'readwrite', s => s.put({ k, v }))
}

export async function getMeta<T>(k: string): Promise<T | null> {
  try {
    const row = await tx<{ k: string; v: T }>(STORE_META, 'readonly', s => s.get(k))
    return row?.v ?? null
  } catch {
    return null
  }
}

/** Wipe everything. Called on sign-out — a shared or lost device must not keep
 *  a shop's customer records. */
export async function clearAll(): Promise<void> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction([STORE_LOANS, STORE_QUEUE, STORE_META], 'readwrite')
    t.objectStore(STORE_LOANS).clear()
    t.objectStore(STORE_QUEUE).clear()
    t.objectStore(STORE_META).clear()
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}
