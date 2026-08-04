'use client'
/**
 * Contact form.
 *
 * The reason field matters: "move my records across" and "something is broken"
 * are different jobs handled by different people, and asking up front saves a
 * round trip. Enquiries land in a table rather than an inbox so nothing is
 * lost in a spam folder.
 */
import { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { userFacingError } from '@/lib/user-message'
import { Send, CheckCircle2 } from 'lucide-react'
import { submitEnquiry } from '@/app/(marketing)/support/actions'
import type { Tables } from '@/types/supabase'

/**
 * `satisfies` ties these to the `enquiries.reason` CHECK constraint. Without
 * it, adding an option here that SQL does not permit would compile fine and
 * then be silently filed as "other" by the server action — the enquiry still
 * arrives, but categorised wrongly, which is the sort of thing nobody notices
 * for months.
 */
const REASONS = [
  { value: 'migration', label: 'I want my desktop records moved across' },
  { value: 'sales',     label: 'Question before I sign up' },
  { value: 'problem',   label: 'Something is not working' },
  { value: 'billing',   label: 'Billing or subscription' },
  { value: 'other',     label: 'Something else' },
] as const satisfies readonly { value: Tables<'enquiries'>['reason']; label: string }[]

export function ContactForm() {
  const [pending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)

  const [form, setForm] = useState({
    name: '', email: '', phone: '', shop: '',
    reason: 'sales', message: '',
  })

  const set = (k: keyof typeof form) => (v: string) =>
    setForm(f => ({ ...f, [k]: v }))

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name.trim())  { toast.error('Enter your name so the support team knows who sent this enquiry.'); return }
    if (!form.email.trim() && !form.phone.trim()) {
      toast.error('Enter either an email address or phone number so the support team can reply.'); return
    }
    if (!form.message.trim()) { toast.error('Describe what you need before sending the enquiry.'); return }

    startTransition(async () => {
      const res = await submitEnquiry(form)
      if (res.ok) {
        toast.success(`Your ${form.reason} enquiry was received. We will reply using the contact detail you provided.`)
        setSent(true)
      } else toast.error(userFacingError(
        res.error,
        'Your enquiry was not sent. Your message remains in the form so you can retry.',
      ))
    })
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h2 className="mt-4 text-lg font-semibold text-slate-900">Message received</h2>
        <p className="mt-2 text-sm text-slate-600 max-w-sm mx-auto">
          We&rsquo;ll get back to you within two working days, usually sooner.
          If it is urgent and you left a phone number, we may call.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Your name" required>
          <input
            className="input" value={form.name} required
            onChange={e => set('name')(e.target.value)}
          />
        </Field>
        <Field label="Shop name">
          <input
            className="input" value={form.shop}
            onChange={e => set('shop')(e.target.value)}
          />
        </Field>
        <Field label="Email">
          <input
            className="input" type="email" value={form.email}
            onChange={e => set('email')(e.target.value)}
          />
        </Field>
        <Field label="Phone">
          <input
            className="input" type="tel" value={form.phone}
            placeholder="+91"
            onChange={e => set('phone')(e.target.value)}
          />
        </Field>
      </div>

      <p className="text-xs text-slate-500 -mt-1">
        Either an email or a phone number is enough — whichever you prefer.
      </p>

      <Field label="What is this about?" required>
        <select
          className="input" value={form.reason}
          onChange={e => set('reason')(e.target.value)}
        >
          {REASONS.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Tell us more" required>
        <textarea
          className="input min-h-32 resize-y"
          value={form.message}
          required
          placeholder={
            form.reason === 'migration'
              ? 'Roughly how many loans do you have, and when would suit you to switch?'
              : 'What do you need help with?'
          }
          onChange={e => set('message')(e.target.value)}
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-700 px-6 py-3 font-semibold text-white hover:bg-primary-800 disabled:opacity-60 transition-colors w-full sm:w-auto"
      >
        <Send className="h-4 w-4" />
        {pending ? 'Sending…' : 'Send message'}
      </button>

      <p className="text-xs text-slate-500">
        We use these details only to reply to you. Nothing else.
      </p>
    </form>
  )
}

function Field({
  label, required, children,
}: {
  label: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  )
}
