/**
 * Replaying queued writes when the connection comes back.
 *
 * The rules that matter:
 *
 *   1. **Every write carries a UUID.** The database refuses to apply the same
 *      key twice, so a retry after a lost response cannot double-post a
 *      deposit. This is the whole reason offline writes are safe at all.
 *
 *   2. **Order is preserved.** Oldest first, one at a time. Cash movements are
 *      a running balance; posting a 3pm withdrawal before a 10am deposit
 *      produces a briefly negative balance and an activity log that reads
 *      backwards.
 *
 *   3. **Permanent failures are not retried.** A deposit against a loan that
 *      someone closed on another device will never succeed. Retrying it every
 *      30 seconds forever just hides the problem — it gets surfaced instead.
 */
import { asObject, asArray, numberAt } from '@/lib/json'
import { createClient } from '@/lib/supabase/client'
import {
  getQueue, markSynced, markFailed, dequeue, pruneSynced,
  cacheLoans, setMeta, type QueuedWrite, type CachedLoan,
} from './db'

export interface SyncResult {
  synced: number
  failed: number
  remaining: number
  errors: Array<{ key: string; kind: string; message: string }>
}

/** Errors that will never succeed on retry, so the queue stops trying. */
function isPermanent(message: string): boolean {
  return /already closed|not found|cannot add a deposit to a closed loan|before the (issue date|loan was issued)|must be greater than zero|is required|photo data is missing|photo too large|unsupported image type|trial has ended|subscription is not active|limited to \d+ loans/i
    .test(message)
}

/** Give up after this many attempts even on a transient-looking error. */
const MAX_ATTEMPTS = 8

async function applyOne(write: QueuedWrite): Promise<void> {
  const supabase = createClient()
  const p = write.payload as any

  switch (write.kind) {
    case 'deposit': {
      const { error } = await supabase.rpc('add_deposit_idem', {
        p_loan_id: p.loan_id,
        p_amount: p.amount,
        p_date: p.date ?? null,
        p_key: write.key,
      })
      if (error) throw new Error(error.message)
      return
    }
    case 'loan': {
      const { error } = await supabase.rpc('create_loan_idem', {
        p_loan: p.loan,
        p_key: write.key,
      })
      if (error) throw new Error(error.message)
      return
    }
    case 'cash': {
      const { error } = await supabase.rpc('record_cash_idem', {
        p_type: p.type,
        p_amount: p.amount,
        p_reason: p.reason,
        p_date: p.date ?? null,
        p_key: write.key,
      })
      if (error) throw new Error(error.message)
      return
    }
    case 'photo': {
      if (!write.blob) throw new Error('Photo data is missing')

      // Same three-step handshake as an online upload — ask for a presigned
      // URL, PUT to R2, confirm. Replaying it simply overwrites the same loan's
      // photo with identical bytes, so no idempotency key is needed.
      const urlRes = await fetch('/api/photos/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loan_id: p.loan_id, content_type: 'image/jpeg' }),
      })
      if (!urlRes.ok) {
        throw new Error((await urlRes.json().catch(() => ({}))).error || 'Could not start upload')
      }
      const { key, uploadUrl } = await urlRes.json()

      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: write.blob,
      })
      if (!put.ok) throw new Error(`Upload failed (${put.status})`)

      const confirm = await fetch('/api/photos/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_id: p.loan_id, key,
          byte_size: write.blob.size, mime_type: 'image/jpeg',
        }),
      })
      if (!confirm.ok) {
        throw new Error((await confirm.json().catch(() => ({}))).error || 'Could not save photo')
      }
      return
    }
    default:
      throw new Error(`Unknown queued write: ${write.kind}`)
  }
}

let syncing = false

/**
 * Drain the queue. Safe to call often — concurrent calls are collapsed, since
 * the online event, a visibility change and a timer can all fire at once.
 */
export async function syncQueue(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, remaining: 0, errors: [] }

  if (syncing || typeof navigator === 'undefined' || !navigator.onLine) {
    result.remaining = (await getQueue()).filter(w => !w.syncedAt).length
    return result
  }

  syncing = true
  try {
    const queue = (await getQueue()).filter(w => !w.syncedAt)

    for (const write of queue) {
      try {
        await applyOne(write)
        await markSynced(write.key)
        result.synced++
      } catch (err: any) {
        const message = String(err?.message ?? err)

        if (isPermanent(message) || write.attempts + 1 >= MAX_ATTEMPTS) {
          // Drop it from the queue but keep the reason — the UI reports it so
          // the shop can re-enter it deliberately rather than silently losing
          // a payment a customer actually made.
          await markFailed(write.key, message)
          await dequeue(write.key)
          result.failed++
          result.errors.push({ key: write.key, kind: write.kind, message })
        } else {
          await markFailed(write.key, message)
          // Stop on the first transient failure. If the network dropped again,
          // hammering the rest of the queue just burns battery, and order must
          // be preserved anyway.
          break
        }
      }
    }

    await pruneSynced()
    result.remaining = (await getQueue()).filter(w => !w.syncedAt).length
    return result
  } finally {
    syncing = false
  }
}

/**
 * Refresh the offline loan cache. Called on load and after a successful sync,
 * so the counter always has a recent view even if the connection drops
 * seconds later.
 */
export async function refreshSnapshot(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.onLine) return false

  try {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('offline_snapshot', { p_limit: 2000 })
    if (error || !data) return false

    // `RETURNS jsonb`, so narrow before reading. A malformed or null snapshot
    // must not throw here — this runs in the background on reconnect, and an
    // exception would leave the queue unflushed with no visible cause.
    const snap = asObject(data)
    await cacheLoans(asArray(snap.loans) as unknown as CachedLoan[])
    await setMeta('snapshot_at', Date.now())
    await setMeta('cash_balance', numberAt(snap, 'cash_balance'))
    return true
  } catch {
    return false
  }
}

/**
 * Wire up automatic syncing. Returns a cleanup function.
 *
 * Three triggers, because none alone is reliable: the `online` event does not
 * fire on flaky mobile connections that never fully drop, tab focus catches
 * the shop coming back to the page, and the interval catches everything else.
 */
export function startAutoSync(
  onChange?: (result: SyncResult) => void
): () => void {
  if (typeof window === 'undefined') return () => {}

  let timer: ReturnType<typeof setInterval> | null = null

  const run = async () => {
    const result = await syncQueue()
    if (result.synced > 0) await refreshSnapshot()
    if (result.synced > 0 || result.failed > 0) onChange?.(result)
  }

  const onOnline = () => { void run() }
  const onVisible = () => { if (document.visibilityState === 'visible') void run() }

  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  timer = setInterval(run, 30_000)

  void run()

  return () => {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    if (timer) clearInterval(timer)
  }
}

/** UUID with a fallback — crypto.randomUUID needs a secure context, and a shop
 *  running the app over plain http on a local network would otherwise get
 *  undefined keys, which defeats the entire idempotency guarantee. */
export function newKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
