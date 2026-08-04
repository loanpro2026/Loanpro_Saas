'use server'
/**
 * Server actions for loans and deposits.
 *
 * The multi-table work (closing a loan, recording a deposit, moving cash)
 * lives in Postgres functions from migration 007, not here. Closing a loan
 * touches five tables and shifts a running cash balance; doing that over
 * several round trips from a serverless function means a cold start or a
 * dropped connection can leave a shop's books half-updated.
 *
 * These wrappers exist to validate input, call the function, revalidate the
 * affected pages, and turn database errors into something a shop owner can
 * act on.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/tenant'
import type { JsonObject } from '@/lib/json'
import { withDefaults } from '@/lib/settings'

export interface ActionResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

const fail = (error: string): ActionResult => ({ ok: false, error })

/**
 * Postgres errors are precise but not readable. `close_loan` raising
 * 'Loan 4471 is already closed' is useful; 'duplicate key value violates
 * unique constraint "loans_pkey"' is not.
 */
function friendlyError(err: { message?: string; code?: string } | null): string {
  const raw = err?.message ?? 'Something went wrong'
  if (/already closed/i.test(raw))            return 'This loan is already closed.'
  if (/not found/i.test(raw))                 return 'That record no longer exists. Refresh and try again.'
  if (/before the issue date/i.test(raw))     return raw
  if (/before the loan was issued/i.test(raw)) return raw
  if (/greater than zero/i.test(raw))         return raw
  if (/closed loan/i.test(raw))               return 'You cannot add a deposit to a closed loan.'
  if (/Not authenticated/i.test(raw))         return 'Your session expired. Please sign in again.'
  if (err?.code === '23505')                  return 'That record already exists.'
  if (err?.code === '23503')                  return 'Related record missing — refresh and try again.'
  return raw
}

function revalidateLoan(loanId?: number) {
  revalidatePath('/loans')
  revalidatePath('/dashboard')
  revalidatePath('/deposits')
  revalidatePath('/cash')
  if (loanId) revalidatePath(`/loans/${loanId}`)
}

// ─── Creating ───────────────────────────────────────────────────────────────

export async function createLoan(
  /**
   * Goes into `create_loan(p_loan jsonb)`, so it must be JSON-serialisable.
   * `Record<string, unknown>` would have accepted a Date or a Map and let
   * Postgres receive something unintended.
   */
  loan: JsonObject
): Promise<ActionResult<number>> {
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in') as ActionResult<number>

  const supabase = await createClient()
  const { data: rawSettings } = await supabase.rpc('my_settings')
  const settings = withDefaults(rawSettings)
  const governedLoan: JsonObject = { ...loan }
  if (!settings.add_record_address_field_enabled) governedLoan.address = null
  if (!settings.add_record_additional_information_field_enabled) governedLoan.additional_information = null
  // create_loan stamps tenant_id from the session, logs the activity and
  // recalculates the cash summary in one transaction — a plain client-side
  // insert would leave that day's `investments` stale.
  const { data, error } = await supabase.rpc('create_loan', { p_loan: governedLoan })

  if (error) return fail(friendlyError(error)) as ActionResult<number>
  revalidateLoan()
  return { ok: true, data: data as number }
}

// ─── Closing ────────────────────────────────────────────────────────────────

