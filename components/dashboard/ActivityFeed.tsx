'use client'
/**
 * Recent activity — what happened in the shop, newest first.
 *
 * Rows are written by the Postgres functions in migration 007, so the feed
 * reflects what actually committed rather than what the UI thinks it did.
 */
import {
  FilePlus, Archive, ArrowDownCircle, PlusCircle, MinusCircle,
  Trash2, RotateCcw, Activity as ActivityIcon,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface Item {
  id: number
  type: string
  description: string
  amount: number | null
  color: string | null
  icon: string | null
  time: string
}

// Maps the icon names the SQL functions write.
const ICONS: Record<string, React.ElementType> = {
  'file-plus':        FilePlus,
  'archive':          Archive,
  'arrow-down-circle': ArrowDownCircle,
  'plus-circle':      PlusCircle,
  'minus-circle':     MinusCircle,
  'trash-2':          Trash2,
  'rotate-ccw':       RotateCcw,
}

const COLOURS: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-600',
  red:     'bg-red-100 text-red-600',
  amber:   'bg-amber-100 text-amber-600',
  slate:   'bg-slate-100 text-slate-600',
  primary: 'bg-primary-100 text-primary-700',
}

/** "3 minutes ago" style, in IST. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const secs = Math.round((Date.now() - then) / 1000)

  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`

  return new Date(iso).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
  })
}

export function ActivityFeed({ items, error = false }: { items: Item[]; error?: boolean }) {
  return (
    <div className="card">
      <h2 className="text-sm font-bold text-slate-900 mb-3">Recent activity</h2>

      {error ? (
        <div className="py-4">
          <p className="text-sm font-medium text-red-700">Recent activity could not be loaded</p>
          <p className="mt-1 text-xs text-slate-500">Committed changes are unaffected. Reload when the connection is stable.</p>
        </div>
      ) : !items?.length ? (
        <div className="py-4">
          <p className="text-sm font-medium text-slate-700">No committed changes yet</p>
          <p className="mt-1 text-xs text-slate-500">New loans, deposits, cash entries and settlements will appear here.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map(it => {
            const Icon = ICONS[it.icon ?? ''] ?? ActivityIcon
            const colour = COLOURS[it.color ?? 'slate'] ?? COLOURS.slate
            return (
              <li key={it.id} className="flex gap-3">
                <span className={cn('h-7 w-7 rounded-full flex items-center justify-center shrink-0', colour)}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700 leading-snug">{it.description}</p>
                  <p className="text-xs text-slate-400">
                    {relativeTime(it.time)}
                    {it.amount != null && Number(it.amount) !== 0 && (
                      <> · {formatCurrency(Number(it.amount))}</>
                    )}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
