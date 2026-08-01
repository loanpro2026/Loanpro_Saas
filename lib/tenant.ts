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
