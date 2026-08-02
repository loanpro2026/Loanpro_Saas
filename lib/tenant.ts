/**
 * Tenant resolution for server-side code.
 *
 * Every API route that touches tenant data starts here. Returning the tenant
 * id from the session — rather than trusting one sent by the client — is what
 * makes the rest of the request safe.
 */
import 'server-only'
import { createClient } from '@/lib/supabase/server'

export interface SessionContext {
  authId: string
  userId: string
  tenantId: string
  role: 'owner' | 'staff'
}

/**
 * Resolve the caller's tenant, or null if unauthenticated / unprovisioned.
 *
 * Uses getUser() rather than getSession(): getSession() reads the cookie
 * without verifying it against the auth server, so it must never be the basis
 * of an authorisation decision.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data: appUser } = await supabase
    .from('users')
    .select('id, tenant_id, role')
    .eq('auth_id', user.id)
    .single()

  if (!appUser) return null

  return {
    authId: user.id,
    userId: appUser.id,
    tenantId: appUser.tenant_id,
    role: appUser.role as 'owner' | 'staff',
  }
}

/** Throwing variant, for routes where absence is simply an error. */
export async function requireSessionContext(): Promise<SessionContext> {
  const ctx = await getSessionContext()
  if (!ctx) throw new UnauthorizedError()
  return ctx
}

export class UnauthorizedError extends Error {
  status = 401
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/**
 * Make sure the signed-in account actually has a shop behind it.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * Registration creates the auth user, then calls /api/auth/register to create
 * the `tenants` and `users` rows. But when email confirmation is on, signUp
 * returns NO SESSION — so the second step cannot run, and the register page
 * sends the person off to check their inbox instead.
 *
 * They confirm, they sign in, and they now hold a valid session for an account
 * with no shop. Every page then found no `users` row and redirected to
 * /register, while the middleware redirected any signed-in visitor away from
 * /register to /dashboard. The two bounced off each other until the browser
 * gave up, which presents as a blank white page — no error, nothing in the
 * console except the manifest being re-fetched on every hop.
 *
 * So provisioning happens here, on first authenticated load, from the metadata
 * `signUp` stored on the auth user. It is idempotent: provision_tenant() is a
 * no-op once the rows exist.
 *
 * Returns false only when there is genuinely nothing to work with — an account
 * created without the shop-name metadata, which needs a human, not a redirect.
 */
export async function ensureTenantProvisioned(): Promise<boolean> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: existing } = await supabase
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()
  if (existing) return true

  const meta = user.user_metadata ?? {}
  const shopName = String(meta.shop_name ?? '').trim()
  const fullName = String(meta.full_name ?? '').trim()

  if (!shopName || !fullName) {
    console.error('[tenant] cannot provision: signup metadata missing', {
      authId: user.id, hasShop: !!shopName, hasName: !!fullName,
    })
    return false
  }

  const { error } = await supabase.rpc('provision_tenant', {
    p_shop_name: shopName,
    p_full_name: fullName,
  })

  if (error) {
    console.error('[tenant] provision_tenant failed', error.message)
    return false
  }
  return true
}
