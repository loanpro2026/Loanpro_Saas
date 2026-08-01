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
}

export function StockChart({ cost, weight, counts, goldBreakdown }: Props) {
  const goldValue = Number(cost.gold ?? 0)
  const silverValue = Number(cost.silver ?? 0)
  const total = goldValue + silverValue

  const goldShare = total > 0 ? (goldValue / total) * 100 : 0
  const silverShare = total > 0 ? (silverValue / total) * 100 : 0

  if (total === 0) {
    return (
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-900">In the safe</h2>
        <p className="text-sm text-slate-400 mt-2">
          Nothing held — no active loans yet.
        </p>
      </div>
    )
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">In the safe</h2>
        <span className="text-sm font-semibold tabular-nums">{formatCurrency(total)}</span>
      </div>

      {/* Value split */}
      <div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-muted">
          {goldShare > 0 && (
            <div className="bg-gold-500 h-full" style={{ width: `${goldShare}%` }} />
          )}
          {silverShare > 0 && (
            <div className="bg-slate-400 h-full" style={{ width: `${silverShare}%` }} />
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mt-3">
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
      </div>

      {/* Gold item types */}
      {goldBreakdown.length > 0 && (
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
    </div>
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
