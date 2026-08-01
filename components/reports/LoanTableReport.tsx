'use client'
/**
 * Investment and returns reports — both are a list of loans for one day, so
 * they share a table with different columns and totals.
 */
import Link from 'next/link'
import { FileText } from 'lucide-react'
import { formatCurrency, formatDate, formatWeight } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'

interface Row {
  id: number
  name: string
  father_name: string | null
  location: string | null
  amount: number
  category_type: string
  detailed_type: string | null
  weight: number | null
  issue_date: string
  status?: string
  closed_date?: string | null
  interest?: number | null
  total_return?: number
  deposits_collected?: number
  days_held?: number
}

interface Props {
  rows: Row[]
  variant: 'investment' | 'returns'
  date: string
}

export function LoanTableReport({ rows, variant, date }: Props) {
  if (!rows?.length) {
    return (
      <EmptyState
        icon={FileText}
        title={variant === 'investment' ? 'No loans issued' : 'No loans settled'}
        description={`Nothing recorded on ${formatDate(date)}.`}
      />
    )
  }

  const isReturns = variant === 'returns'
  const totalPrincipal = rows.reduce((s, r) => s + Number(r.amount), 0)
  const totalInterest = rows.reduce((s, r) => s + Number(r.interest ?? 0), 0)
  const totalReturn = rows.reduce((s, r) => s + Number(r.total_return ?? r.amount), 0)
  const totalWeight = rows.reduce((s, r) => s + Number(r.weight ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile label={isReturns ? 'Loans settled' : 'Loans issued'} value={String(rows.length)} />
        <Tile
          label={isReturns ? 'Principal returned' : 'Total lent out'}
          value={formatCurrency(totalPrincipal)}
        />
        {isReturns ? (
          <Tile label="Interest earned" value={formatCurrency(totalInterest)} tone="good" />
        ) : (
          <Tile label="Weight taken in" value={`${totalWeight.toFixed(3)}g`} />
        )}
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Customer</th>
              <th className="hidden sm:table-cell">Item</th>
              <th className="hidden md:table-cell">Weight</th>
              <th>Principal</th>
              {isReturns && <th className="hidden sm:table-cell">Interest</th>}
              {isReturns && <th>Total</th>}
              {isReturns && <th className="hidden lg:table-cell">Held</th>}
              {!isReturns && <th>Status</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className="text-slate-400 text-xs tabular-nums">#{r.id}</td>
                <td>
                  <Link href={`/loans/${r.id}`} className="hover:text-primary-700 transition-colors">
                    <p className="font-medium text-sm">{r.name}</p>
                    <p className="text-xs text-slate-400">
                      {[r.father_name && `S/o ${r.father_name}`, r.location]
                        .filter(Boolean).join(' · ')}
                    </p>
                  </Link>
                </td>
                <td className="hidden sm:table-cell">
                  <Badge variant={r.category_type === 'Gold' ? 'gold' : 'silver'}>
                    {r.detailed_type || r.category_type}
                  </Badge>
                </td>
                <td className="hidden md:table-cell text-sm text-slate-600 tabular-nums">
                  {formatWeight(r.weight)}
                </td>
                <td className="text-sm font-semibold tabular-nums">
                  {formatCurrency(r.amount)}
                </td>

                {isReturns && (
                  <td className="hidden sm:table-cell text-sm text-emerald-600 tabular-nums">
                    {r.interest ? formatCurrency(r.interest) : '—'}
                  </td>
                )}
                {isReturns && (
                  <td className="text-sm font-semibold tabular-nums">
                    {formatCurrency(Number(r.total_return ?? r.amount))}
                  </td>
                )}
                {isReturns && (
                  <td className="hidden lg:table-cell text-sm text-slate-500 tabular-nums">
                    {r.days_held != null ? `${r.days_held}d` : '—'}
                  </td>
                )}

                {!isReturns && (
                  <td>
                    <Badge variant={r.status === 'active' ? 'active' : 'closed'}>
                      {r.status}
                    </Badge>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-surface-border font-semibold">
              <td colSpan={isReturns ? 4 : 4} className="text-sm text-slate-500">Total</td>
              <td className="text-sm tabular-nums">{formatCurrency(totalPrincipal)}</td>
              {isReturns && (
                <td className="hidden sm:table-cell text-sm text-emerald-600 tabular-nums">
                  {formatCurrency(totalInterest)}
                </td>
              )}
              {isReturns && (
                <td className="text-sm tabular-nums">{formatCurrency(totalReturn)}</td>
              )}
              {isReturns && <td className="hidden lg:table-cell" />}
              {!isReturns && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <div className="card">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-semibold tabular-nums mt-1 ${
        tone === 'good' ? 'text-emerald-600' : 'text-slate-900'
      }`}>
        {value}
      </p>
    </div>
  )
}
