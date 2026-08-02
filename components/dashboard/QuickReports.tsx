/**
 * Quick Reports — the desktop's QuickActionPane.
 *
 * Four shortcuts: Investment, Returns, Inventory, Locations. On the desktop
 * each opens a modal over the dashboard; here each is a link to the page that
 * already exists, so the report can be bookmarked, refreshed and shared.
 *
 * A Server Component: it renders links and nothing else, so there is no reason
 * to ship it to the browser — and it can pass icon components freely, which a
 * Client Component could not receive.
 */
import Link from 'next/link'
import { TrendingDown, TrendingUp, Package, MapPin, ChevronRight } from 'lucide-react'

const REPORTS = [
  {
    href: '/view-accounts/investment',
    label: 'Investment',
    hint: 'Money lent out',
    icon: TrendingDown,
    accent: 'text-blue-600 bg-blue-50',
  },
  {
    href: '/view-accounts/returns',
    label: 'Returns',
    hint: 'Money coming back',
    icon: TrendingUp,
    accent: 'text-emerald-600 bg-emerald-50',
  },
  {
    href: '/reports?key=inventory',
    label: 'Inventory',
    hint: 'What is in the safe',
    icon: Package,
    accent: 'text-violet-600 bg-violet-50',
  },
  {
    href: '/reports?key=location',
    label: 'Locations',
    hint: 'Lending by village',
    icon: MapPin,
    accent: 'text-amber-600 bg-amber-50',
  },
]

export function QuickReports() {
  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">Quick Reports</h2>
      <ul className="space-y-1 -mx-2">
        {REPORTS.map(r => {
          const Icon = r.icon
          return (
            <li key={r.href}>
              <Link
                href={r.href}
                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <span className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${r.accent}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-slate-900">{r.label}</span>
                  <span className="block text-xs text-slate-400">{r.hint}</span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
