import {
  ArrowDownLeft, ArrowUpRight, Banknote, Landmark, MinusCircle,
  PlusCircle, ReceiptIndianRupee, WalletCards,
} from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'

export interface CashSnapshot {
  openingBalance: number
  cashInHand: number
  addedCash: number
  removedCash: number
  depositCredit: number
  depositDebit: number
  investments: number
  returns: number
  noActivity: boolean
}

const movements = [
  { key: 'addedCash', label: 'Cash added', hint: 'Put into drawer', sign: '+', icon: PlusCircle, tone: 'positive' },
  { key: 'depositCredit', label: 'Deposits received', hint: 'Part-payments taken', sign: '+', icon: ArrowDownLeft, tone: 'positive' },
  { key: 'returns', label: 'Loan returns', hint: 'Settlements received', sign: '+', icon: ReceiptIndianRupee, tone: 'positive' },
  { key: 'removedCash', label: 'Cash removed', hint: 'Taken from drawer', sign: '−', icon: MinusCircle, tone: 'negative' },
  { key: 'investments', label: 'New investments', hint: 'Loans issued today', sign: '−', icon: Landmark, tone: 'negative' },
  { key: 'depositDebit', label: 'Deposits adjusted', hint: 'Offset at settlement', sign: '−', icon: ArrowUpRight, tone: 'negative' },
] as const

export function CashSummary({ data }: { data: CashSnapshot }) {
  return (
    <section className="card p-0 overflow-hidden" aria-labelledby="cash-summary-title">
      <div className="flex flex-col gap-3 border-b border-surface-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <WalletCards className="h-4 w-4 text-primary-700" />
            <h2 id="cash-summary-title" className="text-sm font-semibold text-slate-900">Today&rsquo;s cash position</h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Opening balance plus today&rsquo;s committed cash movements</p>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Opening</p>
            <p className="text-sm font-semibold tabular-nums text-slate-700">{formatCurrency(data.openingBalance)}</p>
          </div>
          <div className="h-8 w-px bg-surface-border" aria-hidden />
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Cash in hand</p>
            <p className="text-xl font-bold tabular-nums text-primary-800">{formatCurrency(data.cashInHand)}</p>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3">
        {movements.map((movement, index) => {
          const Icon = movement.icon
          const value = data[movement.key]
          return (
            <div
              key={movement.key}
              className={cn(
                'flex items-center gap-3 px-4 py-3',
                index > 0 && 'border-t border-surface-border sm:border-t-0',
                index % 2 === 1 && 'sm:border-l',
                index >= 2 && 'sm:border-t',
                index % 3 !== 0 && 'xl:border-l',
                index >= 3 && 'xl:border-t',
                index === 2 && 'sm:border-l-0',
              )}
            >
              <span className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                movement.tone === 'positive'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
              )}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-700">{movement.label}</p>
                <p className="truncate text-[11px] text-slate-400">{movement.hint}</p>
              </div>
              <p className={cn(
                'text-sm font-semibold tabular-nums',
                value === 0 ? 'text-slate-400' : movement.tone === 'positive' ? 'text-emerald-700' : 'text-amber-700'
              )}>
                {movement.sign}{formatCurrency(value)}
              </p>
            </div>
          )
        })}
      </div>

      {data.noActivity && (
        <p className="flex items-center gap-2 border-t border-surface-border bg-slate-50 px-4 py-2 text-xs text-slate-500">
          <Banknote className="h-3.5 w-3.5" />
          No cash movement today; the latest closing balance has been carried forward.
        </p>
      )}
    </section>
  )
}
