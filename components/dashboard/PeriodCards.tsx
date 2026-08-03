'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import {
  ArrowDown, ArrowUp, Landmark, MinusCircle, Percent, Plus,
  RefreshCw, TrendingUp,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { asObject, numberAt } from '@/lib/json'
import { cn, formatCurrency } from '@/lib/utils'

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
] as const

type Period = (typeof PERIODS)[number]['value']

interface Card {
  title: string
  icon: React.ElementType
  value: number
  records: string
  trend: number | null
  accent: string
}

function pctChange(now: number, before: number): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null
  return ((now - before) / before) * 100
}

export function PeriodCards({
  activePrincipal,
  activeCount,
  firstName,
  activeError = false,
}: {
  activePrincipal: number
  activeCount: number
  firstName: string
  activeError?: boolean
}) {
  const [period, setPeriod] = useState<Period>('today')
  const [stats, setStats] = useState<ReturnType<typeof asObject>>({})
  const [pending, startTransition] = useTransition()
  const [loading, setLoading] = useState(true)
  const [statsError, setStatsError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setStatsError(false)
    ;(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('dashboard_stats', { p_period: period })
      if (cancelled) return
      if (error) console.error('[dashboard] dashboard_stats:', error.message)
      setStats(asObject(error ? null : data))
      setStatsError(Boolean(error))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [period])

  const issued = numberAt(stats, 'issued_amount')
  const closed = numberAt(stats, 'closed_amount')
  const interest = numberAt(stats, 'interest_earned')

  const cards: Card[] = [
    {
      title: 'Active investment', icon: TrendingUp, value: activePrincipal,
      records: `${activeCount} active loans`, trend: null,
      accent: 'text-violet-600 bg-violet-50',
    },
    {
      title: 'Investment', icon: Landmark, value: issued,
      records: `${numberAt(stats, 'issued_count')} new loans`,
      trend: pctChange(issued, numberAt(stats, 'prev_issued_amount')),
      accent: 'text-amber-700 bg-amber-50',
    },
    {
      title: 'Removals', icon: MinusCircle, value: closed,
      records: `${numberAt(stats, 'closed_count')} settled`,
      trend: pctChange(closed, numberAt(stats, 'prev_closed_amount')),
      accent: 'text-emerald-700 bg-emerald-50',
    },
    {
      title: 'Interest', icon: Percent, value: interest,
      records: `${numberAt(stats, 'interest_count')} collections`,
      trend: pctChange(interest, numberAt(stats, 'prev_interest_earned')),
      accent: 'text-primary-700 bg-primary-50',
    },
  ]

  return (
    <section className="space-y-3" aria-labelledby="dashboard-greeting">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 id="dashboard-greeting" className="text-xl font-bold tracking-tight text-slate-900">
          Good morning{firstName ? `, ${firstName}` : ''}
        </h1>

        <div className="flex items-center gap-2 sm:justify-end">
          <div className="scrollbar-hide flex min-w-0 flex-1 overflow-x-auto rounded-lg border border-surface-border bg-white p-0.5 sm:flex-none">
            {PERIODS.map(item => (
              <button
                key={item.value}
                type="button"
                onClick={() => startTransition(() => setPeriod(item.value))}
                disabled={pending}
                className={cn(
                  'min-h-9 shrink-0 rounded-md px-3 text-xs font-medium transition-colors',
                  period === item.value
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Link href="/add-record" className="btn-primary min-h-10 shrink-0 px-3 sm:px-4">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add New Record</span>
            <span className="sm:hidden">Add</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
        {cards.map(card => {
          const Icon = card.icon
          const isActive = card.title === 'Active investment'
          const failed = isActive ? activeError : statsError
          const isLoading = !isActive && loading
          const up = (card.trend ?? 0) > 0

          return (
            <article key={card.title} className="card min-h-[116px] p-3.5 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="truncate text-xs font-semibold text-slate-600">{card.title}</span>
                {isActive ? (
                  <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">LIVE</span>
                ) : (
                  <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', card.accent)}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>

              {failed ? (
                <div className="mt-3">
                  <p className="text-xs font-medium leading-snug text-red-700">
                    {isActive ? 'Active balance could not be loaded' : `${card.title} could not be loaded`}
                  </p>
                  {isActive && <p className="mt-0.5 text-[10px] text-slate-500">Other figures remain available.</p>}
                  <button type="button" onClick={() => location.reload()} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary-700">
                    <RefreshCw className="h-3 w-3" /> Retry
                  </button>
                </div>
              ) : isLoading ? (
                <div className="mt-3 space-y-2" aria-label={`Loading ${card.title}`}>
                  <div className="skeleton h-6 w-24" />
                  <div className="skeleton h-3 w-20" />
                </div>
              ) : (
                <>
                  <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                    {formatCurrency(card.value)}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="truncate text-[11px] text-slate-500 sm:text-xs">{card.records}</span>
                    {card.trend !== null && (
                      <span className={cn(
                        'hidden items-center gap-0.5 text-xs font-medium sm:inline-flex',
                        up ? 'text-emerald-600' : 'text-red-600'
                      )}>
                        {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                        {Math.abs(card.trend).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
