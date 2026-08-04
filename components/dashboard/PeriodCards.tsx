'use client'
/**
 * The dashboard's greeting row and the four figures under it.
 *
 * Built to the design reference: a segmented period switch and the primary
 * action on the right, then Active investment / Investment / Removals /
 * Interest across four equal cards. Only the last three follow the period —
 * active principal is a live balance and does not have a "this week" — which is
 * why it carries the LIVE pill instead of a period suffix.
 *
 * Each card fails on its own. A shop whose `dashboard_stats` call times out
 * still sees its active principal, and no unavailable figure is ever drawn as
 * a believable zero.
 */
import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { asObject, numberAt } from '@/lib/json'
import { cn, formatCurrency } from '@/lib/utils'
import { ICON } from '@/lib/nav'
import { Icon } from '@/components/ui/Icon'

const PERIODS = [
  { value: 'today',   label: 'Today' },
  { value: 'week',    label: 'Week' },
  { value: 'month',   label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year',    label: 'Year' },
] as const

type Period = (typeof PERIODS)[number]['value']

type Tone = 'default' | 'amber' | 'green'

interface Figure {
  title: string
  value: number
  records: string
  tone: Tone
  /** Active principal is a balance, not a period total. */
  live?: boolean
}

const TONE_CLASS: Record<Tone, string> = {
  default: 'text-ink',
  amber:   'text-amber',
  green:   'text-green',
}

/** "Good morning" before noon, in the shop's timezone rather than the browser's. */
function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false,
  }).format(new Date()))
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
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

  const periodLabel = PERIODS.find(item => item.value === period)?.label ?? 'Today'
  const issued   = numberAt(stats, 'issued_amount')
  const closed   = numberAt(stats, 'closed_amount')
  const interest = numberAt(stats, 'interest_earned')

  const figures: Figure[] = [
    {
      title: 'Active investment', value: activePrincipal, tone: 'default', live: true,
      records: `${activeCount} active loans`,
    },
    {
      title: `Investment · ${periodLabel}`, value: issued, tone: 'amber',
      records: `${numberAt(stats, 'issued_count')} new loans issued`,
    },
    {
      title: `Removals · ${periodLabel}`, value: closed, tone: 'green',
      records: `${numberAt(stats, 'closed_count')} loans settled`,
    },
    {
      title: `Interest · ${periodLabel}`, value: interest, tone: 'default',
      records: `${numberAt(stats, 'interest_count')} collections on settlement`,
    },
  ]

  return (
    <section className="space-y-3" aria-labelledby="dashboard-greeting">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 id="dashboard-greeting" className="text-xl font-bold leading-tight text-ink">
          {greeting()}{firstName ? `, ${firstName}` : ''}
        </h1>

        <div className="flex items-center gap-2.5 sm:justify-end">
          <div className="scrollbar-hide flex min-w-0 flex-1 gap-0.5 overflow-x-auto rounded-lg border border-surface-border bg-surface-card p-[3px] sm:flex-none">
            {PERIODS.map(item => (
              <button
                key={item.value}
                type="button"
                onClick={() => startTransition(() => setPeriod(item.value))}
                disabled={pending}
                aria-pressed={period === item.value}
                className={cn(
                  'shrink-0 rounded-md px-3 py-[5px] text-12.5 transition-colors',
                  period === item.value
                    ? 'bg-primary-tint font-semibold text-primary'
                    : 'font-medium text-ink-muted hover:bg-surface-muted'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Link href="/add-record" className="btn-primary shrink-0 gap-[7px]">
            <Icon d={ICON.plus} size={14} strokeWidth={2.2} />
            <span className="hidden sm:inline">Add New Record</span>
            <span className="sm:hidden">Add</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {figures.map(figure => {
          const failed    = figure.live ? activeError : statsError
          const isLoading = !figure.live && loading

          return (
            <article key={figure.title} className="card min-h-[92px] px-4 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-12 font-semibold text-ink-muted">{figure.title}</span>
                {figure.live && (
                  <span className="shrink-0 rounded-[5px] bg-green-bg px-1.5 py-0.5 text-10 font-bold text-green">
                    LIVE
                  </span>
                )}
              </div>

              {failed ? (
                <div className="mt-2">
                  <p className="text-11.5 font-medium leading-snug text-red">
                    {figure.live ? 'Active balance could not be loaded' : 'This figure could not be loaded'}
                  </p>
                  <button
                    type="button"
                    onClick={() => location.reload()}
                    className="mt-1 inline-flex items-center gap-1 text-11 font-semibold text-primary"
                  >
                    <RefreshCw className="h-3 w-3" /> Retry
                  </button>
                </div>
              ) : isLoading ? (
                <div className="mt-2 space-y-2" aria-label={`Loading ${figure.title}`}>
                  <div className="skeleton h-6 w-28" />
                  <div className="skeleton h-3 w-20" />
                </div>
              ) : (
                <>
                  <p className={cn('mt-1.5 text-22 font-bold tabular-nums', TONE_CLASS[figure.tone])}>
                    {formatCurrency(figure.value)}
                  </p>
                  <p className="mt-0.5 truncate text-12 text-ink-faint">{figure.records}</p>
                </>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
