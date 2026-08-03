import { Mail, MessageCircle, Clock, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { ContactForm } from '@/components/marketing/ContactForm'

export const metadata = {
  title: 'Support — LoanPro',
  description: 'Get help with LoanPro, or ask us to move your desktop records across.',
}

/**
 * Support and contact.
 *
 * Also the page the marketing copy sends people to for migration, so the
 * contact form has a reason field that distinguishes "I want to move my data"
 * from "something is broken" — those go to different places in practice.
 */
export default function SupportPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Get in touch
        </h1>
        <p className="mt-3 text-slate-600">
          Whether something is broken, you are deciding whether to switch, or
          you want your desktop records moved across — write to us and a person
          will reply.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ContactForm />
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <Clock className="h-5 w-5 text-primary-700" />
            <h2 className="mt-3 font-semibold text-slate-900">When we reply</h2>
            <p className="mt-1 text-sm text-slate-600">
              Monday to Saturday, 10am&ndash;7pm IST. Usually within a few
              hours, and always within two working days.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <MessageCircle className="h-5 w-5 text-primary-700" />
            <h2 className="mt-3 font-semibold text-slate-900">Hindi or English</h2>
            <p className="mt-1 text-sm text-slate-600">
              Write in whichever you prefer. We will reply in the same.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <Mail className="h-5 w-5 text-primary-700" />
            <h2 className="mt-3 font-semibold text-slate-900">Moving from the desktop app?</h2>
            <p className="mt-1 text-sm text-slate-600">
              We rehearse safely from a copy, then perform one final overnight
              cutover. Pick &ldquo;moving my records&rdquo; in the form and tell us
              roughly how many loans you have.
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 text-sm">Before you write</h2>
            <p className="mt-1 text-sm text-slate-600">
              Your question may already be answered.
            </p>
            <Link
              href="/#faq"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:underline"
            >
              Common questions <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
