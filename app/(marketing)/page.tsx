import Link from 'next/link'
import {
  ArrowRight, Check, Search, Camera, Wallet, FileBarChart,
  CloudOff, Smartphone, ShieldCheck, Users,
} from 'lucide-react'
import { FaqSection } from '@/components/marketing/FaqSection'

export const metadata = {
  title: 'LoanPro — Gold & silver loan management, in your browser',
  description:
    'Manage gold and silver loans, deposits, cash and reports from any device. ' +
    'Built for Indian pawn shops. Nothing to install.',
}

/**
 * Landing page.
 *
 * Same design language as the desktop product's site, but the copy sells a
 * web app — no download links, no Windows requirements, no MySQL setup. The
 * things that were selling points for the desktop version ("runs on your own
 * machine") are exactly what this replaces, so leaning on them would be
 * confusing.
 */
export default function HomePage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(67,56,202,0.07),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(245,158,11,0.08),transparent_40%)]" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-16 lg:pt-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-primary-50 px-4 py-1.5 text-sm font-semibold text-primary-700">
                Built for gold &amp; silver lending
              </div>

              <h1 className="mt-6 text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-slate-900 leading-[1.1]">
                Your loan register,<br />on every device
              </h1>

              <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-lg">
                Record loans, take deposits, close records and print your daily
                books — from the counter machine, your phone, or home. Nothing
                to install and nothing to back up yourself.
              </p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-lg">
                {[
                  'Free for 60 days',
                  'Your data stays yours',
                  'Hindi + English support',
                ].map(t => (
                  <div
                    key={t}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                  >
                    {t}
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-3 max-w-lg">
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-700 px-6 py-3 font-semibold text-white hover:bg-primary-800 transition-colors"
                >
                  Start free trial
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/support"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-6 py-3 font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-900 transition-colors"
                >
                  Talk to us first
                </Link>
              </div>

              <p className="mt-4 text-xs text-slate-500">
                No card needed to start. Already using the desktop app?{' '}
                <Link href="/support" className="text-primary-700 underline">
                  We&rsquo;ll move your records across for you.
                </Link>
              </p>
            </div>

            {/* Product sketch — a real screen's structure rather than a stock
                illustration, so what you see is what you get. */}
            <div className="relative hidden lg:block">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="ml-2 text-xs text-slate-400">Loan #4471</span>
                </div>
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">Ramesh Kumar</p>
                      <p className="text-xs text-slate-500">S/o Suresh · Sadar Bazaar</p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                      active
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    {[
                      ['Principal', '₹45,000'],
                      ['Deposits', '₹5,000'],
                      ['Outstanding', '₹40,000'],
                      ['Held', '6 months'],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <p className="text-[10px] text-slate-500">{k}</p>
                        <p className="text-sm font-semibold text-slate-900 tabular-nums">{v}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl bg-slate-50 p-3 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>22K Necklace</span><span>12.500g</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Interest if closed today</span>
                      <span className="tabular-nums">₹8,078</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
                      <span>Customer pays</span>
                      <span className="tabular-nums">₹48,078</span>
                    </div>
                  </div>

                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full w-[11%] bg-emerald-500" />
                  </div>
                  <p className="text-[10px] text-slate-500">11% of principal repaid</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust strip ──────────────────────────────────────────────────── */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                title: 'Your records are private',
                body: 'Each shop’s data is isolated at the database level. Customer photos are never publicly accessible.',
              },
              {
                icon: CloudOff,
                title: 'Keeps working without internet',
                body: 'Look up a customer and record a deposit with the connection down. Everything syncs when it returns.',
              },
              {
                icon: Wallet,
                title: 'Take your data out anytime',
                body: 'One click downloads every loan, deposit and photo as plain files. No lock-in.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-3">
                <Icon className="h-5 w-5 text-primary-700 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{title}</p>
                  <p className="text-sm text-slate-600 mt-0.5">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
            Everything the counter needs
          </h2>
          <p className="mt-3 text-slate-600">
            The same work you do today — the register, the cash book, the daily
            report — without the paper and without being tied to one machine.
          </p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Search,
              title: 'Find any record instantly',
              body: 'Type the number from the ticket, or the customer’s name, or their father’s name, or the village. Results as you type.',
            },
            {
              icon: Camera,
              title: 'Customer photos',
              body: 'Capture from the browser or from a paired phone. Make it compulsory before a loan is issued or closed.',
            },
            {
              icon: Wallet,
              title: 'Cash book that adds up',
              body: 'Money in, money out, deposits and settlements — the closing balance is calculated, not typed.',
            },
            {
              icon: FileBarChart,
              title: 'The reports you already print',
              body: 'Daily, investment, returns, inventory, by location, and account summaries. Export to PDF or Excel.',
            },
            {
              icon: Smartphone,
              title: 'Works on the phone',
              body: 'Check a customer’s record while you are away from the shop. Same data, no separate app.',
            },
            {
              icon: Users,
              title: 'Add your staff',
              body: 'Give the person at the counter their own login. Only owners can close, delete or change the plan.',
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-slate-300 transition-colors"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-50">
                <Icon className="h-5 w-5 text-primary-700" />
              </span>
              <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
              <p className="mt-1.5 text-sm text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Moving across ────────────────────────────────────────────────── */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
                Already using the desktop app?
              </h2>
              <p className="mt-3 text-slate-600">
                We move your records across for you — every loan, deposit, cash
                entry and photo, with your loan numbers unchanged. The numbers
                written on your tickets stay correct.
              </p>
              <p className="mt-3 text-slate-600">
                We rehearse from a copy first. At final cutover, desktop entry
                stops only for the overnight reconciliation window, then the
                web application becomes the single live system.
              </p>
              <Link
                href="/support"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-800 transition-colors"
              >
                Ask us to move your data
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <ol className="space-y-4">
              {[
                ['We rehearse from a copy', 'Read-only. Your desktop database is never modified.'],
                ['You check the totals', 'Loan count, outstanding, cash in hand — side by side, old against new.'],
                ['We make one final cutover', 'Usually overnight, with no dual-entry period to create conflicting records.'],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white border border-slate-200 text-sm font-semibold text-primary-700">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-slate-900">{title}</p>
                    <p className="text-sm text-slate-600 mt-0.5">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <p className="mt-8 text-xs text-slate-500 max-w-2xl">
            One thing to know: fingerprint capture is not part of the SaaS
            application. Customer photos work directly on mobile devices.
          </p>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section id="pricing" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
            Testing access
          </h2>
          <p className="mt-3 text-slate-600">
            Start with 60 days free. Payments and final paid-plan limits are not active during testing.
          </p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {[
            {
              name: 'Trial',
              price: 'Free',
              period: 'for 60 days',
              body: 'The complete owner experience, so you can judge it properly.',
              features: ['Unlimited loan records', 'Owner access', 'All reports', 'Full support'],
            },
            {
              name: 'Production plans',
              price: 'Coming later',
              period: 'after testing',
              body: 'Pricing, staff access and device allowances will be finalized from real usage.',
              features: ['No payment during testing', 'Plan-based device controls', 'In-app Razorpay checkout later', 'Your records remain exportable'],
              featured: true,
            },
          ].map(p => (
            <div
              key={p.name}
              className={`rounded-2xl border p-6 ${
                p.featured
                  ? 'border-primary-200 bg-primary-50/40 ring-1 ring-primary-100'
                  : 'border-slate-200 bg-white'
              }`}
            >
              {p.featured && (
                <span className="inline-block rounded-full bg-primary-700 px-2.5 py-0.5 text-xs font-semibold text-white">
                  Planned
                </span>
              )}
              <h3 className={`font-semibold text-slate-900 ${p.featured ? 'mt-3' : ''}`}>
                {p.name}
              </h3>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold text-slate-900">{p.price}</span>
                <span className="text-sm text-slate-500">{p.period}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{p.body}</p>

              <ul className="mt-5 space-y-2">
                {p.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                    <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href="/register"
                className={`mt-6 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
                  p.featured
                    ? 'bg-primary-700 text-white hover:bg-primary-800'
                    : 'border border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                Start free trial
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-6 text-sm text-slate-500">
          Before paid plans go live, pricing and limits will be published clearly.
          If a subscription later lapses, existing records remain readable and exportable.
        </p>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <FaqSection />

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <section className="border-t border-slate-200 bg-primary-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold text-white">
            Try it with your own records
          </h2>
          <p className="mt-3 text-primary-200 max-w-xl mx-auto">
            Sixty days, everything included, no card. If you are moving from
            the desktop app we will bring your data across so you are judging it
            properly, not with an empty screen.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 font-semibold text-primary-900 hover:bg-primary-50 transition-colors"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/support"
              className="inline-flex items-center justify-center rounded-lg border border-primary-700 px-6 py-3 font-semibold text-white hover:bg-primary-900 transition-colors"
            >
              Ask a question
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
