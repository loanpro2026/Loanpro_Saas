'use client'
/**
 * What is in the safe: gold vs silver by value, with a breakdown of the gold.
 *
 * Weight units differ by metal on purpose — gold in grams, silver in kilos.
 * A shop holds a few hundred grams of gold and tens of kilos of silver, so a
 * single unit would print one of them as an unreadable number. This matches
 * what the desktop app has always shown.
 */
import { formatCurrency } from '@/lib/utils'

interface Props {
  cost: { gold: number; silver: number }
  weight: { gold: number; silver: number; gold_unit?: string; silver_unit?: string }
  counts: { gold: number; silver: number }
  goldBreakdown: Array<{ name: string; total_amount: number; percentage: number }>
  error?: boolean
  breakdownError?: boolean
}

export function StockChart({ cost, weight, counts, goldBreakdown, error = false, breakdownError = false }: Props) {
  const goldValue = Number(cost.gold ?? 0)
  const silverValue = Number(cost.silver ?? 0)
  const total = goldValue + silverValue

  const goldShare = total > 0 ? (goldValue / total) * 100 : 0
  const silverShare = total > 0 ? (silverValue / total) * 100 : 0

  return (
    <section className="card min-h-[310px] space-y-4" aria-labelledby="safe-title">
      <div className="flex items-baseline justify-between">
        <h2 id="safe-title" className="text-sm font-bold text-slate-900">In the safe</h2>
        {!error && <span className="text-sm font-semibold tabular-nums">{formatCurrency(total)}</span>}
      </div>

      {/* Value split */}
      {error ? (
        <div className="flex min-h-52 flex-col items-center justify-center text-center">
          <p className="text-sm font-semibold text-slate-800">Safe inventory could not be loaded</p>
          <p className="mt-1 text-xs text-slate-500">Loan and cash figures remain available. No record was changed.</p>
          <a href="/dashboard" className="mt-3 text-xs font-semibold text-primary-700 hover:underline">Retry inventory</a>
        </div>
      ) : <div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-muted">
          {goldShare > 0 && (
            <div className="bg-gold-500 h-full" style={{ width: `${goldShare}%` }} />
          )}
          {silverShare > 0 && (
            <div className="bg-slate-400 h-full" style={{ width: `${silverShare}%` }} />
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <MetalStat
            name="Gold"
            dot="bg-gold-500"
            value={goldValue}
            share={goldShare}
            weight={`${Number(weight.gold ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })}${weight.gold_unit ?? 'g'}`}
            count={Number(counts.gold ?? 0)}
          />
          <MetalStat
            name="Silver"
            dot="bg-slate-400"
            value={silverValue}
            share={silverShare}
            weight={`${Number(weight.silver ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })}${weight.silver_unit ?? 'kg'}`}
            count={Number(counts.silver ?? 0)}
          />
        </div>
        {total === 0 && (
          <p className="mt-3 text-xs text-slate-500">
            No gold or silver is currently pledged against an active loan.
          </p>
        )}
      </div>}

      {/* Gold item types */}
      {!error && goldBreakdown.length > 0 && (
        <div className="pt-3 border-t border-surface-border">
          <p className="text-xs text-slate-500 mb-2">Gold by item type</p>
          <ul className="space-y-1.5">
            {goldBreakdown.map(b => (
              <li key={b.name} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate text-slate-700">{b.name}</span>
                <div className="w-20 h-1 rounded-full bg-surface-muted overflow-hidden shrink-0">
                  <div className="h-full bg-gold-500" style={{ width: `${b.percentage}%` }} />
                </div>
                <span className="text-xs text-slate-400 tabular-nums w-10 text-right shrink-0">
                  {Number(b.percentage).toFixed(0)}%
                </span>
                <span className="text-sm tabular-nums w-20 text-right shrink-0">
                  {formatCurrency(Number(b.total_amount), true)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!error && breakdownError && (
        <p className="border-t border-surface-border pt-3 text-xs text-red-700">
          Gold item breakdown could not be loaded; total Gold and Silver figures remain available.
        </p>
      )}
    </section>
  )
}

function MetalStat({
  name, dot, value, share, weight, count,
}: {
  name: string; dot: string; value: number; share: number; weight: string; count: number
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="text-xs text-slate-500">{name}</span>
        <span className="text-xs text-slate-400 tabular-nums">{share.toFixed(0)}%</span>
      </div>
      <p className="text-base font-semibold tabular-nums text-slate-900 mt-0.5">
        {formatCurrency(value)}
      </p>
      <p className="text-xs text-slate-400">
        {weight} · {count} item{count === 1 ? '' : 's'}
      </p>
    </div>
  )
}
