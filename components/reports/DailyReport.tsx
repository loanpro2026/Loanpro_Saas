'use client'
/**
 * The day's cash book.
 *
 * Laid out as a ledger that adds up on screen, because a shop owner reconciles
 * this against the physical cash in the drawer at closing time. Every line has
 * an explicit sign so the arithmetic can be followed down the column.
 */
import { formatCurrency } from '@/lib/utils'
import { useAppDate } from '@/components/settings/SettingsProvider'
import { Wallet, TrendingDown, TrendingUp } from 'lucide-react'

interface Daily {
  date: string
  no_activity: boolean
  cash_balance: number
  added_cash: number
  removed_cash: number
  deposit_credit: number
  deposit_debit: number
  investments: number
  returns: number
  left_cash: number
}

export function DailyReport({ data }: { data: Daily | null }) {
  const formatDate = useAppDate()
  if (!data) return null

  const n = (v: unknown) => Number(v ?? 0)

  const lines: Array<{ label: string; value: number; sign: '+' | '−'; hint?: string }> = [
    { label: 'Cash added',         value: n(data.added_cash),     sign: '+', hint: 'Money put into the drawer' },
    { label: 'Deposits received',  value: n(data.deposit_credit), sign: '+', hint: 'Part-payments from customers' },
    { label: 'Loans settled',      value: n(data.returns),        sign: '+', hint: 'Principal + interest returned' },
    { label: 'Cash removed',       value: n(data.removed_cash),   sign: '−', hint: 'Money taken out' },
    { label: 'New loans issued',   value: n(data.investments),    sign: '−', hint: 'Money lent to customers' },
    { label: 'Deposits credited',  value: n(data.deposit_debit),  sign: '−', hint: 'Offset against loans closed today' },
  ]

  const opening = n(data.cash_balance)
  const closing = n(data.left_cash)
  const movement = closing - opening

  return (
    <div className="space-y-5">
      {data.no_activity && (
        <p className="text-sm text-slate-500 bg-surface-muted rounded-xl px-4 py-3">
          No trading recorded on {formatDate(data.date)}. The balance shown is carried
          forward from the last day with activity.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={Wallet} label="Opening balance"
          value={formatCurrency(opening)} tone="neutral"
        />
        <SummaryCard
          icon={movement >= 0 ? TrendingUp : TrendingDown}
          label="Net movement"
          value={`${movement >= 0 ? '+' : '−'}${formatCurrency(Math.abs(movement))}`}
          tone={movement >= 0 ? 'good' : 'bad'}
        />
        <SummaryCard
          icon={Wallet} label="Cash in hand"
          value={formatCurrency(closing)} tone="strong"
        />
      </div>

      <div className="card">
        <h2 className="card-title mb-3">
          Movement on {formatDate(data.date)}
        </h2>

        <div className="divide-y divide-surface-border">
          <Row label="Opening balance" value={opening} bold />

          {lines.map(l => (
            <Row
              key={l.label}
              label={l.label}
              hint={l.hint}
              value={l.value}
              sign={l.sign}
              muted={l.value === 0}
            />
          ))}

          <Row label="Cash in hand at close" value={closing} bold />
        </div>
      </div>
    </div>
  )
}

function SummaryCard({
  icon: Icon, label, value, tone,
}: {
  icon: React.ElementType
  label: string
  value: string
  tone: 'neutral' | 'good' | 'bad' | 'strong'
}) {
  const tones = {
    neutral: 'text-slate-900',
    good:    'text-emerald-600',
    bad:     'text-red-600',
    strong:  'text-primary-700',
  }
  return (
    <div className="card">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-xl font-semibold tabular-nums mt-1 ${tones[tone]}`}>{value}</p>
    </div>
  )
}

function Row({
  label, value, sign, hint, bold, muted,
}: {
  label: string
  value: number
  sign?: '+' | '−'
  hint?: string
  bold?: boolean
  muted?: boolean
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2.5 ${muted ? 'opacity-50' : ''}`}>
      <div className="min-w-0">
        <p className={`text-sm ${bold ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
          {label}
        </p>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
      <p className={`tabular-nums shrink-0 ${
        bold ? 'text-base font-semibold text-slate-900'
             : sign === '+' ? 'text-sm text-emerald-600'
             : sign === '−' ? 'text-sm text-red-600'
             : 'text-sm text-slate-700'
      }`}>
        {sign && value !== 0 ? `${sign} ` : ''}{formatCurrency(value)}
      </p>
    </div>
  )
}
