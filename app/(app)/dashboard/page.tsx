import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, ArrowRight, Wallet, Landmark, Package, Coins } from 'lucide-react'
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

  const m: Record<string, unknown> = metrics ?? {}
  const cost = stock?.cost ?? { gold: 0, silver: 0 }
  const weight = stock?.weight ?? { gold: 0, silver: 0, gold_unit: 'g', silver_unit: 'kg' }
  const counts = stock?.count ?? { gold: 0, silver: 0 }

  const firstName = (appUser.full_name ?? '').split(' ')[0]

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {firstName ? `Hello, ${firstName}` : 'Dashboard'}
          </h1>
          <p className="page-subtitle">
            {Number(m.active_loans ?? 0)} active loans ·{' '}
            {formatCurrency(Number(m.active_principal ?? 0))} lent out
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
          value={formatCurrency(Number(m.cash_balance ?? 0))}
          changePct={Number(m.cash_change_pct ?? 0)}
          trend={(m.cash_trend as number[]) ?? []}
        />
        <MetricCard
          icon={Landmark}
          label="Lent out"
          value={formatCurrency(Number(m.active_principal ?? 0))}
          sub={`${Number(m.active_loans ?? 0)} active loans`}
        />
        <MetricCard
          icon={Coins}
          label="Deposits held"
          value={formatCurrency(Number(m.total_deposits ?? 0))}
          changePct={Number(m.deposits_change_pct ?? 0)}
          trend={(m.deposits_trend as number[]) ?? []}
        />
        <MetricCard
          icon={Package}
          label="In the safe"
          value={formatCurrency(Number(cost.gold) + Number(cost.silver))}
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
