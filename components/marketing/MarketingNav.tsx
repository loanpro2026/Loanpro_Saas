'use client'
/**
 * Marketing navigation.
 *
 * Own component, no shared code with the existing site — this app has to be
 * able to change independently of it.
 */
import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'

const LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/#pricing',  label: 'Pricing' },
  { href: '/#faq',      label: 'Questions' },
  { href: '/support',   label: 'Support' },
]

export function MarketingNav() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold-500">
              <span className="text-sm font-bold text-primary-950">LP</span>
            </span>
            <span className="font-semibold text-slate-900">LoanPro</span>
          </Link>

          <div className="hidden md:flex items-center gap-7">
            {LINKS.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800 transition-colors"
            >
              Start free trial
            </Link>
          </div>

          <button
            onClick={() => setOpen(v => !v)}
            className="md:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Menu"
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <div className="md:hidden border-t border-slate-200 py-3 space-y-1">
            {LINKS.map(l => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                {l.label}
              </Link>
            ))}
            <div className="pt-2 flex gap-2">
              <Link
                href="/login"
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-center text-sm font-medium text-slate-700"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="flex-1 rounded-lg bg-primary-700 px-4 py-2 text-center text-sm font-semibold text-white"
              >
                Start free
              </Link>
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}
