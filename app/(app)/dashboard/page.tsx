import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Landmark, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { asObject, numberAt, objectAt, stringAt } from '@/lib/json'
import type { Json, Tables } from '@/types/supabase'
import { formatCurrency, formatDate, getLoanAge } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { CashSummary } from '@/components/dashboard/CashSummary'
import { PeriodCards } from '@/components/dashboard/PeriodCards'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { QuickReports } from '@/components/dashboard/QuickReports'
import { StockChart } from '@/components/dashboard/StockChart'
import { TopLocations, type LocationRow } from '@/components/dashboard/TopLocations'
import { TrendChart } from '@/components/dashboard/TrendChart'

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

type LocationReportRow = {
  location: string | null
  active_count: number | null
  active_amount: number | null
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

  // A failed widget must not take down the whole counter workspace or silently
  // turn unavailable money into a believable zero.
  const settled = await Promise.allSettled([
    supabase.rpc('dashboard_snapshot'),
    supabase.from('activity_log')
      .select('id, type, description, amount, color, icon, time')
      .order('time', { ascending: false }).limit(8),
    supabase.from('loans')
      .select('id, name, father_name, amount, category_type, detailed_type, issue_date, status')
      .eq('status', 'active').order('issue_date', { ascending: false }).limit(5),
    supabase.rpc('jewellery_breakdown', { p_category: 'Gold', p_limit: 4 }),
    supabase.rpc('chart_data', { p_months: 12 }),
    supabase.rpc('location_report', { p_locations: null, p_start: null, p_end: null }),
    // The approved compact financial row uses the live deposit balance already
    // exposed by this existing tenant-scoped report function.
    supabase.rpc('lending_metrics'),
  ])

  const names = [
    'dashboard_snapshot', 'activity_log', 'recent_loans', 'jewellery_breakdown',
    'chart_data', 'location_report', 'lending_metrics',
  ] as const
  const failures = new Set<number>()

  function unwrap<T>(index: number): T | null {
    const result = settled[index]
    if (result.status === 'rejected') {
      failures.add(index)
      console.error(`[dashboard] ${names[index]} threw:`, result.reason)
      return null
    }
    const { data, error } = result.value as { data: unknown; error: unknown }
    if (error) {
      failures.add(index)
      console.error(`[dashboard] ${names[index]} errored:`, error)
      return null
    }
    return (data ?? null) as T | null
  }

  const snapshot = unwrap<Json>(0)
  const activity = unwrap<ActivityRow[]>(1)
  const recentLoans = unwrap<RecentLoanRow[]>(2)
  const goldBreakdown = unwrap<BreakdownRow[]>(3)
  const trend = unwrap<TrendRow[]>(4)
  const locations = unwrap<LocationReportRow[]>(5)
  const lendingMetrics = unwrap<Json>(6)

  const metrics = asObject(snapshot)
  const stock = objectAt(snapshot, 'stock')
  const cash = objectAt(snapshot, 'cash')
  const depositMetrics = asObject(lendingMetrics)
  const cost = {
    gold: numberAt(objectAt(stock, 'cost'), 'gold'),
    silver: numberAt(objectAt(stock, 'cost'), 'silver'),
  }
  const weight = {
    gold: numberAt(objectAt(stock, 'weight'), 'gold'),
    silver: numberAt(objectAt(stock, 'weight'), 'silver'),
    gold_unit: stringAt(objectAt(stock, 'weight'), 'gold_unit', 'g'),
    silver_unit: stringAt(objectAt(stock, 'weight'), 'silver_unit', 'kg'),
  }
  const counts = {
    gold: numberAt(objectAt(stock, 'count'), 'gold'),
    silver: numberAt(objectAt(stock, 'count'), 'silver'),
  }
  const firstName = (appUser.full_name ?? '').trim().split(/\s+/)[0] ?? ''

  return (
    <div
      className="dashboard-reference space-y-3.5"
      style={{ fontFamily: "'IBM Plex Sans', Inter, system-ui, sans-serif" }}
    >
      <PeriodCards
        activePrincipal={numberAt(metrics, 'active_principal')}
        activeCount={numberAt(metrics, 'active_loans')}
        firstName={firstName}
        activeError={failures.has(0)}
      />

      <CashSummary
        data={{
          cashInHand: numberAt(cash, 'cash_in_hand'),
          totalDeposits: numberAt(depositMetrics, 'total_deposits'),
          depositCredit: numberAt(cash, 'deposit_credit'),
          depositDebit: numberAt(cash, 'deposit_debit'),
          noActivity: cash.no_activity === true,
        }}
        cashError={failures.has(0)}
        depositsError={failures.has(6)}
      />

      <div className="grid items-stretch gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendChart
            error={failures.has(4)}
            rows={(trend ?? []).map(row => ({
              month: row.month ?? '',
              invested: row.invested ?? 0,
              returned: row.returned ?? 0,
              interest: row.interest ?? 0,
            }))}
          />
        </div>
        <StockChart
          error={failures.has(0)}
          breakdownError={failures.has(3)}
          cost={cost}
          weight={weight}
          counts={counts}
          goldBreakdown={(goldBreakdown ?? []).map(item => ({
            name: item.name ?? 'Other',
            total_amount: item.total_amount ?? 0,
            percentage: item.percentage ?? 0,
          }))}
        />
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-3">
        <section className="card overflow-hidden p-0 lg:col-span-2" aria-labelledby="latest-loans-title">
          <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
            <h2 id="latest-loans-title" className="text-sm font-bold text-slate-900">Latest active loans</h2>
            <Link href="/view-records/active" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {failures.has(2) ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-semibold text-red-700">Latest active loans could not be loaded</p>
              <p className="mt-1 text-xs text-slate-500">Existing loan records are unchanged. Other dashboard figures remain available.</p>
            </div>
          ) : !recentLoans?.length ? (
            <EmptyState
              icon={Landmark}
              title="No loans yet"
              description="Add your first loan to begin the active portfolio."
              action={
                <Link href="/add-record">
                  <Button size="sm"><Plus className="h-4 w-4" /> Add your first loan</Button>
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-surface-border">
              {recentLoans.map(loan => (
                <li key={loan.id}>
                  <Link
                    href={`/loans/${loan.id}`}
                    className="grid min-h-12 grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-slate-50 sm:grid-cols-[4rem_minmax(0,1.3fr)_auto_minmax(7rem,1fr)_9rem_auto]"
                  >
                    <span className="font-semibold tabular-nums text-slate-700">#{loan.id}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{loan.name}</span>
                      <span className="block truncate text-[11px] text-slate-400 sm:hidden">{formatDate(loan.issue_date)}</span>
                    </span>
                    <Badge variant={loan.category_type === 'Gold' ? 'gold' : 'silver'}>{loan.category_type}</Badge>
                    <span className="hidden truncate text-xs text-slate-500 sm:block">{loan.detailed_type || '—'}</span>
                    <span className="hidden text-xs text-slate-500 sm:block">{formatDate(loan.issue_date)} · {getLoanAge(loan.issue_date)}</span>
                    <span className="col-span-3 text-right font-semibold tabular-nums text-slate-900 sm:col-span-1">
                      {formatCurrency(loan.amount)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <QuickActions />
      </div>

      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        <TopLocations
          error={failures.has(5)}
          rows={(locations ?? []).reduce<LocationRow[]>((all, row) => {
            if (row.location) {
              all.push({
                location: row.location,
                active_count: row.active_count ?? 0,
                active_amount: row.active_amount ?? 0,
              })
            }
            return all
          }, [])}
        />
        <QuickReports />
        <ActivityFeed items={activity ?? []} error={failures.has(1)} />
      </div>
    </div>
  )
}
