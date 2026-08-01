import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ReportsWorkspace } from '@/components/reports/ReportsWorkspace'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // The shop name goes on every printed report — an accountant receiving three
  // PDFs from three clients needs to know whose books they are looking at.
  const { data: appUser } = await supabase
    .from('users').select('tenant_id').eq('auth_id', user.id).single()
  const { data: tenant } = appUser
    ? await supabase.from('tenants').select('shop_name').eq('id', appUser.tenant_id).single()
    : { data: null }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Daily books, investments, returns and stock</p>
        </div>
      </div>

      <ReportsWorkspace shopName={tenant?.shop_name ?? 'LoanPro'} />
    </div>
  )
}
