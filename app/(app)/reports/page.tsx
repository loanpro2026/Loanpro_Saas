import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ReportsWorkspace } from '@/components/reports/ReportsWorkspace'
import { REPORTS, type ReportKey } from '@/lib/reports'

export const dynamic = 'force-dynamic'

/**
 * Validated against the real list rather than cast. The Quick Reports panel on
 * the dashboard links here with ?key=inventory and ?key=location, and a bad or
 * hand-typed key should fall back to the daily book, not select nothing.
 */
function reportKey(raw?: string): ReportKey {
  return REPORTS.some(r => r.key === raw) ? (raw as ReportKey) : 'daily'
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>
}) {
  const { key } = await searchParams
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

      <ReportsWorkspace
        shopName={tenant?.shop_name ?? 'LoanPro'}
        initialKey={reportKey(key)}
      />
    </div>
  )
}
