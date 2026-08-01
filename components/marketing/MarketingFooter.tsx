import Link from 'next/link'

/**
 * Footer.
 *
 * The policy links are not decoration — Razorpay requires reachable terms,
 * privacy, refund and contact pages before it will approve a live account.
 */
const COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '/#features', label: 'Features' },
      { href: '/#pricing',  label: 'Pricing' },
      { href: '/#faq',      label: 'Common questions' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/support', label: 'Contact us' },
      { href: '/about',   label: 'About' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/terms',    label: 'Terms of service' },
      { href: '/privacy',  label: 'Privacy policy' },
      { href: '/refunds',  label: 'Refund & cancellation' },
    ],
  },
]

export function MarketingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold-500">
                <span className="text-sm font-bold text-primary-950">LP</span>
              </span>
              <span className="font-semibold text-slate-900">LoanPro</span>
            </Link>
            <p className="mt-3 text-sm text-slate-600 max-w-xs">
              Gold and silver loan management for Indian pawn shops. Runs in a
              browser — nothing to install.
            </p>
          </div>

          {COLUMNS.map(col => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-slate-900">{col.title}</h3>
              <ul className="mt-3 space-y-2">
                {col.links.map(l => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-slate-200 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} LoanPro. All rights reserved.
          </p>
          <p className="text-xs text-slate-500">
            Support in Hindi and English · Mon–Sat, 10am–7pm IST
          </p>
        </div>
      </div>
    </footer>
  )
}
