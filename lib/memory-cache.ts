/**
 * Small per-tab cache for repeatable, read-only lookups.
 *
 * Financial totals are intentionally excluded: a stale balance after a write
 * is more dangerous than another query. This cache is for type-ahead search
 * and suggestions, where users commonly repeat the same prefix several times.
 */
interface Entry<T> {
  expiresAt: number
  promise: Promise<T>
}

const entries = new Map<string, Entry<unknown>>()
const MAX_ENTRIES = 120

export async function memoryCached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>
): Promise<T> {
  const now = Date.now()
  const existing = entries.get(key) as Entry<T> | undefined
  if (existing && existing.expiresAt > now) return existing.promise

  const promise = load().catch(error => {
    entries.delete(key)
    throw error
  })
  entries.set(key, { expiresAt: now + ttlMs, promise })

  if (entries.size > MAX_ENTRIES) {
    for (const [candidate, entry] of entries) {
      if (entry.expiresAt <= now || entries.size > MAX_ENTRIES) entries.delete(candidate)
      if (entries.size <= MAX_ENTRIES) break
    }
  }

  return promise
}

export function clearMemoryCache(prefix?: string): void {
  if (!prefix) { entries.clear(); return }
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key)
  }
}

