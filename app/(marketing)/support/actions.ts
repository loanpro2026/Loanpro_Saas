'use server'
/**
 * Contact form submission.
 *
 * Enquiries go into a table rather than an email, so nothing is lost to a spam
 * folder and you can see them all in one place. Written with the service role
 * because the sender is not signed in.
 */
import { createServiceClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import type { Tables } from '@/types/supabase'

export interface EnquiryResult {
  ok: boolean
  error?: string
}

interface Enquiry {
  name: string
  email: string
  phone: string
  shop: string
  reason: string
  message: string
}

/**
 * The reasons the `enquiries.reason` CHECK constraint permits.
 *
 * `satisfies` ties this list to the column: add a reason in SQL without adding
 * it here and the two drift silently, with the form quietly filing everything
 * new under "other". Written as a `const` tuple rather than `string[]` so that
 * `isReason` can actually narrow — a plain array's `.includes()` returns a
 * boolean that tells TypeScript nothing.
 */
type Reason = Tables<'enquiries'>['reason']

const REASONS = ['migration', 'sales', 'problem', 'billing', 'other'] as const satisfies readonly Reason[]

const isReason = (v: string): v is Reason =>
  (REASONS as readonly string[]).includes(v)

export async function submitEnquiry(data: Enquiry): Promise<EnquiryResult> {
  const name = data.name?.trim() ?? ''
  const email = data.email?.trim().toLowerCase() ?? ''
  const phone = data.phone?.trim() ?? ''
  const message = data.message?.trim() ?? ''
  const reason = isReason(data.reason) ? data.reason : 'other'

  if (!name) return { ok: false, error: 'Please tell us your name' }
  if (!email && !phone) {
    return { ok: false, error: 'Leave an email or a phone number so we can reply' }
  }
  if (!message) return { ok: false, error: 'Please tell us what you need' }

  // Bounds rather than validation theatre — an email that looks odd is still
  // worth receiving, but a 50KB message is a bot.
  if (name.length > 120 || message.length > 5000) {
    return { ok: false, error: 'That is longer than we can accept' }
  }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: 'That email address does not look right' }
  }

  try {
    const supabase = createServiceClient()

    // Rate limit per IP. A public unauthenticated write needs some floor, and
    // five an hour is far above what a real person would send.
    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

    if (ip) {
      const { count } = await supabase
        .from('enquiries')
        .select('id', { count: 'exact', head: true })
        .eq('ip', ip)
        .gte('created_at', new Date(Date.now() - 3600_000).toISOString())

      if ((count ?? 0) >= 5) {
        return { ok: false, error: 'Too many messages just now — please try again later' }
      }
    }

    const { error } = await supabase.from('enquiries').insert({
      name, email: email || null, phone: phone || null,
      shop_name: data.shop?.trim() || null,
      reason, message, ip,
    })

    if (error) {
      console.error('[enquiry]', error.message)
      return { ok: false, error: 'Could not send just now — please try again' }
    }

    return { ok: true }
  } catch (err) {
    console.error('[enquiry]', err)
    return { ok: false, error: 'Could not send just now — please try again' }
  }
}
