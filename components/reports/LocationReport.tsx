'use client'
/**
 * Where the shop's money is lent out.
 *
 * The concentration bar is the point of this report: a lender with most of
 * their capital in one village is exposed if that area has a bad harvest.
 * The desktop shows raw totals; the share column makes the risk visible.
 */
import { MapPin } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'

interface Row {
  location: string
  loan_count: number
  active_count: number
  closed_count: number
  total_amount: number
  active_amount: number
  total_weight: number
  avg_amount: number
}

export function LocationReport({ rows }: { rows: Row[] }) {
  if (!rows?.length) {
    return (
      <EmptyState
        icon={MapPin}
        title="No locations to show"
        description="No loans in this period, or no locations recorded against them."
      />
    )
  }

  const totalActive = rows.reduce((s, r) => s + Number(r.active_amount), 0)
  const top = rows[0]
  const topShare = totalActive > 0 ? (Number(top.active_amount) / totalActive) * 100 : 0

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile label="Places" value={String(rows.length)} />
        <Tile label="Outstanding" value={formatCurrency(totalActive)} />
        <Tile
          label="Largest exposure"
          value={top.location}
          sub={`${topShare.toFixed(0)}% of outstanding`}
        />
      </div>

      {topShare > 40 && rows.length > 1 && (
        <p className="text-sm text-amber-800 bg-amber-50 rounded-xl px-4 py-3">
          {topShare.toFixed(0)}% of outstanding money is lent into{' '}
          <strong>{top.location}</strong>. Worth keeping in mind if that area has a
          bad season.
        </p>
      )}

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Place</th>
              <th>Loans</th>
              <th className="hidden sm:table-cell">Active</th>
              <th className="hidden md:table-cell">Average</th>
              <th>Outstanding</th>
              <th className="hidden lg:table-cell w-32">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const share = totalActive > 0
                ? (Number(r.active_amount) / totalActive) * 100 : 0
              return (
                <tr key={r.location}>
                  <td className="text-sm font-medium">{r.location}</td>
                  <td className="text-sm text-slate-600 tabular-nums">{r.loan_count}</td>
                  <td className="hidden sm:table-cell text-sm text-slate-600 tabular-nums">
                    {r.active_count}
                  </td>
                  <td className="hidden md:table-cell text-sm text-slate-600 tabular-nums">
                    {formatCurrency(Number(r.avg_amount))}
                  </td>
                  <td className="text-sm font-semibold tabular-nums">
                    {formatCurrency(Number(r.active_amount))}
                  </td>
                  <td className="hidden lg:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                        <div
                          className="h-full bg-primary-600"
                          style={{ width: `${Math.min(100, share)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 tabular-nums w-9 text-right">
                        {share.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold tabular-nums mt-1 text-slate-900 truncate">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}
