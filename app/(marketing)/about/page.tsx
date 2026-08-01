import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export const metadata = {
  title: 'About — LoanPro',
  description: 'Who builds LoanPro and why.',
}

/**
 * About.
 *
 * Exists partly because the footer links to it and partly because payment
 * gateways expect a real business address and identity before approving a
 * live account. Kept short and factual — a shop owner reading this wants to
 * know who they are trusting with their loan book, not a mission statement.
 */
export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
        About LoanPro
      </h1>

      <div className="mt-8 space-y-6 text-slate-700 leading-relaxed">
        <p>
          LoanPro is software for gold and silver lending businesses in India.
          It started as a Windows application that shops run on the counter
          machine, and it is still in daily use in that form.
        </p>

        <p>
          This is the web version. It does the same job — the loan register, the
          cash book, the daily reports — without being tied to one computer, and
          without anyone having to think about database backups.
        </p>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Why we built it</h2>
          <p>
            Shops were asking for two things the desktop version could not give
            them: seeing their records from somewhere other than the shop, and
            not being one hard-drive failure away from losing years of history.
          </p>
          <p>
            Everything else stayed the same on purpose. If you have used the
            desktop app, the way loans, deposits and the daily report work here
            will be familiar — because it is the same logic, carefully ported
            rather than reinvented.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">How we work</h2>
          <p>
            We move shops across one at a time, by hand, and check the totals
            with the owner before anything is switched over. Your desktop app
            keeps working the whole time.
          </p>
          <p>
            We would rather have a small number of shops whose books we know are
            correct than a large number we have never spoken to.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Contact</h2>
          <p>
            Support and sales run Monday to Saturday, 10am&ndash;7pm IST, in
            Hindi or English.
          </p>
          <Link
            href="/support"
            className="inline-flex items-center gap-2 text-primary-700 font-medium hover:underline"
          >
            Get in touch <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </div>
    </div>
  )
}
