/**
 * Top Locations — the desktop's LendingMetrics panel.
 *
 * Where the shop's money is, by village. It sits in the middle of the
 * desktop's first dashboard row, between the jewellery stock chart and the
 * quick reports.
 *
 * Reads location_report() with no date bounds, so the figures are the whole
 * book rather than a period — which is what makes it useful: a shop wants to
 * know where it is exposed overall, not who borrowed last week.
 *
 * A Server Component. It renders a static list, so there is nothing to ship to
 * the browser, and the data comes back on the same request as the rest of the
 * page instead of a second round trip after paint.
 */
import Link from 'next/link'
import { MapPin, ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export interface LocationRow {
  location: string
  active_count: number
  active_amount: number
}

export function TopLocations({ rows }: { rows: LocationRow[] }) {
  // The biggest exposure first; that is the number a shop acts on.
  const top = [...rows]
    .filter(r => r.active_amount > 0)
    .sort((a, b) => b.active_amount - a.active_amount)
    .slice(0, 5)

  const largest = top[0]?.active_amount ?? 0

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Top Locations</h2>
        <Link
          href="/reports?key=location"
          className="text-xs text-primary-700 hover:underline inline-flex items-center gap-1"
        >
          View all <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {top.length === 0 ? (
        <p className="text-sm text-slate-400">
          Nothing lent out yet — locations appear once you have active loans.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {top.map(r => (
            <li key={r.location}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden />
                  <span className="truncate">{r.location}</span>
                </span>
                <span className="font-semibold tabular-nums shrink-0">
                  {formatCurrency(r.active_amount)}
                </span>
              </div>
              {/* Bar widths are relative to the largest row, not to the total.
                  Against the total, a shop spread evenly across eight villages
                  shows eight stubs and reads as though nothing is anywhere. */}
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary-600"
                    style={{ width: `${largest > 0 ? (r.active_amount / largest) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs text-slate-400 tabular-nums shrink-0">
                  {r.active_count}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
