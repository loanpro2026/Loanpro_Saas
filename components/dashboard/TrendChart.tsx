'use client'
/**
 * Money lent out vs money returned, by month.
 *
 * The gap between the two lines is the shop's working capital moving in and
 * out. Interest is drawn separately because it is the actual earnings and is
 * an order of magnitude smaller — plotted on the same scale it would be a flat
 * line along the axis.
 */
import { useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { TrendingUp } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Row {
  month: string
  invested: number
  returned: number
  interest: number
}

export function TrendChart({ rows }: { rows: Row[] }) {
  const [showInterest, setShowInterest] = useState(true)

  if (!rows?.length) return null

  const data = rows.map(r => ({
    label: new Date(r.month).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
    month: r.month,
    invested: Number(r.invested),
    returned: Number(r.returned),
    interest: Number(r.interest),
  }))

  const totalInterest = data.reduce((s, d) => s + d.interest, 0)
  const totalInvested = data.reduce((s, d) => s + d.invested, 0)
  const totalReturned = data.reduce((s, d) => s + d.returned, 0)

  // Positive means more money came back than went out over the window — the
  // shop's capital grew. Negative means they lent more than they recovered,
  // which is normal for a growing book and worth not mislabelling as bad.
  const netFlow = totalReturned - totalInvested

  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Last 12 months</h2>
          <p className="text-xs text-slate-500">
            {formatCurrency(totalInterest)} interest earned
          </p>
        </div>

        <button
          onClick={() => setShowInterest(v => !v)}
          className="text-xs text-slate-500 hover:text-slate-900 underline"
        >
          {showInterest ? 'Hide' : 'Show'} interest
        </button>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false} tickLine={false}
              tickFormatter={compact}
            />
            {/* Interest is ~1/20th of the principal figures, so it needs its
                own axis or it disappears into the baseline. */}
            {showInterest && (
              <YAxis
                yAxisId="right" orientation="right"
                tick={{ fontSize: 11, fill: '#d97706' }}
                axisLine={false} tickLine={false}
                tickFormatter={compact}
              />
            )}
            <Tooltip
              formatter={(v: number, name: string) => [formatCurrency(v), name]}
              contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              iconType="circle" iconSize={8}
            />
            <Bar yAxisId="left" dataKey="invested" name="Lent out"
                 fill="#4338ca" radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Bar yAxisId="left" dataKey="returned" name="Returned"
                 fill="#a5b4fc" radius={[3, 3, 0, 0]} maxBarSize={28} />
            {showInterest && (
              <Line yAxisId="right" type="monotone" dataKey="interest" name="Interest"
                    stroke="#d97706" strokeWidth={2} dot={{ r: 2.5 }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-4 pt-3 border-t border-surface-border">
        <Figure label="Lent out"  value={formatCurrency(totalInvested)} />
        <Figure label="Returned"  value={formatCurrency(totalReturned)} />
        <Figure
          label={netFlow >= 0 ? 'Capital recovered' : 'Capital deployed'}
          value={formatCurrency(Math.abs(netFlow))}
          tone={netFlow >= 0 ? 'good' : undefined}
        />
      </div>
    </div>
  )
}

function compact(v: number): string {
  if (Math.abs(v) >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}Cr`
  if (Math.abs(v) >= 100_000) return `${(v / 100_000).toFixed(1)}L`
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}K`
  return String(v)
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${
        tone === 'good' ? 'text-emerald-600' : 'text-slate-900'
      }`}>
        {value}
      </p>
    </div>
  )
}
