import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, Banknote, RefreshCw } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

export interface CashSnapshot {
  cashInHand: number
  totalDeposits: number
  depositCredit: number
  depositDebit: number
  noActivity: boolean
}

interface FinancialItem {
  label: string
  value: number
  sign: string
  sub: string
  tone: 'neutral' | 'positive' | 'negative'
  error: boolean
  href?: string
}

export function CashSummary({
  data,
  cashError = false,
  depositsError = false,
}: {
  data: CashSnapshot
  cashError?: boolean
  depositsError?: boolean
}) {
  const items: FinancialItem[] = [
    {
      label: 'Total deposits held', value: data.totalDeposits, sign: '',
      sub: 'Across active loan deposit history', tone: 'neutral', error: depositsError,
    },
    {
      label: 'Deposits received', value: data.depositCredit, sign: '+ ',
      sub: 'Today · customer part-payments', tone: 'positive', error: cashError,
      href: '/day-end',
    },
    {
      label: 'Deposits adjusted', value: data.depositDebit, sign: '− ',
      sub: 'Today · offset at settlement', tone: 'negative', error: cashError,
      href: '/day-end',
    },
  ]

  return (
    <section className="card overflow-hidden p-0" aria-labelledby="cash-summary-title">
      <div className="flex flex-col gap-3 border-b border-surface-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="cash-summary-title" className="text-sm font-bold text-slate-900">Current financial position</h2>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <div className="mr-auto text-xs text-slate-500 sm:mr-1">
            Cash in hand{' '}
            {cashError ? (
              <span className="font-semibold text-red-700">Unavailable</span>
            ) : (
              <span className="text-lg font-bold tabular-nums text-slate-900">{formatCurrency(data.cashInHand)}</span>
            )}
          </div>
          <Link href="/cash" className="inline-flex min-h-9 items-center rounded-lg border border-emerald-600 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
            + Add cash
          </Link>
          <Link href="/cash" className="inline-flex min-h-9 items-center rounded-lg border border-amber-600 bg-amber-50 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-100">
            − Remove cash
          </Link>
        </div>
      </div>

      {cashError && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          <span>Cash position could not be loaded; loan and portfolio figures remain available. No committed data was changed.</span>
          <Link href="/dashboard" className="inline-flex items-center gap-1 font-semibold text-red-700 hover:underline">
            <RefreshCw className="h-3 w-3" /> Retry
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3">
        {items.map((item, index) => {
          const content = item.error ? (
            <>
              <p className="text-xs font-semibold text-slate-600">{item.label}</p>
              <p className="mt-2 text-xs font-medium text-red-700">Could not be loaded</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                {item.tone === 'positive' && <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-700" />}
                {item.tone === 'negative' && <ArrowUpRight className="h-3.5 w-3.5 text-amber-700" />}
                <p className="text-xs font-medium text-slate-600">{item.label}</p>
              </div>
              <p className={cn(
                'mt-1 text-base font-bold tabular-nums',
                item.tone === 'positive' ? 'text-emerald-700' : item.tone === 'negative' ? 'text-amber-700' : 'text-slate-900'
              )}>
                {item.sign}{formatCurrency(item.value)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">{item.sub}</p>
            </>
          )

          const classes = cn(
            'min-h-[92px] p-3.5 sm:p-4',
            index === 0 && 'col-span-2 border-b border-surface-border sm:col-span-1 sm:border-b-0',
            index > 1 && 'border-l border-surface-border',
            index === 1 && 'sm:border-l sm:border-surface-border',
          )

          return item.href ? (
            <Link key={item.label} href={item.href} className={`${classes} transition-colors hover:bg-slate-50`}>
              {content}
            </Link>
          ) : (
            <div key={item.label} className={classes}>{content}</div>
          )
        })}
      </div>

      {data.noActivity && !cashError && (
        <p className="flex items-center gap-2 border-t border-surface-border bg-slate-50 px-4 py-2 text-xs text-slate-500">
          <Banknote className="h-3.5 w-3.5" />
          No deposit movement today; the latest cash balance is still carried forward.
        </p>
      )}
    </section>
  )
}
