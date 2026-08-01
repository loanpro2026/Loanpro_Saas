import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatCurrency, formatDate, todayIST } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { Wallet } from 'lucide-react'
import { CashTxButton } from '@/components/cash/CashTxButton'

export const dynamic = 'force-dynamic'

export default async function CashPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: appUser } = await supabase.from('users').select('tenant_id').eq('auth_id', user.id).single()
  if (!appUser) redirect('/login')

  // IST, not UTC — see todayIST() in lib/utils.
  const today = todayIST()

  const [{ data: todaySummary }, { data: transactions }, { data: last7Days }] = await Promise.all([
    supabase.from('daily_cash_summary')
      .select('*').eq('tenant_id', appUser.tenant_id).eq('date', today).single(),
    supabase.from('cash_transactions')
      .select('*').eq('tenant_id', appUser.tenant_id)
      .order('transaction_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(50),
    supabase.from('daily_cash_summary')
      .select('date, left_cash, total_cash, investments, returns')
      .eq('tenant_id', appUser.tenant_id)
      .order('date', { ascending: false }).limit(7),
  ])

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cash Management</h1>
          <p className="page-subtitle">Track your daily cash flow</p>
        </div>
        <CashTxButton />
      </div>

      {/* Today's summary */}
      {todaySummary ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Cash',    value: todaySummary.total_cash,   color: 'text-slate-900'   },
            { label: 'Investments',   value: todaySummary.investments,  color: 'text-red-600'     },
            { label: 'Returns',       value: todaySummary.returns,      color: 'text-emerald-600' },
            { label: 'Cash in Hand',  value: todaySummary.left_cash,    color: 'text-primary-700' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <span className="stat-label">{s.label}</span>
              <span className={`stat-value text-lg ${s.color}`}>{formatCurrency(s.value ?? 0, true)}</span>
              <span className="stat-sub">Today</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-4 text-sm text-slate-500 text-center">No cash summary for today yet.</div>
      )}

      {/* Last 7 days */}
      {last7Days && last7Days.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-surface-border">
            <h2 className="font-semibold text-slate-900">Last 7 Days</h2>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-right">Investments</th>
                <th className="text-right">Returns</th>
                <th className="text-right">Cash in Hand</th>
              </tr>
            </thead>
            <tbody>
              {last7Days.map((d: any) => (
                <tr key={d.date}>
                  <td className="text-sm">{formatDate(d.date)}</td>
                  <td className="text-right tabular-nums text-red-600 text-sm">{formatCurrency(d.investments ?? 0)}</td>
                  <td className="text-right tabular-nums text-emerald-600 text-sm">{formatCurrency(d.returns ?? 0)}</td>
                  <td className="text-right tabular-nums font-semibold text-sm">{formatCurrency(d.left_cash ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cash transactions */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-border">
          <h2 className="font-semibold text-slate-900">Transactions</h2>
        </div>
        {!transactions?.length ? (
          <EmptyState icon={Wallet} title="No transactions yet" description="Add cash or record removals to track your cash flow." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reason</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t: any) => (
                <tr key={t.id}>
                  <td className="text-sm">{formatDate(t.transaction_date)}</td>
                  <td className="text-sm text-slate-600">{t.reason}</td>
                  <td className={`text-right font-semibold tabular-nums text-sm ${t.type === 'add' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {t.type === 'add' ? '+' : '-'}{formatCurrency(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
