'use client'
/**
 * The bell menu — the shop's committed changes, newest first.
 *
 * Built to the design's activity panel: a 360px card, each row a signed square
 * tile (+ money in, − money out, ✓ a day closed), the description and relative
 * time on the left, the amount tinted to match the tile on the right.
 *
 * The sign and colour come from the activity row itself rather than being
 * inferred here — the database already records whether an entry moved money in
 * or out, and re-deriving it in the UI is how the two drift apart.
 */
import { useEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, cn } from '@/lib/utils'
import { ICON } from '@/lib/nav'
import { Icon } from '@/components/ui/Icon'

interface Notice {
  id: number
  description: string
  amount: number | null
  color: string | null
  icon: string | null
  time: string
}

/** Tile colour per activity kind, in the design's token pairs. */
const TONE: Record<string, { tile: string; text: string }> = {
  emerald: { tile: 'bg-green-bg text-green',        text: 'text-green' },
  green:   { tile: 'bg-green-bg text-green',        text: 'text-green' },
  red:     { tile: 'bg-red-bg text-red',            text: 'text-red' },
  amber:   { tile: 'bg-amber-bg text-amber',        text: 'text-amber' },
  primary: { tile: 'bg-primary-tint text-primary',  text: 'text-primary' },
  slate:   { tile: 'bg-surface-muted text-ink-muted', text: 'text-ink-muted' },
}

/**
 * The glyph in the tile. Money leaving the drawer reads "−", money arriving
 * "+", and anything that is a state change rather than a movement reads "✓".
 */
function signFor(icon: string | null, color: string | null): string {
  if (icon === 'file-plus' || icon === 'minus-circle' || color === 'amber') return '−'
  if (icon === 'trash-2' || color === 'red') return '−'
  if (icon === 'archive' || icon === 'arrow-down-circle' || icon === 'plus-circle') return '+'
  if (color === 'emerald' || color === 'green') return '+'
  return '✓'
}

function relativeTime(iso: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`
  if (seconds < 172800) return 'Yesterday'
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`
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
        <Icon d={ICON.bell} size={17} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Recent activity"
          className="menu-panel absolute right-0 top-[42px] z-[60] w-[min(360px,calc(100vw-2rem))]"
        >
          <div className="flex items-start justify-between gap-2 border-b border-surface-border px-4 pb-2.5 pt-3.5">
            <div>
              <p className="text-13.5 font-bold text-ink">Recent activity</p>
              <p className="text-11.5 text-ink-faint">Committed changes in your shop</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="-mr-1 -mt-1 p-1 text-ink-faint hover:text-ink"
              aria-label="Close activity"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-10 text-13 text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading recent activity…
            </div>
          ) : error ? (
            <div className="px-4 py-8 text-center">
              <p className="text-13 font-semibold text-ink">Activity could not be loaded</p>
              <p className="mt-1 text-11.5 leading-relaxed text-ink-faint">
                Your records are unchanged. Close this panel and try again when the connection is stable.
              </p>
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-9 text-center">
              <p className="text-13 font-semibold text-ink">No activity yet</p>
              <p className="mt-1 text-11.5 leading-relaxed text-ink-faint">
                New loans, deposits, cash entries and settlements will appear here.
              </p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map(item => {
                const tone = TONE[item.color ?? 'slate'] ?? TONE.slate
                return (
                  <li
                    key={item.id}
                    className="flex items-start gap-2.5 border-b border-surface-border px-4 py-2.5 last:border-0"
                  >
                    <span className={cn('flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md text-12 font-bold', tone.tile)}>
                      {signFor(item.icon, item.color)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-12.5 font-medium leading-snug text-ink">{item.description}</p>
                      <p className="text-11 text-ink-faint">{relativeTime(item.time)}</p>
                    </div>
                    {item.amount != null && Number(item.amount) !== 0 && (
                      <span className={cn('shrink-0 text-12.5 font-semibold tabular-nums', tone.text)}>
                        {formatCurrency(Number(item.amount))}
                      </span>
                    )}
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
