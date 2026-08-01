'use client'
/**
 * A headline number with a day-on-day change and a small sparkline.
 *
 * The sparkline is drawn as an inline SVG rather than pulled from a chart
 * library — four of these render on every dashboard load, and Recharts is a
 * heavy thing to mount for five data points.
 */
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  changePct?: number
  trend?: number[]
}

export function MetricCard({ icon: Icon, label, value, sub, changePct, trend }: Props) {
  const hasChange = changePct !== undefined && changePct !== 0 && Number.isFinite(changePct)
  const up = (changePct ?? 0) > 0

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-slate-500 min-w-0">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="text-xs truncate">{label}</span>
        </div>
        {hasChange && (
          <span className={cn(
            'inline-flex items-center gap-0.5 text-xs font-medium shrink-0',
            up ? 'text-emerald-600' : 'text-red-600'
          )}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(changePct!)}%
          </span>
        )}
      </div>

      <p className="text-xl font-semibold tabular-nums mt-1.5 text-slate-900">{value}</p>

      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}

      {trend && trend.length >= 2 && <Sparkline values={trend} positive={up} />}
    </div>
  )
}

function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  const w = 100, h = 20
  const min = Math.min(...values)
  const max = Math.max(...values)
  // A flat line still needs a divisor, or every point lands at NaN.
  const range = max - min || 1

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-5 mt-2 overflow-visible"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className={positive ? 'stroke-emerald-500' : 'stroke-slate-300'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