export async function closeLoan(
  loanId: number,
  interest: number,
  closedDate?: string
): Promise<ActionResult> {
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in')

  if (!Number.isInteger(loanId) || loanId <= 0) return fail('Invalid loan')
  if (!Number.isFinite(interest) || interest < 0) {
    return fail('Interest must be zero or more')
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('close_loan_with_photo_policy', {
    p_loan_id: loanId,
    p_interest: Math.round(interest),
    p_closed_date: closedDate ?? null,
  })

  if (error) return fail(friendlyError(error))

  const closeResult = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {}
  const retiredPhotoKey = typeof closeResult.retired_photo_key === 'string'
    ? closeResult.retired_photo_key
    : null
  if (retiredPhotoKey) {
    const { deleteObject } = await import('@/lib/r2')
    await deleteObject(retiredPhotoKey).catch(error =>
      console.error('[closeLoan] orphaned retired R2 object', retiredPhotoKey, error))
  }
  revalidateLoan(loanId)
  return { ok: true, data }
}

export async function reopenLoan(loanId: number): Promise<ActionResult> {
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in')

  // Reopening rewrites cash history, so keep it to owners.
  if (ctx.role !== 'owner') return fail('Only the shop owner can reopen a closed loan')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('reopen_loan_with_photo_policy', { p_loan_id: loanId })

  if (error) return fail(friendlyError(error))
  revalidateLoan(loanId)
  return { ok: true, data }
}

/**
 * Permanent delete. Distinct from closing: closing is the normal end of a
 * loan's life and preserves history, deleting is for a record entered by
 * mistake. Owners only, and the UI asks for the loan number to be typed.
 */
export async function deleteLoan(loanId: number): Promise<ActionResult> {
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in')
  if (ctx.role !== 'owner') return fail('Only the shop owner can delete a loan')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('delete_loan', { p_loan_id: loanId })
  if (error) return fail(friendlyError(error))

  // The database transaction returns storage keys for cleanup after commit.
  // A storage failure can leave an unreachable object, never partial books.
  const result = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {}
  const photoKeys = Array.isArray(result.photo_keys)
    ? result.photo_keys.filter((key): key is string => typeof key === 'string')
    : []
  if (photoKeys.length) {
    const { deleteObject } = await import('@/lib/r2')
    for (const key of photoKeys) {
      await deleteObject(key).catch(e =>
        console.error('[deleteLoan] orphaned R2 object', key, e))
    }
  }

  revalidateLoan()
  revalidatePath('/day-end')
  revalidatePath('/reports')
  return { ok: true }
}

// ─── Editing ────────────────────────────────────────────────────────────────

// Mirrors the desktop's updateRecord(). `interest` is deliberately absent:
// it is the amount charged at closing, written only by close_loan().
const EDITABLE = [
  'name', 'father_name', 'location', 'address', 'additional_information',
  'category_type', 'detailed_type', 'weight', 'amount',
  'issue_date',
] as const

export async function updateLoan(
  loanId: number,
  patch: Record<string, unknown>
): Promise<ActionResult> {
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in')

  // Whitelist: never let a client patch tenant_id, status or closed_date
  // directly — status transitions go through close_loan/reopen_loan so the
  // cash summary stays in step.
  const clean: Record<string, unknown> = {}
  for (const key of EDITABLE) {
    if (key in patch) clean[key] = patch[key] === '' ? null : patch[key]
  }
  if (Object.keys(clean).length === 0) return fail('Nothing to update')

  if (clean.amount !== undefined && Number(clean.amount) <= 0) {
    return fail('Amount must be greater than zero')
  }

  const supabase = await createClient()
  const { data: rawSettings } = await supabase.rpc('my_settings')
  const settings = withDefaults(rawSettings)
  if (!settings.add_record_address_field_enabled) delete clean.address
  if (!settings.add_record_additional_information_field_enabled) delete clean.additional_information
  const { error } = await supabase.rpc('update_active_loan', {
    p_loan_id: loanId,
    p_patch: clean as JsonObject,
  })
  if (error) return fail(friendlyError(error))

  revalidateLoan(loanId)
  revalidatePath('/day-end')
  revalidatePath('/reports')
  return { ok: true }
}

/**
 * Correct a settled loan.
 *
 * Separate from updateLoan because this can change the interest charged, the
 * closing date and the amount — all of which feed historical reports. The
 * Postgres function re-chains the cash summary from the earliest affected
 * date and keeps the end-of-day snapshot in step.
 *
 * Owners only: this rewrites figures the shop may already have printed.
 */
export async function updateClosedRecord(
  loanId: number,
  /** Applied by `update_closed_record(p_patch jsonb)` — JSON values only. */
  patch: JsonObject
): Promise<ActionResult> {
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in')
  if (ctx.role !== 'owner') {
    return fail('Only the shop owner can correct a settled loan')
  }

  const supabase = await createClient()
  const { data: rawSettings } = await supabase.rpc('my_settings')
  const settings = withDefaults(rawSettings)
  const governedPatch: JsonObject = { ...patch }
  if (!settings.add_record_address_field_enabled) delete governedPatch.address
  if (!settings.add_record_additional_information_field_enabled) delete governedPatch.additional_information
  const { data, error } = await supabase.rpc('update_closed_record', {
    p_loan_id: loanId,
    p_patch: governedPatch,
  })

  if (error) return fail(friendlyError(error))
  revalidateLoan(loanId)
  revalidatePath('/day-end')
  revalidatePath('/reports')
  return { ok: true, data }
}

/**
 * Remarks are append-only in the desktop app — a running log of what happened
 * with a customer, each entry dated. Preserving that shape matters: shop
 * owners use it as an audit trail, and an editable free-text box is not one.
 */
export async function appendRemark(loanId: number, text: string): Promise<ActionResult> {
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in')

  const body = text.trim()
  if (!body) return fail('Remark cannot be empty')
  if (body.length > 2000) return fail('Remark is too long')

  const supabase = await createClient()
  const { error } = await supabase.rpc('append_loan_remark', {
    p_loan_id: loanId,
    p_text: body,
  })
  if (error) return fail(friendlyError(error))

  revalidateLoan(loanId)
  return { ok: true }
}

export async function deleteRemark(loanId: number, index: number, expected: string): Promise<ActionResult> {
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in')

  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_loan_remark', {
    p_loan_id: loanId,
    p_index: index,
    p_expected: expected,
  })
  if (error) return fail(friendlyError(error))

  revalidateLoan(loanId)
  return { ok: true }
}

