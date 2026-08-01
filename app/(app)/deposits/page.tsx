import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency, formatDate, todayIST } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { ArrowDownCircle, Plus } from 'lucide-react'
import { AddDepositButton } from '@/components/deposits/AddDepositButton'

export const dynamic = 'force-dynamic'

export default async function DepositsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: appUser } = await supabase.from('users').select('tenant_id').eq('auth_id', user.id).single()
  if (!appUser) redirect('/login')

  // IST, not UTC — see todayIST() in lib/utils.
  const today = todayIST()

  const { data: deposits } = await supabase
    .from('deposits')
    .select('id, amount, deposit_date, loan_id, loans(name, father_name, category_type)')
    .eq('tenant_id', appUser.tenant_id)
    .order('deposit_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(100)

  const todayTotal = deposits?.filter(d => d.deposit_date === today).reduce((s, d) => s + d.amount, 0) ?? 0
  const totalAll   = deposits?.reduce((s, d) => s + d.amount, 0) ?? 0

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Deposits</h1>
          <p className="page-subtitle">Payment collections from customers</p>
        </div>
        <AddDepositButton tenantId={appUser.tenant_id} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="stat-card">
          <span className="stat-label">Today's Collections</span>
          <span className="stat-value text-emerald-600">{formatCurrency(todayTotal, true)}</span>
          <span className="stat-sub">{deposits?.filter(d => d.deposit_date === today).length ?? 0} payments</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Shown</span>
          <span className="stat-value">{formatCurrency(totalAll, true)}</span>
          <span className="stat-sub">Last 100 records</span>
        </div>
      </div>

      {!deposits?.length ? (
        <EmptyState icon={ArrowDownCircle} title="No deposits yet" description="Record customer payments against active loans." />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Type</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map((d: any) => (
                <tr key={d.id}>
                  <td className="text-sm tabular-nums">{formatDate(d.deposit_date)}</td>
                  <td>
                    <Link href={`/loans/${d.loan_id}`} className="hover:text-primary-700 transition-colors">
                      <p className="text-sm font-medium">{d.loans?.name}</p>
                      {d.loans?.father_name && <p className="text-xs text-slate-400">S/o {d.loans.father_name}</p>}
                    </Link>
                  </td>
                  <td>
                    <span className={`badge ${d.loans?.category_type === 'Gold' ? 'badge-gold' : 'badge-silver'}`}>
                      {d.loans?.category_type}
                    </span>
                  </td>
                  <td className="text-right font-semibold text-emerald-700 tabular-nums">
                    +{formatCurrency(d.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
