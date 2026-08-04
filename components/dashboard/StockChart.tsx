'use client'
/**
 * What is in the safe: gold against silver, by value.
 *
 * A single 8px bar for the split, then one tile per metal on its own tint. Each
 * tile is a link into the investment report, because the question this panel
 * raises — "which items make up that ₹19,60,000?" — is answered there.
 *
 * Weight units differ by metal on purpose. A shop holds a few hundred grams of
 * gold and tens of kilos of silver; a shared unit prints one of them as an
 * unreadable number. This is what the desktop app has always shown.
 */
import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'

interface SafeGroup {
  type: string
  amount: number
  count: number
}

interface Props {
  cost: { gold: number; silver: number }
  weight: { gold: number; silver: number; gold_unit?: string; silver_unit?: string }
  counts: { gold: number; silver: number }
  groups: { gold: SafeGroup[]; silver: SafeGroup[] }
  error?: boolean
}

export function StockChart({ cost, weight, counts, groups, error = false }: Props) {
  const [openMetal, setOpenMetal] = useState<'gold' | 'silver' | null>(null)
  const goldValue = Number(cost.gold ?? 0)
  const silverValue = Number(cost.silver ?? 0)
  const total = goldValue + silverValue

  const goldShare = total > 0 ? (goldValue / total) * 100 : 0
  const silverShare = total > 0 ? (silverValue / total) * 100 : 0

  const fmtWeight = (value: number, unit: string) =>
    `${Number(value ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit}`

  return (
    <section className="card flex min-h-[290px] flex-col gap-3 p-4" aria-labelledby="safe-title">
      <h2 id="safe-title" className="card-title">In the safe</h2>

      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-13 font-semibold text-ink">Safe inventory could not be loaded</p>
          <p className="mt-1 text-12 text-ink-muted">
            Loan and cash figures remain available. No record was changed.
          </p>
          <button
            type="button"
            onClick={() => location.reload()}
            className="mt-3 text-12 font-semibold text-primary hover:underline"
          >
            Retry inventory
          </button>
        </div>
      ) : (
        <>
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-muted">
            {goldShare > 0 && <div className="h-full bg-gold" style={{ width: `${goldShare}%` }} />}
            {silverShare > 0 && <div className="h-full bg-silver" style={{ width: `${silverShare}%` }} />}
          </div>

          <MetalTile
            name="Gold"
            value={goldValue}
            share={goldShare}
            count={Number(counts.gold ?? 0)}
            weight={fmtWeight(weight.gold, weight.gold_unit ?? 'g')}
            className="border-surface-border bg-gold-bg hover:border-gold"
            nameClass="text-gold"
            expanded={openMetal === 'gold'}
            onClick={() => setOpenMetal(value => value === 'gold' ? null : 'gold')}
          />
          <MetalTile
            name="Silver"
            value={silverValue}
            share={silverShare}
            count={Number(counts.silver ?? 0)}
            weight={fmtWeight(weight.silver, weight.silver_unit ?? 'kg')}
            className="border-surface-border bg-silver-bg hover:border-silver"
            nameClass="text-silver"
            expanded={openMetal === 'silver'}
            onClick={() => setOpenMetal(value => value === 'silver' ? null : 'silver')}
          />

          {openMetal && (
            <div className="overflow-hidden rounded-xl border border-surface-border" aria-live="polite">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 bg-surface-muted px-3 py-2
                              text-10.5 font-bold uppercase tracking-wide text-ink-faint">
                <span>Jewellery type</span><span>Items</span><span>Amount</span>
              </div>
              {groups[openMetal].length ? groups[openMetal].map(group => (
                <div
                  key={group.type}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-t border-surface-border
                             px-3 py-2 text-12"
                >
                  <span className="truncate font-medium text-ink" title={group.type}>{group.type}</span>
                  <span className="tabular-nums text-ink-muted">{group.count}</span>
                  <span className="min-w-[78px] text-right font-semibold tabular-nums text-ink">
                    {formatCurrency(group.amount)}
                  </span>
                </div>
              )) : (
                <p className="border-t border-surface-border px-3 py-3 text-12 text-ink-faint">
                  No {openMetal} items are currently in the safe.
                </p>
              )}
            </div>
          )}

          {total === 0 && (
            <p className="text-12 text-ink-faint">
              No gold or silver is currently pledged against an active loan.
            </p>
          )}
        </>
      )}
    </section>
  )
}

function MetalTile({
  name, value, share, count, weight, className, nameClass,
  expanded, onClick,
}: {
  name: string
  value: number
  share: number
  count: number
  weight: string
  className: string
  nameClass: string
  expanded: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onClick}
      className={`block w-full rounded-xl border p-3 text-left transition-colors ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 text-12.5 font-bold ${nameClass}`}>
          {name} <span className="text-11">{expanded ? '↑' : '↓'}</span>
        </span>
        <span className="text-12 text-ink-muted">
          {count} item{count === 1 ? '' : 's'} · {share.toFixed(0)}%
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <span className="text-lg font-bold tabular-nums text-ink">{formatCurrency(value)}</span>
        <span className="text-13 font-semibold tabular-nums text-ink-muted">{weight}</span>
      </div>
    </button>
  )
}
