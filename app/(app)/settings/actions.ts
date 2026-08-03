'use server'
/**
 * Settings, staff and plan actions.
 *
 * Every one of these is enforced in Postgres (migration 011) — role checks,
 * seat limits, the "a shop must keep an owner" rule. These wrappers exist to
 * validate input and produce readable errors, not to be the security boundary.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/tenant'
import { WRITABLE_SETTINGS } from '@/lib/settings'

export interface ActionResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

const fail = (error: string) => ({ ok: false, error })

function friendly(err: { message?: string } | null): string {
  const raw = err?.message ?? 'Something went wrong'
  // The database messages here are already written for a shop owner to read.
  if (/only the shop owner|already has access|at least one owner|remove yourself|plan allows|does not look like an email|not in this shop/i.test(raw)) {
    return raw
  }
  if (/duplicate key/i.test(raw)) return 'That person has already been invited.'
  return raw
}

// ─── Shop ───────────────────────────────────────────────────────────────────

export async function updateShopName(name: string): Promise<ActionResult> {
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in')

  const clean = name.trim()
  if (!clean) return fail('Shop name cannot be empty')
  if (clean.length > 120) return fail('Shop name is too long')

  const supabase = await createClient()
  // Column-level grants (migration 003) mean only shop_name is writable here —
  // an attempt to slip `plan` into this update would be rejected by Postgres.
  const { error } = await supabase
    .from('tenants').update({ shop_name: clean }).eq('id', ctx.tenantId)

  if (error) return fail(friendly(error))
  revalidatePath('/settings')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function updateMyName(name: string): Promise<ActionResult> {
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in')

  const clean = name.trim()
  if (!clean) return fail('Name cannot be empty')

  const supabase = await createClient()
  const { error } = await supabase
    .from('users').update({ full_name: clean }).eq('id', ctx.userId)

  if (error) return fail(friendly(error))
  revalidatePath('/settings')
  return { ok: true }
}

// ─── Staff ──────────────────────────────────────────────────────────────────

export async function inviteStaff(
  email: string,
  role: 'owner' | 'staff'
): Promise<ActionResult<{ token: string; email: string }>> {
  if (process.env.STAFF_ACCESS_ENABLED !== 'true') {
    return fail('Staff accounts are not enabled yet') as ActionResult<{ token: string; email: string }>
  }
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in') as ActionResult<{ token: string; email: string }>

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('invite_staff', {
    p_email: email,
    p_role: role,
  })

  if (error) return fail(friendly(error)) as ActionResult<{ token: string; email: string }>

  revalidatePath('/settings')
  // The token is returned so the owner can pass on the link themselves. There
  // is no transactional email set up yet, and inventing one silently would
  // mean invitations that never arrive.
  return { ok: true, data: data as { token: string; email: string } }
}

export async function revokeStaff(userId: string): Promise<ActionResult> {
  if (process.env.STAFF_ACCESS_ENABLED !== 'true') return fail('Staff accounts are not enabled yet')
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in')

  const supabase = await createClient()
  const { error } = await supabase.rpc('revoke_staff', { p_user_id: userId })

  if (error) return fail(friendly(error))
  revalidatePath('/settings')
  return { ok: true }
}

export async function cancelInvitation(id: string): Promise<ActionResult> {
  if (process.env.STAFF_ACCESS_ENABLED !== 'true') return fail('Staff accounts are not enabled yet')
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in')
  if (ctx.role !== 'owner') return fail('Only the shop owner can cancel invitations')

  const supabase = await createClient()
  const { error } = await supabase.from('user_invitations').delete().eq('id', id)

  if (error) return fail(friendly(error))
  revalidatePath('/settings')
  return { ok: true }
}

// ─── Preferences ────────────────────────────────────────────────────────────

export async function saveSetting(key: string, value: unknown): Promise<ActionResult> {
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in')

  // Whitelisted against the ported desktop settings. Anything outside the set
  // is rejected rather than letting tenant_settings become a dumping ground.
  if (!(WRITABLE_SETTINGS as readonly string[]).includes(key)) {
    return fail(`Unknown setting: ${key}`)
  }

  if (key === 'theme' && value !== 'light' && value !== 'dark') {
    return fail('Theme must be light or dark')
  }
  if (key === 'photo_capture_mode' && value !== 'automatic' && value !== 'off') {
    return fail('Photo capture mode must be automatic or off')
  }

  // The interest rate drives every settlement in the shop, so a fat-fingered
  // 3600 would be expensive. Bound it.
  if (key === 'interest_percentage') {
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0 || n > 500) {
      return fail('Interest rate must be between 0 and 500% per year')
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_setting', {
    p_key: key,
    p_value: value as never,
  })

  if (error) return fail(friendly(error))
  revalidatePath('/settings')
  return { ok: true }
}
