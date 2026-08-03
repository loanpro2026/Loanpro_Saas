'use client'
/**
 * Reports workspace — picker, date controls, results, export.
 *
 * One page rather than six, because a shop owner checking the day's books
 * usually looks at two or three reports in a row and switching pages each time
 * loses the date they had selected.
 */
import { useState, useEffect, useCallback } from 'react'
import { Loader2, Download, FileText, Printer } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  REPORTS, REPORT_COLUMNS, LANDSCAPE_REPORTS, toCsv, downloadCsv, type ReportKey,
} from '@/lib/reports'
import { generateReportPdf, printPdf } from '@/lib/pdf'
import { cn, todayIST, daysAgoIST, formatCurrency, formatDate } from '@/lib/utils'

import { DailyReport } from './DailyReport'
import { LoanTableReport } from './LoanTableReport'
import { AccountReport } from './AccountReport'
import { LocationReport } from './LocationReport'
import { InventoryReport } from './InventoryReport'

type AccountType = 'Investment' | 'Returns' | 'Interest'

export function ReportsWorkspace({
  shopName = 'LoanPro',
  /**
   * Which report to open on. The desktop reaches Investment, Returns and
   * Interest as three separate menu items, so /view-accounts/investment has to
   * land on that report rather than on the daily book with a picker to change.
   */
  initialKey = 'daily',
  initialAccountType = 'Investment',
  /** Hide the report picker when the page already IS one report. */
  lockToInitial = false,
}: {
  shopName?: string
  initialKey?: ReportKey
  initialAccountType?: AccountType
  lockToInitial?: boolean
}) {
  const [key, setKey] = useState<ReportKey>(initialKey)
  const [printing, setPrinting] = useState(false)
  const [date, setDate] = useState(todayIST())
  const [start, setStart] = useState(daysAgoIST(30))
  const [end, setEnd] = useState(todayIST())
  const [accountType, setAccountType] = useState<AccountType>(initialAccountType)

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const meta = REPORTS.find(r => r.key === key)!

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const supabase = createClient()

    try {
      let res
      switch (key) {
        case 'daily':
          res = await supabase.rpc('daily_report', { p_date: date }); break
        case 'investment':
          res = await supabase.rpc('investment_report', { p_date: date }); break
        case 'returns':
          res = await supabase.rpc('returns_report', { p_date: date }); break
        case 'account':
          res = await supabase.rpc('account_report',
            { p_type: accountType, p_start: start, p_end: end }); break
        case 'location':
          res = await supabase.rpc('location_report',
            { p_locations: null, p_start: start, p_end: end }); break
        case 'inventory':
          res = await supabase.rpc('inventory_report'); break
      }

      if (res?.error) throw new Error(res.error.message)
      setData(res?.data ?? null)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load this report')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [key, date, start, end, accountType])

  useEffect(() => { load() }, [load])

  /** The daily report is a single object; every other report is an array. */
  const asRows = (): Record<string, unknown>[] => {
    if (!data) return []
    if (Array.isArray(data)) return data

    // Flatten the daily summary into label/value pairs so it exports as a
    // readable ledger rather than one wide unreadable row.
    const d = data as Record<string, unknown>
    const n = (k: string) => Number(d[k] ?? 0)
    return [
      { label: 'Opening balance',   value: n('cash_balance') },
      { label: 'Cash added',        value: n('added_cash') },
      { label: 'Deposits received', value: n('deposit_credit') },
      { label: 'Loans settled',     value: n('returns') },
      { label: 'Cash removed',      value: -n('removed_cash') },
      { label: 'New loans issued',  value: -n('investments') },
      { label: 'Deposits credited', value: -n('deposit_debit') },
      { label: 'Cash in hand',      value: n('left_cash') },
    ]
  }

  const periodLabel = () =>
    meta.input === 'date-range' ? `${formatDate(start)} – ${formatDate(end)}`
      : meta.input === 'single-date' ? formatDate(date)
      : `As at ${formatDate(todayIST())}`

  const fileStamp = () =>
    meta.input === 'date-range' ? `${start}_to_${end}`
      : meta.input === 'single-date' ? date
      : todayIST()

  const onExportCsv = () => {
    const rows = asRows()
    if (rows.length === 0) {
      toast.error(`${meta.title} has no rows for ${periodLabel()}, so no CSV was created.`)
      return
    }
    downloadCsv(`loanpro-${key}-${fileStamp()}.csv`, toCsv(rows, REPORT_COLUMNS[key]))
    toast.success(`${meta.title} CSV downloaded with ${rows.length} row${rows.length === 1 ? '' : 's'}.`)
  }

  const onPrint = async () => {
    const rows = asRows()
    if (rows.length === 0) {
      toast.error(`${meta.title} has no rows for ${periodLabel()}, so no PDF was created.`)
      return
    }

    setPrinting(true)
    const notice = toast.loading(`Generating ${meta.title} PDF for ${periodLabel()}…`)
    try {
      const blob = await generateReportPdf({
        title: meta.title,
        shopName,
        period: periodLabel(),
        columns: REPORT_COLUMNS[key],
        rows,
        summary: buildSummary(key, rows, data),
        footnote: key === 'inventory'
          ? 'Weights are shown in grams. Values are the amounts lent, not market value.'
          : undefined,
        orientation: LANDSCAPE_REPORTS.includes(key) ? 'landscape' : 'portrait',
      })
      printPdf(blob)
      toast.success(`${meta.title} PDF is ready in the print window.`, { id: notice })
    } catch (e: any) {
      toast.error(
        `The ${meta.title} PDF could not be generated. ${e?.message ?? 'Please retry the same period.'}`,
        { id: notice }
      )
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Report picker. Hidden when the page is already one specific report —
          /view-accounts/investment showing a row of buttons to switch to the
          daily book would just be a second, competing navigation. */}
      <div className={cn('flex gap-2 overflow-x-auto pb-1 -mx-1 px-1', lockToInitial && 'hidden')}>
        {REPORTS.map(r => (
          <button
            key={r.key}
            onClick={() => setKey(r.key)}
            className={cn(
              'shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors border',
              key === r.key
                ? 'bg-primary-700 text-white border-primary-700'
                : 'bg-white text-slate-600 border-surface-border hover:border-slate-300'
            )}
          >
            {r.title}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="card flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-48">
          <p className="text-sm font-medium text-slate-900">{meta.title}</p>
          <p className="text-xs text-slate-500">{meta.description}</p>
        </div>

        {meta.input === 'single-date' && (
          <div>
            <label htmlFor="rep-date" className="label">Date</label>
            <input
              id="rep-date" type="date" className="input w-44"
              value={date} max={todayIST()}
              onChange={e => setDate(e.target.value)}
            />
          </div>
        )}

        {meta.input === 'date-range' && (
          <>
            <div>
              <label htmlFor="rep-start" className="label">From</label>
              <input
                id="rep-start" type="date" className="input w-40"
                value={start} max={end}
                onChange={e => setStart(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="rep-end" className="label">To</label>
              <input
                id="rep-end" type="date" className="input w-40"
                value={end} min={start} max={todayIST()}
                onChange={e => setEnd(e.target.value)}
              />
            </div>
          </>
        )}

        {key === 'account' && (
          <div className="w-44">
            <Select
              label="Showing"
              value={accountType}
              onChange={e => setAccountType(e.target.value as any)}
              options={[
                { value: 'Investment', label: 'Money lent out' },
                { value: 'Returns',    label: 'Money returned' },
                { value: 'Interest',   label: 'Interest earned' },
              ]}
            />
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onExportCsv} disabled={loading || !data}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button
            variant="secondary" size="sm" onClick={onPrint}
            loading={printing} disabled={loading || !data}
          >
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {/* Result */}
      {loading ? (
        <div className="card p-5 space-y-4" role="status" aria-label={`Loading ${meta.title}`}>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading {meta.title.toLowerCase()}…
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="skeleton h-16" /><div className="skeleton h-16" /><div className="skeleton h-16" />
          </div>
          <div className="skeleton h-10" />
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-8" />)}
        </div>
      ) : error ? (
        <EmptyState
          icon={FileText}
          title="Could not load this report"
          description={error}
          action={<Button size="sm" onClick={load}>Try again</Button>}
        />
      ) : (
        <>
          {key === 'daily'      && <DailyReport data={data} />}
          {key === 'investment' && <LoanTableReport rows={data ?? []} variant="investment" date={date} />}
          {key === 'returns'    && <LoanTableReport rows={data ?? []} variant="returns" date={date} />}
          {key === 'account'    && <AccountReport rows={data ?? []} type={accountType} />}
          {key === 'location'   && <LocationReport rows={data ?? []} />}
          {key === 'inventory'  && <InventoryReport rows={data ?? []} />}
        </>
      )}
    </div>
  )
}

/**
 * The figures that go in the summary box at the top of a printed report —
 * the numbers a shop owner checks first before reading the table.
 */
function buildSummary(
  key: ReportKey,
  rows: Record<string, unknown>[],
  raw: unknown
): Array<{ label: string; value: string }> {
  const sum = (k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0)

  switch (key) {
    case 'daily': {
      const d = (raw ?? {}) as Record<string, unknown>
      return [
        { label: 'Opening balance', value: formatCurrency(Number(d.cash_balance ?? 0)) },
        { label: 'Lent out',        value: formatCurrency(Number(d.investments ?? 0)) },
        { label: 'Cash in hand',    value: formatCurrency(Number(d.left_cash ?? 0)) },
      ]
    }
    case 'investment':
      return [
        { label: 'Loans issued', value: String(rows.length) },
        { label: 'Total lent',   value: formatCurrency(sum('amount')) },
        { label: 'Weight taken', value: `${sum('weight').toFixed(3)}g` },
      ]
    case 'returns':
      return [
        { label: 'Loans settled',     value: String(rows.length) },
        { label: 'Principal back',    value: formatCurrency(sum('amount')) },
        { label: 'Interest earned',   value: formatCurrency(sum('interest')) },
      ]
    case 'account':
      return [
        { label: 'Days with activity', value: String(rows.length) },
        { label: 'Transactions',       value: String(sum('count')) },
        { label: 'Total',              value: formatCurrency(sum('amount')) },
      ]
    case 'location':
      return [
        { label: 'Places',      value: String(rows.length) },
        { label: 'Loans',       value: String(sum('loan_count')) },
        { label: 'Outstanding', value: formatCurrency(sum('active_amount')) },
      ]
    case 'inventory':
      return [
        { label: 'Item types', value: String(rows.length) },
        { label: 'Pieces',     value: String(sum('item_count')) },
        { label: 'Value held', value: formatCurrency(sum('total_amount')) },
      ]
    default:
      return []
  }
}
