import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, ArrowRight, Wallet, Landmark, Package, Coins } from 'lucide-react'
import { asObject, asArray, objectAt, numberAt, stringAt } from '@/lib/json'
import { formatCurrency, formatDate, getLoanAge } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { StockChart } from '@/components/dashboard/StockChart'
import { TrendChart } from '@/components/dashboard/TrendChart'

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
  const [
    { data: metrics },
    { data: stock },
    { data: activity },
    { data: recentLoans },
    { data: goldBreakdown },
    { data: trend },
  ] = await Promise.all([
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
          icon={Wallet}
          label="Cash in hand"
          value={formatCurrency(numberAt(m, 'cash_balance'))}
          changePct={numberAt(m, 'cash_change_pct')}
          trend={asArray(m.cash_trend).map(Number)}
        />
        <MetricCard
          icon={Landmark}
          label="Lent out"
          value={formatCurrency(numberAt(m, 'active_principal'))}
          sub={`${numberAt(m, 'active_loans')} active loans`}
        />
        <MetricCard
          icon={Coins}
          label="Deposits held"
          value={formatCurrency(numberAt(m, 'total_deposits'))}
          changePct={numberAt(m, 'deposits_change_pct')}
          trend={asArray(m.deposits_trend).map(Number)}
        />
        <MetricCard
          icon={Package}
          label="In the safe"
          value={formatCurrency(cost.gold + cost.silver)}
          sub={`${counts.gold} gold · ${counts.silver} silver`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <TrendChart rows={trend ?? []} />

          <StockChart
            cost={cost}
            weight={weight}
            counts={counts}
            goldBreakdown={goldBreakdown ?? []}
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
