import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DayEndWorkspace } from '@/components/dayend/DayEndWorkspace'

export const dynamic = 'force-dynamic'

/**
 * End-of-day review, replacing the desktop's removed-records and
 * daily-deposit screens.
 *
 * These exist because the daily cash report shows totals, and a shop
 * reconciling the physical drawer needs the individual entries behind them —
 * which loans were settled, which customers part-paid, and how much.
 */
export default async function DayEndPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: appUser } = await supabase
    .from('users').select('tenant_id').eq('auth_id', user.id).single()
  const { data: tenant } = appUser
    ? await supabase.from('tenants').select('shop_name').eq('id', appUser.tenant_id).single()
    : { data: null }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">End of day</h1>
          <p className="page-subtitle">
            Check today&rsquo;s settlements and part-payments against the drawer
          </p>
        </div>
      </div>

      <DayEndWorkspace shopName={tenant?.shop_name ?? 'LoanPro'} />
    </div>
  )
}
