/**
 * Top locations by active principal — where the shop's money is, by village.
 *
 * Reads location_report() with no date bounds, so the figures are the whole
 * book rather than a period. That is what makes it useful: a shop wants to know
 * where it is exposed overall, not who borrowed last week.
 *
 * Bar widths are relative to the largest row, not to the total. Against the
 * total, a shop spread evenly across eight villages shows eight stubs and reads
 * as though nothing is anywhere.
 *
 * A Server Component — a static list, so nothing ships to the browser and the
 * data arrives on the same request as the rest of the page.
 */
import { formatCurrency } from '@/lib/utils'

export interface LocationRow {
  location: string
  active_count: number
  active_amount: number
}

export function TopLocations({ rows, error = false }: { rows: LocationRow[]; error?: boolean }) {
  const top = [...rows]
    .filter(row => row.active_amount > 0)
    .sort((a, b) => b.active_amount - a.active_amount)
    .slice(0, 5)

  const largest = top[0]?.active_amount ?? 0

  return (
    <div className="card px-4 py-3.5">
      <h2 className="card-title mb-2">Top locations by active principal</h2>

      {error ? (
        <>
          <p className="text-12.5 font-medium text-red">Location exposure could not be loaded</p>
          <p className="mt-1 text-12 text-ink-faint">Other portfolio figures remain available.</p>
        </>
      ) : top.length === 0 ? (
        <p className="text-12.5 text-ink-faint">
          Nothing lent out yet — locations appear once you have active loans.
        </p>
      ) : (
        <ul>
          {top.map(row => (
            <li key={row.location} className="flex items-center gap-2.5 py-[5px] text-12.5">
              <span className="min-w-0 flex-1 truncate text-ink-muted" title={row.location}>
                {row.location}
              </span>
              <div className="h-1.5 w-[90px] shrink-0 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${largest > 0 ? (row.active_amount / largest) * 100 : 0}%` }}
                />
              </div>
              <span className="w-[76px] shrink-0 text-right font-semibold tabular-nums text-ink">
                {formatCurrency(row.active_amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
