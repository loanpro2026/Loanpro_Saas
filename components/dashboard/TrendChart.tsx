'use client'
/**
 * Invested vs returned over the last twelve months.
 *
 * The design draws this as two bare polylines on four horizontal rules — no
 * axes, no boxed legend, month names as plain text under the plot. That is the
 * whole point of the panel: it answers "is money going out faster than it comes
 * back" at a glance, and a Y axis of rupee gridlines only gets in the way. The
 * exact figures live one click away in View Accounts.
 *
 * Interest is a third line, off by default — it is an order of magnitude
 * smaller than the other two and flattens them when always shown.
 */
import Link from 'next/link'
import { useState } from 'react'
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { RefreshCw } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Row {
  month: string
  invested: number
  returned: number
  interest: number
}

export function TrendChart({ rows, error = false }: { rows: Row[]; error?: boolean }) {
  const [showInterest, setShowInterest] = useState(false)
  const data = rows.map(row => ({
    label: new Date(row.month).toLocaleDateString('en-IN', { month: 'short' }),
    invested: Number(row.invested),
    returned: Number(row.returned),
    interest: Number(row.interest),
  }))

  const totalInvested = data.reduce((sum, item) => sum + item.invested, 0)
  const totalReturned = data.reduce((sum, item) => sum + item.returned, 0)

  return (
    <section className="card flex min-h-[290px] flex-col p-4" aria-labelledby="trend-title">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <h2 id="trend-title" className="card-title">Invested vs returned · last 12 months</h2>

        {!error && data.length > 0 && (
          <div className="flex items-center gap-3.5 text-11.5 text-ink-muted">
            <Key colour="bg-primary" label="Invested" />
            <Key colour="bg-green" label="Returned" />
            {showInterest && <Key colour="bg-amber" label="Interest" />}
            <button
              type="button"
              onClick={() => setShowInterest(value => !value)}
              className="font-semibold text-primary hover:underline"
            >
              {showInterest ? 'Hide' : 'Show'} interest
            </button>
          </div>
        )}
      </div>

      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
          <p className="text-13 font-semibold text-ink">Monthly trend could not be loaded</p>
          <p className="mt-1 max-w-sm text-12 text-ink-muted">
            Other dashboard figures remain available. No loan or cash data was changed.
          </p>
          <button
            type="button"
            onClick={() => location.reload()}
            className="mt-3 inline-flex items-center gap-1 text-12 font-semibold text-primary"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry trend
          </button>
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
          <p className="text-13 font-semibold text-ink">No lending trend yet</p>
          <p className="mt-1 max-w-sm text-12 text-ink-muted">
            Monthly invested and returned figures appear after the first loan is recorded.
          </p>
          <Link href="/add-record" className="mt-3 text-12 font-semibold text-primary hover:underline">
            Add your first loan
          </Link>
        </div>
      ) : (
        <>
          {/* The phone has no room for twelve months of plot; it gets the totals. */}
          <div className="grid grid-cols-2 gap-2 sm:hidden">
            <Summary label="Invested" value={totalInvested} tone="primary" />
            <Summary label="Returned" value={totalReturned} tone="positive" />
          </div>

          {/* Keep an explicit height. `flex-1` gave ResponsiveContainer a
              computed height of zero inside this min-height-only card. */}
          <div className="hidden h-[260px] w-full shrink-0 sm:block">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: 6 }}>
                <CartesianGrid stroke="rgb(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tickMargin={6}
                  tick={{ fontSize: 10.5, fill: 'rgb(var(--text3))' }}
                />
                {/* Hidden, but still needed to scale the lines. */}
                <YAxis hide domain={[0, 'auto']} />
                <Tooltip
                  cursor={{ stroke: 'rgb(var(--border))' }}
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  contentStyle={{
                    borderRadius: 10,
                    border: '1px solid rgb(var(--border))',
                    background: 'rgb(var(--surface))',
                    color: 'rgb(var(--text))',
                    fontSize: 12,
                    boxShadow: 'var(--shadow-menu)',
                  }}
                />
                <Line
                  type="monotone" dataKey="invested" name="Invested"
                  stroke="rgb(var(--primary))" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone" dataKey="returned" name="Returned"
                  stroke="rgb(var(--green))" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }}
                />
                {showInterest && (
                  <Line
                    type="monotone" dataKey="interest" name="Interest"
                    stroke="rgb(var(--amber))" strokeWidth={1.8} dot={false} activeDot={{ r: 3.5 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  )
}

function Key({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-[3px] w-2.5 rounded-sm ${colour}`} />
      {label}
    </span>
  )
}

function Summary({ label, value, tone }: { label: string; value: number; tone: 'primary' | 'positive' }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-muted p-3">
      <p className="text-11 text-ink-faint">{label}</p>
      <p className={`mt-1 text-13.5 font-bold tabular-nums ${tone === 'positive' ? 'text-green' : 'text-primary'}`}>
        {formatCurrency(value)}
      </p>
    </div>
  )
}