// ─── Deposits ───────────────────────────────────────────────────────────────

export async function addDeposit(
  loanId: number, amount: number, date?: string
): Promise<ActionResult> {
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in')
  if (!Number.isFinite(amount) || amount <= 0) return fail('Deposit must be more than zero')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('add_deposit', {
    p_loan_id: loanId,
    p_amount: Math.round(amount),
    p_date: date ?? null,
  })

  if (error) return fail(friendlyError(error))
  revalidateLoan(loanId)
  return { ok: true, data }
}

export async function deleteDeposit(depositId: number, loanId: number): Promise<ActionResult> {
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in')

  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_deposit', { p_deposit_id: depositId })

  if (error) return fail(friendlyError(error))
  revalidateLoan(loanId)
  return { ok: true }
}

export async function updateDeposit(
  depositId: number, loanId: number, amount: number, date: string
): Promise<ActionResult> {
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in')
  if (!Number.isFinite(amount) || amount <= 0) return fail('Deposit must be more than zero')

  const supabase = await createClient()
  // update_deposit (migration 014) also fixes up the day's working row and
  // re-chains the cash summary from whichever date is earlier — editing a
  // deposit can move it between days.
  const { error } = await supabase.rpc('update_deposit', {
    p_deposit_id: depositId,
    p_amount: Math.round(amount),
    p_date: date,
  })

  if (error) return fail(friendlyError(error))
  revalidateLoan(loanId)
  return { ok: true }
}

// ─── Cash ───────────────────────────────────────────────────────────────────

export async function recordCash(
  type: 'add' | 'remove', amount: number, reason: string, date?: string
): Promise<ActionResult> {
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in')
  if (!Number.isFinite(amount) || amount <= 0) return fail('Amount must be more than zero')
  if (!reason.trim()) return fail('Please give a reason')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('record_cash_transaction', {
    p_type: type,
    p_amount: amount,
    p_reason: reason.trim(),
    p_date: date ?? null,
  })

  if (error) return fail(friendlyError(error))
  revalidatePath('/cash')
  revalidatePath('/dashboard')
  return { ok: true, data }
}
