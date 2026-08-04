/**
 * View Accounts → Investment — /view-accounts/investment
 *
 * One of the three account screens. Each is its own menu item in the design and
 * in the desktop app, so each is its own URL rather than a tab inside a
 * combined Reports page — a shop looking for "Investment" should land on it,
 * not have to find it.
 */
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ReportsWorkspace } from '@/components/reports/ReportsWorkspace'
import { PageHeader } from '@/components/ui/Page'

export const dynamic = 'force-dynamic'

export default async function InvestmentAccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: appUser } = await supabase
    .from('users').select('tenant_id').eq('auth_id', user.id).single()
  const { data: tenant } = appUser
    ? await supabase.from('tenants').select('shop_name').eq('id', appUser.tenant_id).single()
    : { data: null }

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="View Accounts · Investment"
        subtitle="Principal issued on new loans in the selected period"
      />

      <ReportsWorkspace
        shopName={tenant?.shop_name ?? 'LoanPro'}
        initialKey="account"
        initialAccountType="Investment"
        lockToInitial
      />
    </div>
  )
}
