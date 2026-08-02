import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, ArrowRight, Landmark } from 'lucide-react'
import { asObject, asArray, objectAt, numberAt, stringAt } from '@/lib/json'
import type { Json, Tables } from '@/types/supabase'
import { formatCurrency, formatDate, getLoanAge } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { StockChart } from '@/components/dashboard/StockChart'
import { TrendChart } from '@/components/dashboard/TrendChart'

/**
 * Shapes for the six dashboard queries.
 *
 * The table selects are narrowed from the generated Row types, so a renamed
 * column breaks here. The two RETURNS TABLE functions are restated because
 * their columns are typed nullable — Postgres allows a null even where these
 * particular functions COALESCE.
 */
type ActivityRow = Pick<
  Tables<'activity_log'>,
  'id' | 'type' | 'description' | 'amount' | 'color' | 'icon' | 'time'
>

type RecentLoanRow = Pick<
  Tables<'loans'>,
  'id' | 'name' | 'father_name' | 'amount' | 'category_type'
  | 'detailed_type' | 'issue_date' | 'status'
>

type BreakdownRow = {
  name: string | null
  total_amount: number | null
  percentage: number | null
}

type TrendRow = {
  month: string | null
  invested: number | null
  returned: number | null
  interest: number | null
}


export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: appUser } = await supabase
    .from('users').select('tenant_id, full_name').eq('auth_id', user.id).single()
  if (!appUser) redirect('/login')

  // Everything comes from the report functions in migration 009, which resolve
  // "today" in Asia/Kolkata. The previous version used
  // `new Date().toISOString()` — that is UTC, so after 18:30 UTC a shop in
  // India would have been shown tomorrow's (empty) figures.
  /**
   * allSettled, not all.
   *
   * With Promise.all, one rejected query takes the entire dashboard down and
   * the error boundary shows a digest with no indication of which of the six
   * failed. A shop then sees "this page could not load" because a single
   * sparkline could not be drawn.
   *
   * Each result is unwrapped independently and its failure logged by name, so
   * a broken widget renders empty while the rest of the page still works —
   * and the Vercel log says exactly which one it was.
   */
  const settled = await Promise.allSettled([
    supabase.rpc('lending_metrics'),
    supabase.rpc('jewellery_stock'),
    supabase.from('activity_log')
      .select('id, type, description, amount, color, icon, time')
      .order('time', { ascending: false }).limit(8),
    supabase.from('loans')
      .select('id, name, father_name, amount, category_type, detailed_type, issue_date, status')
      .eq('status', 'active').order('issue_date', { ascending: false }).limit(5),
    supabase.rpc('jewellery_breakdown', { p_category: 'Gold', p_limit: 4 }),
    supabase.rpc('chart_data', { p_months: 12 }),
  ])

  const NAMES = [
    'lending_metrics', 'jewellery_stock', 'activity_log',
    'recent_loans', 'jewellery_breakdown', 'chart_data',
  ] as const

  function unwrap<T>(i: number): T | null {
    const r = settled[i]
    if (r.status === 'rejected') {
      console.error(`[dashboard] ${NAMES[i]} threw:`, r.reason)
      return null
    }
    // A PostgREST error is returned, not thrown — worth logging too, since a
    // missing GRANT or a renamed function looks identical to "no data" here.
    const { data, error } = r.value as { data: unknown; error: unknown }
    if (error) {
      console.error(`[dashboard] ${NAMES[i]} errored:`, error)
      return null
    }
    return (data ?? null) as T | null
  }

  const metrics       = unwrap<Json>(0)
  const stock         = unwrap<Json>(1)
  const activity      = unwrap<ActivityRow[]>(2)
  const recentLoans   = unwrap<RecentLoanRow[]>(3)
  const goldBreakdown = unwrap<BreakdownRow[]>(4)
  const trend         = unwrap<TrendRow[]>(5)

  // lending_metrics() and jewellery_stock() are `RETURNS jsonb`, so their
  // generated type is the full Json union. Narrow once here, with a runtime
  // check, and hand concrete numbers to the components below — that way
  // StockChart keeps its real prop types instead of accepting loose JSON.
  const m = asObject(metrics)
  const cost = {
    gold:   numberAt(objectAt(stock, 'cost'), 'gold'),
    silver: numberAt(objectAt(stock, 'cost'), 'silver'),
  }
  const weight = {
    gold:        numberAt(objectAt(stock, 'weight'), 'gold'),
    silver:      numberAt(objectAt(stock, 'weight'), 'silver'),
    gold_unit:   stringAt(objectAt(stock, 'weight'), 'gold_unit', 'g'),
    silver_unit: stringAt(objectAt(stock, 'weight'), 'silver_unit', 'kg'),
  }
  const counts = {
    gold:   numberAt(objectAt(stock, 'count'), 'gold'),
    silver: numberAt(objectAt(stock, 'count'), 'silver'),
  }

  const firstName = (appUser.full_name ?? '').split(' ')[0]

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {firstName ? `Hello, ${firstName}` : 'Dashboard'}
          </h1>
          <p className="page-subtitle">
            {numberAt(m, 'active_loans')} active loans ·{' '}
            {formatCurrency(numberAt(m, 'active_principal'))} lent out
          </p>
        </div>
        <Link href="/loans/new">
          <Button size="sm"><Plus className="h-4 w-4" /> New Loan</Button>
        </Link>
      </div>

      {/* Headline numbers */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon="wallet"
          label="Cash in hand"
          value={formatCurrency(numberAt(m, 'cash_balance'))}
          changePct={numberAt(m, 'cash_change_pct')}
          trend={asArray(m.cash_trend).map(Number)}
        />
        <MetricCard
          icon="landmark"
          label="Lent out"
          value={formatCurrency(numberAt(m, 'active_principal'))}
          sub={`${numberAt(m, 'active_loans')} active loans`}
        />
        <MetricCard
          icon="coins"
          label="Deposits held"
          value={formatCurrency(numberAt(m, 'total_deposits'))}
          changePct={numberAt(m, 'deposits_change_pct')}
          trend={asArray(m.deposits_trend).map(Number)}
        />
        <MetricCard
          icon="package"
          label="In the safe"
          value={formatCurrency(cost.gold + cost.silver)}
          sub={`${counts.gold} gold · ${counts.silver} silver`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          {/* chart_data() and jewellery_breakdown() are RETURNS TABLE, so every
              column is typed nullable — Postgres permits it even where these
              particular functions COALESCE. Normalise here rather than loosening
              the chart props, which would push the nulls into rendering. */}
          <TrendChart
            rows={(trend ?? []).map(r => ({
              month:    r.month ?? '',
              invested: r.invested ?? 0,
              returned: r.returned ?? 0,
              interest: r.interest ?? 0,
            }))}
          />

          <StockChart
            cost={cost}
            weight={weight}
            counts={counts}
            goldBreakdown={(goldBreakdown ?? []).map(b => ({
              name:         b.name ?? 'Other',
              total_amount: b.total_amount ?? 0,
              percentage:   b.percentage ?? 0,
            }))}
          />

          {/* Recent loans */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900">Latest loans</h2>
              <Link
                href="/loans"
                className="text-xs text-primary-700 hover:underline inline-flex items-center gap-1"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {!recentLoans?.length ? (
              <EmptyState
                icon={Landmark}
                title="No loans yet"
                description="Add your first loan to get started."
                action={
                  <Link href="/loans/new">
                    <Button size="sm"><Plus className="h-4 w-4" /> Add loan</Button>
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-surface-border -my-1">
                {recentLoans.map(l => (
                  <li key={l.id}>
                    <Link
                      href={`/loans/${l.id}`}
                      className="flex items-center gap-3 py-2.5 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors"
                    >
                      <span className="text-xs text-slate-400 tabular-nums w-12 shrink-0">
                        #{l.id}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">{l.name}</span>
                        <span className="block text-xs text-slate-400">
                          {formatDate(l.issue_date)} · {getLoanAge(l.issue_date)} ago
                        </span>
                      </span>
                      <Badge variant={l.category_type === 'Gold' ? 'gold' : 'silver'}>
                        {l.detailed_type || l.category_type}
                      </Badge>
                      <span className="text-sm font-semibold tabular-nums shrink-0">
                        {formatCurrency(l.amount)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <ActivityFeed items={activity ?? []} />
      </div>
    </div>
  )
}
