import { createClient } from '@/lib/supabase/server'
import { asObject } from '@/lib/json'
import { redirect } from 'next/navigation'
import { SettingsWorkspace } from '@/components/settings/SettingsWorkspace'
import { withDefaults } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const staffAccessEnabled = process.env.STAFF_ACCESS_ENABLED === 'true'
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
    staffAccessEnabled ? supabase.rpc('shop_members') : Promise.resolve({ data: [], error: null }),
    supabase.rpc('my_settings'),
  ])

  if (!appUser) redirect('/login')

  const { data: tenant } = await supabase
    .from('tenants').select('shop_name').eq('id', appUser.tenant_id).single()


  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">{tenant?.shop_name} · business preferences, identity, devices and data</p>
        </div>
      </div>

      {/* shop_members() is RETURNS TABLE, so every column types as nullable.
          Normalised below so SettingsWorkspace keeps its non-null Member type. */}
      <SettingsWorkspace
        me={appUser}
        shopName={tenant?.shop_name ?? ''}
        plan={asObject(plan)}
        members={(members ?? []).map(mem => ({
          id:         mem.id ?? '',
          full_name:  mem.full_name ?? '',
          email:      mem.email ?? '',
          role:       mem.role ?? 'staff',
          created_at: mem.created_at ?? '',
          is_me:      mem.is_me ?? false,
        }))}
        settings={withDefaults(settings)}
        staffAccessEnabled={staffAccessEnabled}
      />
    </div>
  )
}
