'use client'
/**
 * What is physically in the safe right now, split by metal and item type.
 *
 * `p22m10`-style codes are grouped as "Mangal Sutra" by normalize_item_type()
 * in the database — the shops type that shorthand and the desktop has always
 * grouped it this way.
 */
import { Package } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'

interface Row {
  category_type: string
  item_type: string
  item_count: number
  total_amount: number
  total_weight: number
}

export function InventoryReport({ rows }: { rows: Row[] }) {
  if (!rows?.length) {
    return (
      <EmptyState
        icon={Package}
        title="Nothing held"
        description="No active loans, so nothing is currently in the safe."
      />
    )
  }

  const gold = rows.filter(r => r.category_type === 'Gold')
  const silver = rows.filter(r => r.category_type === 'Silver')

  const sum = (rs: Row[], k: keyof Row) => rs.reduce((s, r) => s + Number(r[k] ?? 0), 0)

  const goldAmount = sum(gold, 'total_amount')
  const silverAmount = sum(silver, 'total_amount')
  const goldWeight = sum(gold, 'total_weight')
  // Silver is bulky — shops hold kilos of it, so grams would print as
  // six-digit numbers. Matches the desktop's display.
  const silverWeightKg = sum(silver, 'total_weight') / 1000

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <MetalCard
          metal="Gold"
          amount={goldAmount}
          weight={`${goldWeight.toFixed(3)}g`}
          count={sum(gold, 'item_count')}
        />
        <MetalCard
          metal="Silver"
          amount={silverAmount}
          weight={`${silverWeightKg.toFixed(3)}kg`}
          count={sum(silver, 'item_count')}
        />
      </div>

      {[
        { label: 'Gold', items: gold, total: goldAmount },
        { label: 'Silver', items: silver, total: silverAmount },
      ].filter(g => g.items.length > 0).map(group => (
        <div key={group.label} className="card">
          <h2 className="card-title mb-3">
            {group.label} items
          </h2>
          <div className="space-y-2">
            {group.items.map(r => {
              const share = group.total > 0
                ? (Number(r.total_amount) / group.total) * 100 : 0
              return (
                <div key={`${r.category_type}-${r.item_type}`} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-slate-700 truncate">{r.item_type}</span>
                      <span className="text-sm font-semibold tabular-nums shrink-0">
                        {formatCurrency(Number(r.total_amount))}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 rounded-full bg-surface-muted overflow-hidden">
                        <div
                          className={group.label === 'Gold' ? 'h-full bg-gold-500' : 'h-full bg-slate-400'}
                          style={{ width: `${Math.min(100, share)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 tabular-nums shrink-0">
                        {r.item_count} item{Number(r.item_count) === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function MetalCard({
  metal, amount, weight, count,
}: {
  metal: 'Gold' | 'Silver'
  amount: number
  weight: string
  count: number
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <Badge variant={metal === 'Gold' ? 'gold' : 'silver'}>{metal}</Badge>
        <span className="text-xs text-slate-400">{count} item{count === 1 ? '' : 's'}</span>
      </div>
      <p className="text-2xl font-semibold tabular-nums mt-2 text-slate-900">
        {formatCurrency(amount)}
      </p>
      <p className="text-sm text-slate-500 tabular-nums">{weight} held</p>
    </div>
  )
}
