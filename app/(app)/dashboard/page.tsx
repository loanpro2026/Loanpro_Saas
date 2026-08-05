import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Landmark, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { asArray, asObject, numberAt, objectAt, stringAt } from '@/lib/json'
import type { Json, Tables } from '@/types/supabase'
import { formatCurrency } from '@/lib/utils'
import { formatDateSetting, withDefaults } from '@/lib/settings'
import { MetalBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { CashSummary } from '@/components/dashboard/CashSummary'
import { PeriodCards } from '@/components/dashboard/PeriodCards'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { StockChart } from '@/components/dashboard/StockChart'
import { TrendChart } from '@/components/dashboard/TrendChart'

type RecentLoanRow = Pick<
  Tables<'loans'>,
  'id' | 'name' | 'father_name' | 'amount' | 'category_type'
  | 'detailed_type' | 'issue_date' | 'status'
>

type TrendRow = {
  month: string | null
  invested: number | null
  returned: number | null
  interest: number | null
}

export const dynamic = 'force-dynamic'

function indiaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

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
    supabase.from('loans')
      .select('id, name, father_name, amount, category_type, detailed_type, issue_date, status')
      .eq('status', 'active').order('issue_date', { ascending: false }).limit(5),
    supabase.rpc('chart_data', { p_months: 12 }),
    supabase.rpc('my_settings'),
  ])

  const names = [
    'dashboard_snapshot', 'recent_loans', 'chart_data', 'my_settings',
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

  let snapshot = unwrap<Json>(0)
  const recentLoans = unwrap<RecentLoanRow[]>(1)
  const trend = unwrap<TrendRow[]>(2)
  const settings = withDefaults(unwrap<Json>(3))

  // Migration 032 is the authoritative single-call path. Keep the dashboard
  // operational while a deployed app and its database migration briefly lag
  // one another by rebuilding the same shape from older, established RPCs.
  if (failures.has(0)) {
    const today = indiaDate()
    const [metricsResult, stockResult, inventoryResult, todayCashResult] = await Promise.all([
      supabase.rpc('lending_metrics'),
      supabase.rpc('jewellery_stock'),
      supabase.rpc('inventory_report'),
      supabase.from('daily_cash_summary')
        .select('deposit_credit, deposit_debit, added_cash, removed_cash, investments, returns, total_cash, left_cash')
        .eq('date', today).maybeSingle(),
    ])

    const fallbackError = metricsResult.error || stockResult.error
      || inventoryResult.error || todayCashResult.error

    if (!fallbackError) {
      const legacyMetrics = asObject(metricsResult.data)
      const legacyStock = asObject(stockResult.data)
      const todayCash = todayCashResult.data
      const inventory = inventoryResult.data ?? []
      const groupFor = (category: 'Gold' | 'Silver') => inventory
        .filter(row => row.category_type === category)
        .map(row => ({
          type: row.item_type ?? 'Unknown',
          amount: Number(row.total_amount ?? 0),
          count: Number(row.item_count ?? 0),
        }))

      snapshot = {
        as_of: today,
        active_loans: numberAt(legacyMetrics, 'active_loans'),
        active_principal: numberAt(legacyMetrics, 'active_principal'),
        cash: {
          cash_in_hand: numberAt(legacyMetrics, 'cash_balance'),
          total_deposits: numberAt(legacyMetrics, 'total_deposits'),
          deposit_credit: Number(todayCash?.deposit_credit ?? 0),
          deposit_debit: Number(todayCash?.deposit_debit ?? 0),
          added_cash: Number(todayCash?.added_cash ?? 0),
          removed_cash: Number(todayCash?.removed_cash ?? 0),
          investments: Number(todayCash?.investments ?? 0),
          returns: Number(todayCash?.returns ?? 0),
          opening_balance: Number(todayCash?.total_cash ?? 0),
          no_activity: !todayCash,
        },
        stock: {
          ...legacyStock,
          groups: { gold: groupFor('Gold'), silver: groupFor('Silver') },
        },
      }
      failures.delete(0)
      console.warn('[dashboard] using compatibility snapshot; apply migration 032')
    } else {
      console.error('[dashboard] compatibility snapshot errored:', fallbackError)
    }
  }

  const formatDate = (date: string | Date) => formatDateSetting(date, settings.date_display_format)

  const metrics = asObject(snapshot)
  const stock = objectAt(snapshot, 'stock')
  const cash = objectAt(snapshot, 'cash')
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
  const groups = asObject(objectAt(stock, 'groups'))
  const safeGroups = {
    gold: asArray(groups.gold).map(value => {
      const row = asObject(value)
      return {
        type: stringAt(row, 'type', 'Unknown'),
        amount: numberAt(row, 'amount'),
        count: numberAt(row, 'count'),
      }
    }),
    silver: asArray(groups.silver).map(value => {
      const row = asObject(value)
      return {
        type: stringAt(row, 'type', 'Unknown'),
        amount: numberAt(row, 'amount'),
        count: numberAt(row, 'count'),
      }
    }),
  }
  const firstName = (appUser.full_name ?? '').trim().split(/\s+/)[0] ?? ''

  return (
    <div className="space-y-3">
      <PeriodCards
        activePrincipal={numberAt(metrics, 'active_principal')}
        activeCount={numberAt(metrics, 'active_loans')}
        firstName={firstName}
        activeError={failures.has(0)}
      />

      <CashSummary
        data={{
          cashInHand: numberAt(cash, 'cash_in_hand'),
          totalDeposits: numberAt(cash, 'total_deposits'),
          depositCredit: numberAt(cash, 'deposit_credit'),
          depositDebit: numberAt(cash, 'deposit_debit'),
          noActivity: cash.no_activity === true,
        }}
        cashError={failures.has(0)}
        depositsError={failures.has(0)}
      />

      {/* Two thirds trend, one third safe — the design's ratio on both rows. */}
      <div className="grid items-stretch gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendChart
            error={failures.has(2)}
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
          cost={cost}
          weight={weight}
          counts={counts}
          groups={safeGroups}
        />
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-3">
        <section className="card-flush lg:col-span-2" aria-labelledby="latest-loans-title">
          <div className="flex items-center justify-between gap-3 border-b border-surface-border px-4 py-3">
            <h2 id="latest-loans-title" className="card-title">Latest active loans</h2>
            <Link href="/view-records/active" className="btn-link">View all →</Link>
          </div>

          {failures.has(1) ? (
            <div className="px-4 py-8 text-center">
              <p className="text-13 font-semibold text-red">Latest active loans could not be loaded</p>
              <p className="mt-1 text-12 text-ink-faint">
                Existing loan records are unchanged. Other dashboard figures remain available.
              </p>
            </div>
          ) : !recentLoans?.length ? (
            <EmptyState
              icon={Landmark}
              title="No loans yet"
              description="Add your first loan to begin the active portfolio."
              className="border-0"
              action={
                <Link href="/add-record">
                  <Button size="sm"><Plus className="h-4 w-4" /> Add your first loan</Button>
                </Link>
              }
            />
          ) : (
            <ul>
              {recentLoans.map(loan => (
                <li key={loan.id}>
                  <Link
                    href={`/loans/${loan.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 border-b
                               border-surface-border px-4 py-2.5 text-12.5 transition-colors last:border-0
                               hover:bg-surface-muted sm:grid-cols-[100px_1.4fr_1fr_1fr_76px]"
                  >
                    <span className="hidden font-semibold tabular-nums text-ink sm:block">
                      {formatCurrency(loan.amount)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{loan.name}</span>
                      <span className="block truncate text-11 text-ink-faint sm:hidden">
                        {formatCurrency(loan.amount)} · {formatDate(loan.issue_date)}
                      </span>
                    </span>
                    <span className="hidden truncate text-ink-muted sm:block">{loan.detailed_type || '—'}</span>
                    <span className="hidden text-ink-muted sm:block">{formatDate(loan.issue_date)}</span>
                    <MetalBadge metal={loan.category_type} className="justify-self-end" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <QuickActions />
      </div>
    </div>
  )
}
