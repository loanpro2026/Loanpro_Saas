'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { BarChart3, RefreshCw } from 'lucide-react'
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

  const totalInterest = data.reduce((sum, item) => sum + item.interest, 0)
  const totalInvested = data.reduce((sum, item) => sum + item.invested, 0)
  const totalReturned = data.reduce((sum, item) => sum + item.returned, 0)

  return (
    <section className="card flex min-h-[310px] flex-col" aria-labelledby="trend-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="trend-title" className="text-sm font-bold text-slate-900">Invested vs returned · last 12 months</h2>
          {!error && data.length > 0 && (
            <p className="mt-0.5 text-xs text-slate-500">{formatCurrency(totalInterest)} interest collected</p>
          )}
        </div>
        {!error && data.length > 0 && (
          <button type="button" onClick={() => setShowInterest(value => !value)} className="text-xs font-medium text-primary-700 hover:underline">
            {showInterest ? 'Hide' : 'Show'} interest
          </button>
        )}
      </div>

      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
          <BarChart3 className="h-7 w-7 text-red-300" />
          <p className="mt-3 text-sm font-semibold text-slate-800">Monthly trend could not be loaded</p>
          <p className="mt-1 max-w-sm text-xs text-slate-500">Other dashboard figures remain available. No loan or cash data was changed.</p>
          <button type="button" onClick={() => location.reload()} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary-700">
            <RefreshCw className="h-3.5 w-3.5" /> Retry trend
          </button>
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
          <BarChart3 className="h-7 w-7 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-800">No lending trend yet</p>
          <p className="mt-1 max-w-sm text-xs text-slate-500">Monthly invested and returned figures will appear after the first loan is recorded.</p>
          <Link href="/add-record" className="mt-3 text-xs font-semibold text-primary-700 hover:underline">Add your first loan</Link>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:hidden">
            <Summary label="Invested" value={totalInvested} tone="primary" />
            <Summary label="Returned" value={totalReturned} tone="positive" />
          </div>

          <div className="mt-3 hidden h-56 min-h-0 sm:block">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgb(var(--surface-border))" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'rgb(var(--slate-500))' }} />
                <YAxis axisLine={false} tickLine={false} width={42} tickFormatter={compact} tick={{ fontSize: 11, fill: 'rgb(var(--slate-500))' }} />
                <Tooltip
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  contentStyle={{ borderRadius: 10, border: '1px solid rgb(var(--surface-border))', background: 'rgb(var(--surface-card))', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="plainline" />
                <Line type="monotone" dataKey="invested" name="Invested" stroke="#2563eb" strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="returned" name="Returned" stroke="#0a7d54" strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} />
                {showInterest && <Line type="monotone" dataKey="interest" name="Interest" stroke="#d97706" strokeWidth={1.75} dot={false} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  )
}

function Summary({ label, value, tone }: { label: string; value: number; tone: 'primary' | 'positive' }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-muted p-3">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-bold tabular-nums ${tone === 'positive' ? 'text-emerald-700' : 'text-primary-700'}`}>
        {formatCurrency(value)}
      </p>
    </div>
  )
}

function compact(value: number): string {
  if (Math.abs(value) >= 10_000_000) return `${(value / 10_000_000).toFixed(1)}Cr`
  if (Math.abs(value) >= 100_000) return `${(value / 100_000).toFixed(1)}L`
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}K`
  return String(value)
}
