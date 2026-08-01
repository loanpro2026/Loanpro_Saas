'use client'
/**
 * Common questions.
 *
 * These are the objections a shop owner actually raises when asked to move
 * their loan book off a machine they can see — not generic SaaS FAQ filler.
 * Answering them honestly, including where the web version is worse, does more
 * for trust than avoiding them.
 */
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const FAQS = [
  {
    q: 'What happens if the internet goes down?',
    a: 'You can still look up any customer and record a deposit — the app keeps a copy of your active loans on the device. Those entries are saved locally and sent automatically when the connection returns, and the app tells you exactly what is still waiting. Closing a loan needs a connection, because it settles money against your live cash balance.',
  },
  {
    q: 'Where is my data, and who can see it?',
    a: 'On servers in the cloud, with each shop’s records isolated at the database level — not by application code that could have a bug in it. Customer photos are stored privately and are never publicly reachable; even a link to one expires within minutes. Nobody at LoanPro browses your records.',
  },
  {
    q: 'Can I get my data out if I stop using it?',
    a: 'Yes, any time, in one click. You get a file containing every loan, deposit, cash entry and customer photo in plain readable formats. You do not need LoanPro to open it, and you do not have to ask us for it.',
  },
  {
    q: 'Will my loan numbers change when I move across?',
    a: 'No. Your loan numbers are kept exactly as they are, because they are written on the tickets attached to the jewellery in your safe. Loan 4471 stays 4471.',
  },
  {
    q: 'What about the fingerprint scanner?',
    a: 'Fingerprint scanning needs the device plugged into a Windows machine, so it stays a desktop-only feature — a browser cannot reach that hardware. Customer photo capture works everywhere, from the browser or a paired phone. If fingerprint matching is important to how you work, keep using the desktop app; it is not going away.',
  },
  {
    q: 'Do I have to stop using the desktop app?',
    a: 'No. Both keep working. We move a copy of your records across, you check the totals against what you already know, and you switch over only when you are satisfied. Most shops do it overnight so nothing changes in the middle of a working day.',
  },
  {
    q: 'What if my subscription lapses?',
    a: 'You keep full access to everything you have already recorded — you can open it, search it, run reports and export it. You can also carry on recording repayments on existing loans. Only creating new loans needs an active plan. We are not going to hold your books hostage over a payment.',
  },
  {
    q: 'Can more than one person use it at once?',
    a: 'Yes. You can add staff with their own logins, and they can work at the same time from different devices. Closing loans, deleting records and changing the plan stay with the owner.',
  },
]

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id="faq" className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
          Common questions
        </h2>
        <p className="mt-3 text-slate-600">
          The things shop owners actually ask us before moving across.
        </p>

        <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
          {FAQS.map((f, i) => (
            <div key={f.q}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-start justify-between gap-4 py-4 text-left"
                aria-expanded={open === i}
              >
                <span className="font-medium text-slate-900">{f.q}</span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${
                    open === i ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {open === i && (
                <p className="pb-5 -mt-1 text-sm text-slate-600 leading-relaxed">
                  {f.a}
                </p>
              )}
            </div>
          ))}
        </div>

        <p className="mt-8 text-sm text-slate-600">
          Something else on your mind?{' '}
          <a href="/support" className="text-primary-700 underline">
            Ask us directly
          </a>{' '}
          — we answer in Hindi or English.
        </p>
      </div>
    </section>
  )
}
