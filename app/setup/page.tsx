/**
 * Finish setting up a shop.
 *
 * Reached only when someone holds a valid session but has no shop behind it,
 * and automatic provisioning could not fix it — which in practice means the
 * account was created without the shop-name metadata.
 *
 * This route exists mainly so that case has somewhere to land. Sending them to
 * /register instead would bounce: the middleware redirects signed-in users off
 * /register to /dashboard, and /dashboard would send them back again.
 *
 * NOTE the location: app/setup, NOT app/(app)/setup. The (app) layout is the
 * thing that redirects here when a shop is missing, so putting this page inside
 * that group would have it redirect to itself — the same loop, one level down.
 */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SetupForm } from '@/components/setup/SetupForm'

export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Already provisioned — nothing to do here.
  const { data: existing, error: lookupError } = await supabase
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()
  if (lookupError) throw new Error(`Workspace status could not be checked: ${lookupError.message}`)
  if (existing) redirect('/dashboard')

  const meta = user.user_metadata ?? {}

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <div className="card w-full max-w-md space-y-5">
        <div>
          <div className="mb-4 grid h-9 w-9 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white dark:bg-white dark:text-slate-950">LP</div>
          <h1 className="text-xl font-bold text-slate-900">One more step</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Your account is confirmed. Tell us your shop name and we will finish
            setting things up.
          </p>
        </div>

        <SetupForm
          defaultShopName={String(meta.shop_name ?? '')}
          defaultFullName={String(meta.full_name ?? '')}
          email={user.email ?? ''}
        />
      </div>
    </div>
  )
}
