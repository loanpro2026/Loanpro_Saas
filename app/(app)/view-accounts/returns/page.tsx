/**
 * View Accounts → Returns — /view-accounts/returns
 *
 * One of the desktop's three account screens. Each is its own menu item there,
 * so each is its own URL here rather than a tab inside a combined Reports
 * page — a shop looking for "Returns" should land on it, not have to find it.
 */
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ReportsWorkspace } from '@/components/reports/ReportsWorkspace'

export const dynamic = 'force-dynamic'

export default async function ReturnsAccountPage() {
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
          <h1 className="page-title">Returns</h1>
          <p className="page-subtitle">Account view</p>
        </div>
      </div>

      <ReportsWorkspace
        shopName={tenant?.shop_name ?? 'LoanPro'}
        initialKey="account"
        initialAccountType="Returns"
        lockToInitial
      />
    </div>
  )
}
