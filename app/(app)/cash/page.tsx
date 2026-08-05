/**
 * Cash & Day-end — /cash
 *
 * The drawer, as the design lays it out: three figures across the top, today's
 * ledger on the left, the closing panel on the right.
 *
 * The ledger's running balance is built forward from the opening balance rather
 * than read per row. `daily_cash_summary` stores the day's totals, not a
 * balance after each entry, and computing it here keeps one definition of
 * "balance after this entry" instead of a second one in SQL that could drift
 * from the first.
 *
 * Closing the day itself lives on /day-end, where the settlements and
 * part-payments behind the totals can be checked one by one. This page links to
 * it rather than duplicating the flow — two places to close the books is how a
 * day gets closed twice.
 */
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CircleAlert, Wallet } from 'lucide-react'
import { formatCurrency, todayIST } from '@/lib/utils'
import { formatDateSetting, withDefaults } from '@/lib/settings'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader, StatCard } from '@/components/ui/Page'
import { CashTxButton } from '@/components/cash/CashTxButton'

export const dynamic = 'force-dynamic'

/** "Sunday, 3 August 2026" in the shop's timezone. */
function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function entryTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

export default async function CashPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: appUser } = await supabase
    .from('users').select('tenant_id').eq('auth_id', user.id).single()
  if (!appUser) redirect('/login')

  // IST, not UTC — see todayIST() in lib/utils.
  const today = todayIST()

  const [todayResult, transactionsResult, historyResult, settingsResult] = await Promise.all([
    supabase.from('daily_cash_summary')
      .select('*').eq('tenant_id', appUser.tenant_id).eq('date', today).maybeSingle(),
    supabase.from('cash_transactions')
      .select('*').eq('tenant_id', appUser.tenant_id)
      .eq('transaction_date', today)
      .order('id', { ascending: true }),
    supabase.from('daily_cash_summary')
      .select('date, left_cash, total_cash, investments, returns')
      .eq('tenant_id', appUser.tenant_id)
      .lt('date', today)
      .order('date', { ascending: false }).limit(7),
    supabase.rpc('my_settings'),
  ])

  const { data: todaySummary, error: todayError } = todayResult
  const { data: transactions, error: transactionsError } = transactionsResult
  const { data: previousDays, error: historyError } = historyResult
  const settings = withDefaults(settingsResult.data)
  const formatDate = (date: string | Date) => formatDateSetting(date, settings.date_display_format)

  const opening = Number(todaySummary?.total_cash ?? 0)
  const cashInHand = Number(todaySummary?.left_cash ?? opening)
  const movement = cashInHand - opening
  const moneyIn = Number(todaySummary?.added_cash ?? 0) + Number(todaySummary?.returns ?? 0)
    + Number(todaySummary?.deposit_credit ?? 0)
  const moneyOut = Number(todaySummary?.removed_cash ?? 0) + Number(todaySummary?.investments ?? 0)

  const lastClosed = previousDays?.[0]

  // Running balance, forward from the opening figure.
  let balance = opening
  const ledger = (transactions ?? []).map(entry => {
    const amount = Number(entry.amount ?? 0)
    balance += entry.type === 'add' ? amount : -amount
    return {
      id: entry.id,
      time: entryTime(entry.created_at as string | null),
      reason: entry.reason as string,
      inAmount: entry.type === 'add' ? amount : null,
      outAmount: entry.type === 'add' ? null : amount,
      balance,
    }
  })

  return (
    <div className="page-stack">
      <PageHeader
        title="Cash & Day-end"
        subtitle={
          lastClosed
            ? `${longDate(today)} · books last closed ${formatDate(lastClosed.date)} at ${formatCurrency(Number(lastClosed.left_cash ?? 0))}`
            : `${longDate(today)} · the books have not been closed yet`
        }
        actions={<CashTxButton />}
      />

      {todayError ? (
        <EmptyState
          icon={CircleAlert}
          title="Today’s cash summary could not be loaded"
          description={todayError.message}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Opening balance"
            value={formatCurrency(opening)}
            sub={lastClosed ? `Carried from ${formatDate(lastClosed.date)} closing` : 'No previous closing on record'}
          />
          <StatCard
            label="Net movement today"
            value={`${movement < 0 ? '− ' : movement > 0 ? '+ ' : ''}${formatCurrency(Math.abs(movement))}`}
            tone={movement < 0 ? 'amber' : movement > 0 ? 'green' : 'default'}
            sub={`${formatCurrency(moneyIn)} in · ${formatCurrency(moneyOut)} out`}
          />
          <StatCard
            label="Cash in hand"
            value={formatCurrency(cashInHand)}
            tone="primary"
            sub="Expected in the drawer now"
          />
        </div>
      )}

      <div className="grid items-start gap-3 lg:grid-cols-3">
        <section className="card-flush lg:col-span-2" aria-labelledby="ledger-title">
          <div className="border-b border-surface-border px-4 py-3">
            <h2 id="ledger-title" className="card-title">Today&rsquo;s cash ledger</h2>
          </div>

          {transactionsError ? (
            <EmptyState
              icon={CircleAlert}
              title="Cash entries could not be loaded"
              description={transactionsError.message}
              className="border-0"
            />
          ) : ledger.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No cash entries today"
              description="Add or remove cash to record a non-loan movement. Loans and settlements post to the drawer automatically."
              className="border-0"
            />
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto] gap-2.5 border-b border-surface-border bg-surface-muted
                              px-4 py-2 text-11 font-bold uppercase tracking-[0.04em] text-ink-faint
                              sm:grid-cols-[70px_1fr_110px_110px_120px]">
                <span className="hidden sm:block">Time</span>
                <span>Entry</span>
                <span className="hidden text-right sm:block">In</span>
                <span className="hidden text-right sm:block">Out</span>
                <span className="text-right">Balance</span>
              </div>

              {ledger.map(entry => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-2.5 border-b border-surface-border
                             px-4 py-2.5 text-12.5 last:border-0 sm:grid-cols-[70px_1fr_110px_110px_120px]"
                >
                  <span className="hidden text-ink-faint sm:block">{entry.time}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{entry.reason}</span>
                    <span className="block text-11 text-ink-faint sm:hidden">
                      {entry.time} ·{' '}
                      {entry.inAmount != null
                        ? <span className="text-green">+ {formatCurrency(entry.inAmount)}</span>
                        : <span className="text-amber">− {formatCurrency(entry.outAmount ?? 0)}</span>}
                    </span>
                  </span>
                  <span className="hidden text-right font-semibold tabular-nums text-green sm:block">
                    {entry.inAmount != null ? formatCurrency(entry.inAmount) : ''}
                  </span>
                  <span className="hidden text-right font-semibold tabular-nums text-amber sm:block">
                    {entry.outAmount != null ? formatCurrency(entry.outAmount) : ''}
                  </span>
                  <span className="text-right font-semibold tabular-nums text-ink">
                    {formatCurrency(entry.balance)}
                  </span>
                </div>
              ))}
            </>
          )}
        </section>

        <div className="flex flex-col gap-3">
          <section className="card" aria-labelledby="close-title">
            <h2 id="close-title" className="card-title">End of day</h2>
            <p className="mt-1 text-12.5 leading-relaxed text-ink-muted">
              Count the drawer, check today&rsquo;s settlements and part-payments against it, then lock the
              day&rsquo;s entries.
            </p>

            <div className="mt-3.5 flex flex-col gap-2 text-12.5">
              <div className="flex justify-between">
                <span className="text-ink-muted">Expected closing</span>
                <span className="font-bold tabular-nums text-ink">{formatCurrency(cashInHand)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Cash entries today</span>
                <span className="font-semibold tabular-nums text-ink">{ledger.length}</span>
              </div>
            </div>

            <Link href="/day-end" className="btn-primary mt-3.5 w-full">Review and close the day</Link>
            <p className="mt-2.5 text-11.5 leading-relaxed text-ink-faint">
              Closing creates tomorrow&rsquo;s opening balance. Entries stay visible but locked.
            </p>
          </section>

          {historyError ? (
            <p className="card px-4 py-3 text-12.5 text-red" role="alert">
              Cash history could not be loaded. {historyError.message}
            </p>
          ) : previousDays && previousDays.length > 0 && (
            <section className="card-flush" aria-labelledby="recent-days-title">
              <div className="border-b border-surface-border px-4 py-3">
                <h2 id="recent-days-title" className="card-title">Previous closings</h2>
              </div>
              {previousDays.map(day => (
                <div
                  key={day.date}
                  className="flex items-center justify-between gap-3 border-b border-surface-border
                             px-4 py-2 text-12.5 last:border-0"
                >
                  <span className="text-ink-muted">{formatDate(day.date)}</span>
                  <span className="font-semibold tabular-nums text-ink">
                    {formatCurrency(Number(day.left_cash ?? 0))}
                  </span>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
