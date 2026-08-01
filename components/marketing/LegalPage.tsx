import type { ReactNode } from 'react'

/**
 * Shared shell for the policy pages.
 *
 * These exist for two reasons: Razorpay will not approve a live account
 * without reachable terms, privacy, refund and contact pages — and a shop
 * handing over their loan book deserves to read plainly what happens to it.
 *
 * Written in the same voice as the rest of the product rather than in legal
 * boilerplate nobody reads.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated {updated}</p>

      <div className="mt-8 space-y-6 text-slate-700 leading-relaxed">
        {children}
      </div>

      <div className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm text-slate-700">
          If anything here is unclear, ask us — we would rather explain it than
          have you agree to something you have not understood.
        </p>
        <a
          href="/support"
          className="mt-2 inline-block text-sm font-medium text-primary-700 underline"
        >
          Contact us
        </a>
      </div>
    </article>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  )
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 pl-5 list-disc marker:text-slate-400">
      {items.map(i => <li key={i}>{i}</li>)}
    </ul>
  )
}
