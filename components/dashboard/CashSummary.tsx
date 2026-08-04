/**
 * "Current financial position" — the deposit ledger in one strip.
 *
 * The design puts cash in hand and the two cash buttons in the card's header
 * rather than in the body, so the number a shopkeeper checks most often sits on
 * the same line as the two actions that change it.
 *
 * The three cells below are deposits, not cash: money held against active
 * loans, what came in today, and what was written off against settlements. They
 * are deliberately separate from the drawer balance above them.
 */
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
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

  const valueTone = {
    neutral:  'text-ink',
    positive: 'text-green',
    negative: 'text-amber',
  }

  return (
    <section className="card-flush" aria-labelledby="cash-summary-title">
      <div className="flex flex-col gap-3 border-b border-surface-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="cash-summary-title" className="card-title whitespace-nowrap">Current financial position</h2>

        <div className="flex flex-wrap items-center gap-3.5 sm:justify-end">
          <div className="mr-auto whitespace-nowrap text-12 text-ink-muted sm:mr-0">
            Cash in hand{' '}
            {cashError ? (
              <span className="font-semibold text-red">Unavailable</span>
            ) : (
              <span className="text-17 font-bold tabular-nums text-ink">{formatCurrency(data.cashInHand)}</span>
            )}
          </div>
          <Link
            href="/cash"
            className="inline-flex h-[30px] items-center whitespace-nowrap rounded-md border border-green bg-green-bg px-3 text-12.5 font-semibold text-green"
          >
            + Add cash
          </Link>
          <Link
            href="/cash"
            className="inline-flex h-[30px] items-center whitespace-nowrap rounded-md border border-amber bg-amber-bg px-3 text-12.5 font-semibold text-amber"
          >
            − Remove cash
          </Link>
        </div>
      </div>

      {cashError && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border bg-red-bg px-4 py-2 text-12 text-red">
          <span>
            Cash position could not be loaded; loan and portfolio figures remain available.
            No committed data was changed.
          </span>
          <Link href="/dashboard" className="inline-flex items-center gap-1 font-semibold hover:underline">
            <RefreshCw className="h-3 w-3" /> Retry
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3">
        {items.map((item, index) => {
          const content = item.error ? (
            <>
              <p className="text-11.5 text-ink-muted">{item.label}</p>
              <p className="mt-1.5 text-12 font-medium text-red">Could not be loaded</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-11.5 text-ink-muted">{item.label}</span>
                {item.href && <span className="text-11 font-semibold text-primary">View →</span>}
              </div>
              <p className={cn('mt-0.5 text-17 font-bold tabular-nums', valueTone[item.tone])}>
                {item.sign}{formatCurrency(item.value)}
              </p>
              <p className="mt-0.5 text-11.5 text-ink-faint">{item.sub}</p>
            </>
          )

          const classes = cn(
            'px-4 py-3.5 border-b border-surface-border sm:border-b-0 sm:border-r last:border-0 sm:last:border-r-0',
            index === items.length - 1 && 'border-b-0'
          )

          return item.href ? (
            <Link key={item.label} href={item.href} className={cn(classes, 'transition-colors hover:bg-surface-muted')}>
              {content}
            </Link>
          ) : (
            <div key={item.label} className={classes}>{content}</div>
          )
        })}
      </div>

      {data.noActivity && !cashError && (
        <p className="border-t border-surface-border bg-surface-muted px-4 py-2 text-11.5 text-ink-faint">
          No deposit movement today; the latest cash balance is still carried forward.
        </p>
      )}
    </section>
  )
}
