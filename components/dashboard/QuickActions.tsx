/**
 * Quick Actions — deposits and cash, reachable from the Dashboard.
 *
 * On the desktop these are modals opened from the Dashboard:
 * DepositCreditModal, DepositDebitModal and CashTransactionsModal. There is no
 * Deposits screen and no Cash screen in its navigation at all.
 *
 * The web has both as pages, which is the right call for a browser — but they
 * were only reachable from sidebar entries the desktop does not have. Those
 * entries are gone now, so without this panel the two screens would exist and
 * be unreachable. Same destination, same starting point as the desktop.
 */
import Link from 'next/link'
import { Wallet, ClipboardCheck, Search } from 'lucide-react'

const ACTIONS = [
  {
    href: '/remove-record',
    label: 'Find a record',
    hint: 'Add deposit or settle loan',
    icon: Search,
    accent: 'text-emerald-600 bg-emerald-50',
  },
  {
    href: '/cash',
    label: 'Cash',
    hint: 'Add or remove cash',
    icon: Wallet,
    accent: 'text-blue-600 bg-blue-50',
  },
  {
    // The desktop reads the same two daily tables through DepositCreditModal
    // (daily_deposit_records) and DepositDebitModal
    // (removed_records_with_deposits), both opened from the Dashboard. One page
    // rather than two modals, reached from the same place.
    href: '/day-end',
    label: 'End of Day',
    hint: "Today's settlements and deposits",
    icon: ClipboardCheck,
    accent: 'text-violet-600 bg-violet-50',
  },
]

export function QuickActions() {
  return (
    <div className="card">
      <h2 className="mb-3 text-sm font-bold text-slate-900">Quick actions</h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        {ACTIONS.map(a => {
          const Icon = a.icon
          return (
            <li key={a.href}>
              <Link
                href={a.href}
                className="flex min-h-14 items-center gap-2 rounded-lg border border-surface-border bg-surface-muted px-3 py-2 transition-colors hover:border-primary-300 hover:bg-primary-50"
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${a.accent}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-semibold text-slate-900">{a.label}</span>
                  <span className="hidden text-[11px] text-slate-400 2xl:block">{a.hint}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
