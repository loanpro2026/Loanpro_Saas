/**
 * Quick actions — the four jumps the design puts beside the loan list.
 *
 * On the desktop app these are modals opened from the Dashboard (deposit, cash
 * transactions, day-end). The web has them as real pages, which is the right
 * call in a browser, but they were only reachable from sidebar entries the
 * desktop never had. This panel keeps the same starting point.
 *
 * A plain 2×2 of bordered buttons rather than icons and hints: they are jumps,
 * not features, and the design gives them no more weight than that.
 */
import Link from 'next/link'

const ACTIONS = [
  { href: '/remove-record',              label: 'Settle a loan' },
  { href: '/cash',                       label: 'Cash drawer' },
  { href: '/day-end',                    label: 'End of day' },
  { href: '/reports',                    label: 'Quick reports' },
]

export function QuickActions() {
  return (
    <div className="card px-4 py-3.5">
      <h2 className="card-title mb-2.5">Quick actions</h2>
      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map(action => (
          <Link
            key={action.href}
            href={action.href}
            className="flex h-[38px] items-center justify-center rounded-lg border border-surface-border
                       bg-surface-muted px-2 text-center text-12.5 font-semibold text-ink transition-colors
                       hover:border-primary hover:text-primary"
          >
            {action.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
