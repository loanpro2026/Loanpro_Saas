'use client'
/**
 * Day-by-day totals over a date range, with a chart.
 *
 * Days with no activity are omitted rather than plotted as zero — a shop is
 * shut on some days, and a floor of zeros makes the real movement harder to
 * read.
 */
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { TrendingUp } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'

interface Row {
  date: string
  amount: number
  count: number
  avg_amount: number
}

/**
 * Bars are drawn from the theme variables rather than fixed hex, so the chart
 * follows the shop into dark mode instead of staying a light-mode artefact on
 * a dark card. Money out is the design's amber, money back its green.
 */
const LABELS = {
  Investment: { title: 'Money lent out',  colour: 'rgb(var(--amber))' },
  Returns:    { title: 'Money returned',  colour: 'rgb(var(--green))' },
  Interest:   { title: 'Interest earned', colour: 'rgb(var(--primary))' },
} as const

export function AccountReport({
  rows, type,
}: {
  rows: Row[]
  type: keyof typeof LABELS
}) {
  if (!rows?.length) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Nothing in this period"
        description="No activity of this kind between the selected dates."
      />
    )
  }

  const total = rows.reduce((s, r) => s + Number(r.amount), 0)
  const count = rows.reduce((s, r) => s + Number(r.count), 0)
  const busiest = rows.reduce((a, b) => (Number(b.amount) > Number(a.amount) ? b : a))
  const meta = LABELS[type]

  const chart = rows.map(r => ({
    date: r.date,
    label: new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    amount: Number(r.amount),
  }))

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label={`Total ${meta.title.toLowerCase()}`} value={formatCurrency(total)} />
        <Tile label="Transactions" value={String(count)} />
        <Tile
          label="Busiest day"
          value={formatDate(busiest.date)}
          sub={formatCurrency(Number(busiest.amount))}
        />
      </div>

      <div className="card p-4">
        <h2 className="card-title mb-3">{meta.title} by day</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="rgb(var(--border))" vertical={false} />
              <XAxis
                dataKey="label" tick={{ fontSize: 10.5, fill: 'rgb(var(--text3))' }}
                axisLine={false} tickLine={false} interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10.5, fill: 'rgb(var(--text3))' }}
                axisLine={false} tickLine={false} width={42}
                tickFormatter={v => v >= 100000 ? `${(v / 100000).toFixed(1)}L`
                                  : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
              />
              <Tooltip
                cursor={{ fill: 'var(--primary-tint)' }}
                formatter={(v: number) => [formatCurrency(v), meta.title]}
                labelFormatter={(l, p) => p?.[0]?.payload?.date
                  ? formatDate(p[0].payload.date) : String(l)}
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid rgb(var(--border))',
                  background: 'rgb(var(--surface))',
                  color: 'rgb(var(--text))',
                  fontSize: 12,
                  boxShadow: 'var(--shadow-menu)',
                }}
              />
              <Bar dataKey="amount" fill={meta.colour} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Count</th>
              <th>Average</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.date}>
                <td className="text-sm">{formatDate(r.date)}</td>
                <td className="text-sm text-slate-600 tabular-nums">{r.count}</td>
                <td className="text-sm text-slate-600 tabular-nums">
                  {formatCurrency(Number(r.avg_amount))}
                </td>
                <td className="text-sm font-semibold tabular-nums">
                  {formatCurrency(Number(r.amount))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-surface-border font-semibold">
              <td className="text-sm text-slate-500">Total</td>
              <td className="text-sm tabular-nums">{count}</td>
              <td />
              <td className="text-sm tabular-nums">{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card px-4 py-3.5">
      <p className="text-12 font-semibold text-ink-muted">{label}</p>
      <p className="mt-1.5 text-xl font-bold tabular-nums text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-12 text-ink-faint">{sub}</p>}
    </div>
  )
}
