'use client'
/**
 * The four headline cards, matching the desktop dashboard.
 *
 * Source: electron_app/renderer/src/components/Card.tsx —
 *
 *   Total Investment   money currently out on loan       "N active"
 *   Investment         money lent in the period          "N new loans"
 *   Removals           principal that came back          "N removed"
 *   Interest           interest collected                "N collections"
 *
 * These are money-flow figures, and they are not what the web app was showing.
 * It had Cash in hand / Lent out / Deposits held / In the safe — a snapshot of
 * balances. Both are defensible, but a shop that has read the same four numbers
 * every morning for years should not have to relearn its own dashboard.
 *
 * Only Total Investment is a running total; the other three answer "how did
 * this period go", which is why the period selector belongs on this row and
 * not on the page.
 */
import { useEffect, useState, useTransition } from 'react'
import {
  TrendingUp, Landmark, MinusCircle, Percent, ArrowUp, ArrowDown,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { asObject, numberAt } from '@/lib/json'
import { formatCurrency, cn } from '@/lib/utils'

/** Matches the windows dashboard_stats() understands. */
const PERIODS = [
  { value: 'today',   label: 'Today' },
  { value: 'week',    label: 'Week' },
  { value: 'month',   label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year',    label: 'Year' },
] as const

type Period = (typeof PERIODS)[number]['value']

interface Card {
  title: string
  icon: React.ElementType
  value: number
  records: string
  /** Percent change against the preceding window. null = no basis to compare. */
  trend: number | null
  accent: string
}

/**
 * Percent change, or null when the previous window was empty.
 *
 * Returning 0 there would be a lie ("no change") and returning 100 would be
 * meaningless — going from nothing to something is not a percentage. The card
 * shows no arrow at all instead.
 */
function pctChange(now: number, before: number): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null
  return ((now - before) / before) * 100
}

export function PeriodCards({
  /** Total across all active loans — a balance, so it ignores the period. */
  activePrincipal,
  activeCount,
}: {
  activePrincipal: number
  activeCount: number
}) {
  const [period, setPeriod] = useState<Period>('month')
  const [stats, setStats] = useState<ReturnType<typeof asObject>>({})
  const [pending, startTransition] = useTransition()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('dashboard_stats', { p_period: period })
      if (cancelled) return
      if (error) console.error('[dashboard] dashboard_stats:', error.message)
      setStats(asObject(error ? null : data))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [period])

  const issued   = numberAt(stats, 'issued_amount')
  const closed   = numberAt(stats, 'closed_amount')
  const interest = numberAt(stats, 'interest_earned')

  const cards: Card[] = [
    {
      title: 'Active investment',
      icon: TrendingUp,
      value: activePrincipal,
      records: `${activeCount} active`,
      trend: null,                       // a balance, not a period figure
      accent: 'text-violet-600 bg-violet-50',
    },
    {
      title: 'Investment',
      icon: Landmark,
      value: issued,
      records: `${numberAt(stats, 'issued_count')} new loans`,
      trend: pctChange(issued, numberAt(stats, 'prev_issued_amount')),
      accent: 'text-blue-600 bg-blue-50',
    },
    {
      title: 'Removals',
      icon: MinusCircle,
      value: closed,
      records: `${numberAt(stats, 'closed_count')} removed`,
      trend: pctChange(closed, numberAt(stats, 'prev_closed_amount')),
      accent: 'text-amber-600 bg-amber-50',
    },
    {
      title: 'Interest',
      icon: Percent,
      value: interest,
      records: `${numberAt(stats, 'interest_count')} collections`,
      trend: pctChange(interest, numberAt(stats, 'prev_interest_earned')),
      accent: 'text-emerald-600 bg-emerald-50',
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Overview</h2>
        <div className="flex rounded-xl border border-surface-border overflow-hidden bg-white">
          {PERIODS.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => startTransition(() => setPeriod(p.value))}
              disabled={pending}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                period === p.value
                  ? 'bg-primary-700 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => {
          const Icon = c.icon
          const up = (c.trend ?? 0) > 0
          return (
            <div key={c.title} className="card">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs text-slate-500 truncate">{c.title}</span>
                <span className={cn('h-7 w-7 rounded-lg flex items-center justify-center shrink-0', c.accent)}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
              </div>

              <p className="mt-1.5 text-xl font-semibold tabular-nums text-slate-900">
                {loading && c.title !== 'Active investment' ? '—' : formatCurrency(c.value)}
              </p>

              <div className="mt-0.5 flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  {loading && c.title !== 'Active investment' ? '' : c.records}
                </span>
                {c.trend !== null && !loading && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 text-xs font-medium',
                      up ? 'text-emerald-600' : 'text-red-600'
                    )}
                  >
                    {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    {Math.abs(c.trend).toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
