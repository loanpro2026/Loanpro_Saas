'use client'
/**
 * The single search box, in the top bar.
 *
 * Accepts a loan number, a customer name, a father's name or a locality. The
 * ranking in `search_loans` puts an exact loan-number match first: when
 * someone types "4471" they are holding ticket 4471 and want that record, not
 * every loan that happens to be ₹4,471.
 *
 * Ctrl/Cmd+K opens it — the desktop app has keyboard shortcuts and the people
 * using this all day will expect them.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2, X, CloudOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { useOffline } from '@/components/offline/OfflineProvider'
import { searchCachedLoans } from '@/lib/offline/db'

interface Hit {
  id: number
  name: string
  father_name: string | null
  location: string | null
  amount: number
  category_type: string
  detailed_type: string | null
  issue_date: string
  status: string
}

export function GlobalSearch() {
  const router = useRouter()
  const { online } = useOffline()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // Guards against an earlier, slower request overwriting a later one.
  const seq = useRef(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else { setQuery(''); setHits([]); setActive(0) }
  }, [open])

  const run = useCallback(async (q: string) => {
    const mine = ++seq.current
    if (q.trim().length < 2) { setHits([]); setLoading(false); return }

    setLoading(true)

    // Looking up a customer who is standing at the counter holding a ticket is
    // the one thing that must keep working with no internet. Falls back to the
    // cached snapshot, and says so.
    if (!online) {
      const cached = await searchCachedLoans(q.trim(), 12)
      if (mine !== seq.current) return
      setHits(cached as unknown as Hit[])
      setFromCache(true)
      setActive(0)
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('search_loans', {
        p_query: q.trim(),
        p_status: null,
        p_limit: 12,
      })
      if (mine !== seq.current) return   // a newer query already answered
      if (error) throw error
      setHits((data as Hit[]) ?? [])
      setFromCache(false)
    } catch {
      // The browser can report `online` while the connection is unusable —
      // captive portals, a dead uplink. Fall back rather than showing nothing.
      const cached = await searchCachedLoans(q.trim(), 12)
      if (mine !== seq.current) return
      setHits(cached as unknown as Hit[])
      setFromCache(true)
    } finally {
      if (mine === seq.current) { setActive(0); setLoading(false) }
    }
  }, [online])

  useEffect(() => {
    const t = setTimeout(() => run(query), 200)
    return () => clearTimeout(t)
  }, [query, run])

  const go = (id: number) => {
    setOpen(false)
    router.push(`/loans/${id}`)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (hits.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % hits.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i <= 0 ? hits.length - 1 : i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(hits[active].id) }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-surface-border bg-white px-3 py-1.5 text-sm text-slate-400 hover:border-slate-300 transition-colors w-full max-w-xs"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Search loans…</span>
        <kbd className="hidden sm:inline text-[10px] text-slate-400 border border-surface-border rounded px-1 py-0.5">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />

          <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-modal overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border">
              {loading
                ? <Loader2 className="h-4 w-4 text-slate-400 animate-spin shrink-0" />
                : <Search className="h-4 w-4 text-slate-400 shrink-0" />}
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Loan number, name, father's name or place…"
                className="flex-1 text-sm outline-none placeholder:text-slate-400"
              />
              <button onClick={() => setOpen(false)} className="btn-icon" aria-label="Close search">
                <X className="h-4 w-4" />
              </button>
            </div>

            {fromCache && (
              <p className="flex items-center gap-2 px-4 py-2 text-xs text-amber-900 bg-amber-50 border-b border-surface-border">
                <CloudOff className="h-3.5 w-3.5 shrink-0" />
                Searching saved records on this device. Active loans only, and
                anything changed elsewhere since you last had internet is not shown.
              </p>
            )}

            <div className="max-h-[55vh] overflow-y-auto">
              {query.trim().length < 2 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400">
                  Type at least two characters
                </p>
              ) : hits.length === 0 && !loading ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400">
                  Nothing matches “{query}”
                </p>
              ) : (
                <ul>
                  {hits.map((h, i) => (
                    <li key={h.id}>
                      <button
                        onClick={() => go(h.id)}
                        onMouseEnter={() => setActive(i)}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                          i === active ? 'bg-primary-50' : 'hover:bg-slate-50'
                        )}
                      >
                        <span className="text-xs text-slate-400 tabular-nums w-12 shrink-0">
                          #{h.id}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-slate-900 truncate">
                            {h.name}
                          </span>
                          <span className="block text-xs text-slate-500 truncate">
                            {[h.father_name && `S/o ${h.father_name}`, h.location,
                              formatDate(h.issue_date)].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="text-right shrink-0">
                          <span className="block text-sm font-semibold tabular-nums">
                            {formatCurrency(h.amount)}
                          </span>
                          <Badge variant={h.status === 'active' ? 'active' : 'closed'}>
                            {h.status}
                          </Badge>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
