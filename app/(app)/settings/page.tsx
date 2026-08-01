import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsWorkspace } from '@/components/settings/SettingsWorkspace'
import { withDefaults } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: appUser },
    { data: plan },
    { data: members },
    { data: settings },
  ] = await Promise.all([
    supabase.from('users').select('id, full_name, email, role, tenant_id').eq('auth_id', user.id).single(),
    supabase.rpc('my_plan'),
    supabase.rpc('shop_members'),
    supabase.rpc('my_settings'),
  ])

  if (!appUser) redirect('/login')

  const { data: tenant } = await supabase
    .from('tenants').select('shop_name').eq('id', appUser.tenant_id).single()


  return (
    <div className="space-y-5 max-w-3xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">{tenant?.shop_name}</p>
        </div>
      </div>

      <SettingsWorkspace
        me={appUser}
        shopName={tenant?.shop_name ?? ''}
        plan={plan ?? {}}
        members={members ?? []}
        settings={withDefaults(settings)}
      />
    </div>
  )
}
