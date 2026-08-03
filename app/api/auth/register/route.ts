/**
 * POST /api/auth/register
 *
 * Provisions the tenant + owner user for a freshly signed-up account.
 * Body: { shop_name, full_name }
 *
 * Identity is taken from the verified session, never from the request body.
 * An earlier version accepted `auth_id` as a parameter, which let any caller
 * provision a tenant on behalf of another account.
 *
 * The actual work happens in the `provision_tenant()` Postgres function so
 * that the tenant row and the user row are created in a single transaction —
 * a partial failure here would otherwise leave an ownerless shop.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logServerError, rateLimit, requestId } from '@/lib/api-security'

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const limited = await rateLimit(req, {
    scope: 'auth.provision', limit: 5, windowSeconds: 600, identity: `user:${user.id}`,
  })
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const shopName = String(body?.shop_name ?? '').trim()
  const fullName = String(body?.full_name ?? '').trim()

  if (!shopName || !fullName) {
    return NextResponse.json(
      { error: 'Shop name and your name are both required' },
      { status: 400 }
    )
  }
  if (shopName.length > 120 || fullName.length > 120) {
    return NextResponse.json({ error: 'Name is too long' }, { status: 400 })
  }

  // Runs as the signed-in user; the function reads auth.uid() internally.
  const { data: tenantId, error } = await supabase.rpc('provision_tenant', {
    p_shop_name: shopName,
    p_full_name: fullName,
  })

  if (error) {
    logServerError('auth.provision.failed', error, {
      request_id: requestId(req), auth_id: user.id,
    })
    return NextResponse.json(
      { error: 'Could not finish setting up your shop. Please try again.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, tenant_id: tenantId })
}
