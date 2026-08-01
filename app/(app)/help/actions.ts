'use server'
/**
 * Support ticket actions.
 *
 * Ports the desktop's support system. Validation and limits live in the
 * Postgres functions (migration 016); these wrappers add bounds and readable
 * errors.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/tenant'
import type { JsonObject } from '@/lib/json'

export interface ActionResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

const fail = (error: string): ActionResult => ({ ok: false, error })

export async function createTicket(
  subject: string,
  body: string,
  category: string,
  /**
   * Goes straight into a `jsonb` column, so it must be JSON-serialisable.
   * `Record<string, unknown>` allowed anything — a Date, a Map, a function —
   * which would have been silently mangled on the way to Postgres. JsonObject
   * is the same shape the database actually accepts.
   */
  context: JsonObject = {}
): Promise<ActionResult<string>> {
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in') as ActionResult<string>

  if (!subject.trim()) return fail('Give it a short subject') as ActionResult<string>
  if (!body.trim())    return fail('Describe what is happening') as ActionResult<string>
  if (body.length > 10_000) {
    return fail('That is longer than we can accept — try summarising') as ActionResult<string>
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_ticket', {
    p_subject: subject.trim(),
    p_body: body.trim(),
    p_category: category,
    // Technical context only. Deliberately no customer records — a support
    // ticket should never carry someone's identity photo or loan details
    // into an inbox.
    p_context: context,
  })

  if (error) {
    console.error('[createTicket]', error.message)
    return fail(error.message) as ActionResult<string>
  }

  revalidatePath('/help')
  return { ok: true, data: data as string }
}

export async function replyToTicket(
  ticketId: string,
  body: string
): Promise<ActionResult> {
  const ctx = await getSessionContext()
  if (!ctx) return fail('Not signed in')
  if (!body.trim()) return fail('Message cannot be empty')
  if (body.length > 10_000) return fail('That is longer than we can accept')

  const supabase = await createClient()
  const { error } = await supabase.rpc('reply_to_ticket', {
    p_ticket_id: ticketId,
    p_body: body.trim(),
  })

  if (error) return fail(error.message)

  revalidatePath('/help')
  revalidatePath(`/help/${ticketId}`)
  return { ok: true }
}
