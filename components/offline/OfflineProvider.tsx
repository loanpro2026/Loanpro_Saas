'use client'
/**
 * Connection state and the offline write queue, shared across the app.
 *
 * The guiding principle: a shop owner must never have to wonder whether a
 * deposit was actually recorded. Connection state and pending count are always
 * visible, and a queued write is described as queued — never as saved.
 */
import {
  createContext, useContext, useEffect, useState, useCallback, type ReactNode,
} from 'react'
import toast from 'react-hot-toast'
import { userFacingError } from '@/lib/user-message'
import { enqueue, pendingCount, getQueue, type QueuedKind } from '@/lib/offline/db'
import { startAutoSync, syncQueue, refreshSnapshot, newKey } from '@/lib/offline/sync'

interface OfflineState {
  online: boolean
  pending: number
  /** True while the very first snapshot is still loading. */
  warming: boolean
  /**
   * Queue a write. Returns the key so a caller can reference it.
   * `blob` carries image bytes for a queued photo capture.
   */
  queueWrite: (
    kind: QueuedKind,
    payload: Record<string, unknown>,
    blob?: Blob
  ) => Promise<string>
  syncNow: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<OfflineState>({
  online: true,
  pending: 0,
  warming: false,
  queueWrite: async () => '',
  syncNow: async () => {},
  refresh: async () => {},
})

export const useOffline = () => useContext(Ctx)

export function OfflineProvider({ children }: { children: ReactNode }) {
  // Assume online during SSR and the first paint: showing an offline banner to
  // someone with a perfectly good connection is worse than the reverse.
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [warming, setWarming] = useState(true)

  const refreshPending = useCallback(async () => {
    setPending(await pendingCount())
  }, [])

  useEffect(() => {
    setOnline(navigator.onLine)

    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)

    // Register the service worker here rather than only inside the push hook.
    // Shell caching must not depend on whether the shop agreed to
    // notifications — declining a permission prompt should not silently cost
    // them the ability to open the app with no internet.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(err => {
        console.warn('[offline] service worker registration failed', err)
      })
    }

    // The worker asks open tabs to drain the queue on a background sync event;
    // it cannot do it itself because it has no access to the auth session.
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'sync-queue') void syncQueue().then(refreshPending)
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)

    void refreshSnapshot().finally(() => setWarming(false))
    void refreshPending()

    const stop = startAutoSync(result => {
      void refreshPending()
      if (result.synced > 0) {
        toast.success(
          result.synced === 1
            ? '1 offline change is now safely synced.'
            : `${result.synced} offline changes are now safely synced.`
        )
      }
      for (const e of result.errors) {
        // Surfaced deliberately: a payment the customer actually handed over
        // must not vanish quietly because the sync failed.
        const kind = e.kind === 'deposit' ? 'deposit'
          : e.kind === 'photo' ? 'customer photo'
          : e.kind === 'loan' ? 'new loan'
          : 'offline change'
        toast.error(userFacingError(
          e.message,
          `The queued ${kind} could not be synced. It remains on this device so you can retry.`,
        ), { duration: 8000 })
      }
    })

    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      navigator.serviceWorker?.removeEventListener('message', onMessage)
      stop()
    }
  }, [refreshPending])

  const queueWrite = useCallback(async (
    kind: QueuedKind,
    payload: Record<string, unknown>,
    blob?: Blob
  ) => {
    const key = newKey()
    await enqueue({ key, kind, payload, blob, createdAt: Date.now() })
    await refreshPending()
    // Try immediately — the connection may have returned between the click and
    // now, in which case this posts straight through.
    void syncQueue().then(refreshPending)
    return key
  }, [refreshPending])

  const syncNow = useCallback(async () => {
    const result = await syncQueue()
    await refreshPending()
    if (result.synced > 0) await refreshSnapshot()
  }, [refreshPending])

  const refresh = useCallback(async () => {
    await refreshSnapshot()
  }, [])

  return (
    <Ctx.Provider value={{ online, pending, warming, queueWrite, syncNow, refresh }}>
      {children}
    </Ctx.Provider>
  )
}
