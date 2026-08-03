'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Activity, Archive, ArrowDownCircle, Bell, FilePlus, Loader2,
  MinusCircle, PlusCircle, RotateCcw, Trash2, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, cn } from '@/lib/utils'

interface Notice {
  id: number
  description: string
  amount: number | null
  color: string | null
  icon: string | null
  time: string
}

const icons: Record<string, React.ElementType> = {
  'file-plus': FilePlus,
  archive: Archive,
  'arrow-down-circle': ArrowDownCircle,
  'plus-circle': PlusCircle,
  'minus-circle': MinusCircle,
  'trash-2': Trash2,
  'rotate-ccw': RotateCcw,
}

const colours: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
  slate: 'bg-slate-100 text-slate-600',
  primary: 'bg-primary-50 text-primary-700',
}

function relativeTime(iso: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function NotificationMenu() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [items, setItems] = useState<Notice[]>([])
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open || items.length > 0) return
    let cancelled = false
    setLoading(true)
    setError(false)
    ;(async () => {
      const supabase = createClient()
      const { data, error: queryError } = await supabase
        .from('activity_log')
        .select('id, description, amount, color, icon, time')
        .order('time', { ascending: false })
        .limit(6)
      if (cancelled) return
      if (queryError) setError(true)
      else setItems((data as Notice[]) ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [open, items.length])

  return (
    <div ref={root} className="relative hidden sm:block">
      <button
        type="button"
        aria-label="Recent activity"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(value => !value)}
        className="btn-icon"
      >
        <Bell className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Recent activity"
          className="absolute right-0 top-11 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-surface-border bg-white shadow-modal"
        >
          <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Recent activity</p>
              <p className="text-xs text-slate-500">Committed changes in your shop</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="btn-icon" aria-label="Close activity">
              <X className="h-4 w-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading recent activity…
            </div>
          ) : error ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-700">Activity could not be loaded</p>
              <p className="mt-1 text-xs text-slate-500">Your records are unchanged. Close this panel and try again when the connection is stable.</p>
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-9 text-center">
              <Activity className="mx-auto h-5 w-5 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-700">No activity yet</p>
              <p className="mt-1 text-xs text-slate-500">New loans, deposits, cash entries and settlements will appear here.</p>
            </div>
          ) : (
            <ul className="max-h-80 divide-y divide-surface-border overflow-y-auto">
              {items.map(item => {
                const Icon = icons[item.icon ?? ''] ?? Activity
                return (
                  <li key={item.id} className="flex gap-3 px-4 py-3">
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', colours[item.color ?? 'slate'] ?? colours.slate)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug text-slate-700">{item.description}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {relativeTime(item.time)}
                        {item.amount != null && Number(item.amount) !== 0 && <> · {formatCurrency(Number(item.amount))}</>}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
