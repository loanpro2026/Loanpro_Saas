'use client'
/**
 * What the shop sees when the page could not load.
 *
 * The instinct is to show "You are offline" and stop. But the counter task
 * that matters — a customer standing there with a paper ticket wanting their
 * gold back — is answerable entirely from the cached snapshot. So this page
 * does that job rather than apologising.
 *
 * Everything here reads from IndexedDB. No network, no Supabase session.
 */
import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, CloudOff, Search, RefreshCw, Clock, Wallet } from 'lucide-react'
import {
  searchCachedLoans, getCachedLoans, getQueue, getMeta,
  type CachedLoan, type QueuedWrite,
} from '@/lib/offline/db'

export function OfflineWorkspace() {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<CachedLoan[]>([])
  const [total, setTotal] = useState(0)
  const [queued, setQueued] = useState<QueuedWrite[]>([])
  const [snapshotAt, setSnapshotAt] = useState<number | null>(null)
  const [cashBalance, setCashBalance] = useState<number | null>(null)
  const [online, setOnline] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cacheError, setCacheError] = useState<string | null>(null)

  useEffect(() => {
    setOnline(navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)

    void (async () => {
      try {
        setTotal((await getCachedLoans()).length)
        setQueued((await getQueue()).filter(w => !w.syncedAt))
        setSnapshotAt(await getMeta<number>('snapshot_at'))
        setCashBalance(await getMeta<number>('cash_balance'))
      } catch {
        setCacheError('Saved records could not be opened on this device.')
      } finally {
        setLoading(false)
      }
    })()

    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const run = useCallback(async (q: string) => {
    try {
      setHits(q.trim().length >= 1 ? await searchCachedLoans(q, 25) : [])
    } catch {
      setCacheError('Saved records could not be searched on this device.')
      setHits([])
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => run(query), 150)
    return () => clearTimeout(t)
  }, [query, run])

  const inr = (n: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0,
    }).format(n)

  const age = snapshotAt ? Math.round((Date.now() - snapshotAt) / 60000) : null

  return (
    <div className="min-h-dvh bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-5">

        <header className="flex items-start gap-3">
          <span className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <CloudOff className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-slate-900">
              {online ? 'Could not reach the server' : 'No internet'}
            </h1>
            <p className="text-sm text-slate-500">
              You can still look up loans saved on this device.
            </p>
          </div>
          {online && (
            <button
              onClick={() => location.assign('/dashboard')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-700 px-3.5 py-2 text-sm font-medium text-white"
            >
              <RefreshCw className="h-4 w-4" /> Retry
            </button>
          )}
        </header>

        {cacheError && (
          <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center" role="alert">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p className="min-w-0 flex-1">{cacheError}</p>
            <button onClick={() => location.reload()} className="btn-secondary px-3 py-1.5 text-xs">Try again</button>
          </div>
        )}

        {/* Anything waiting to sync — reassurance that nothing was lost. */}
        {queued.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-amber-900">
              <Clock className="h-4 w-4" />
              <p className="text-sm font-medium">
                {queued.length} {queued.length === 1 ? 'entry' : 'entries'} saved on this device
              </p>
            </div>
            <p className="text-xs text-amber-800 mt-1">
              These will be sent automatically once you are back online. Do not
              clear your browser data before that happens.
            </p>
          </div>
        )}

        {cashBalance !== null && (
          <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-white p-4">
            <Wallet className="h-4 w-4 text-slate-400" />
            <div>
              <p className="text-xs text-slate-500">Cash in hand, when last synced</p>
              <p className="text-lg font-semibold tabular-nums">{inr(cashBalance)}</p>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="overflow-hidden rounded-xl border border-surface-border bg-white">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
              placeholder="Loan number, name, father's name or place…"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
          </div>

          {loading ? (
            <div className="space-y-3 px-4 py-5" role="status" aria-label="Loading saved records">
              {Array.from({ length: 4 }, (_, index) => <div key={index} className="skeleton h-10" />)}
            </div>
          ) : cacheError && total === 0 ? null : query.trim() === '' ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              {total > 0
                ? `${total} active loans saved on this device`
                : 'No loans saved on this device yet'}
            </p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              Nothing matches “{query}” in the saved records
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {hits.map(l => (
                <li key={l.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        <span className="text-slate-400 tabular-nums mr-2">#{l.id}</span>
                        {l.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {[l.father_name && `S/o ${l.father_name}`, l.location,
                          l.detailed_type || l.category_type].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums">{inr(l.amount)}</p>
                      {l.total_deposits > 0 && (
                        <p className="text-xs text-emerald-600 tabular-nums">
                          {inr(l.total_deposits)} paid
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Issued {new Date(l.issue_date).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                    {l.weight
                      ? ` · ${l.category_type === 'Silver'
                        ? `${(l.weight / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 })} kg`
                        : `${l.weight.toLocaleString('en-IN')} g`}`
                      : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-slate-400 text-center">
          Active loans only.
          {age !== null && (
            <> Last updated {age < 1 ? 'just now' : age < 60 ? `${age} minutes ago`
              : `${Math.round(age / 60)} hours ago`}.</>
          )}
          {' '}Anything changed elsewhere since then is not shown here.
        </p>
      </div>
    </div>
  )
}
