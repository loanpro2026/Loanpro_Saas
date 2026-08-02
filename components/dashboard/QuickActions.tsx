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
import { ArrowDownCircle, Wallet, ClipboardCheck, ChevronRight } from 'lucide-react'

const ACTIONS = [
  {
    href: '/deposits',
    label: 'Deposits',
    hint: 'Take a part-payment',
    icon: ArrowDownCircle,
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
      <h2 className="text-sm font-semibold text-slate-900 mb-3">Quick Actions</h2>
      <ul className="space-y-1 -mx-2">
        {ACTIONS.map(a => {
          const Icon = a.icon
          return (
            <li key={a.href}>
              <Link
                href={a.href}
                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <span className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${a.accent}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-slate-900">{a.label}</span>
                  <span className="block text-xs text-slate-400">{a.hint}</span>
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
