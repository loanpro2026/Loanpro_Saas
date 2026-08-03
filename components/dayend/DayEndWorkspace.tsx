'use client'
/**
 * End-of-day review.
 *
 * Two lists the desktop keeps as separate screens, shown together because
 * they are read together: money that came back in today (settlements) and
 * money paid in against open loans (part-payments). Their sum is what should
 * be in the drawer over and above the opening balance.
 */
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  Loader2, Archive, ArrowDownCircle, CheckCheck, Printer, Wallet,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { formatCurrency, formatDate, todayIST } from '@/lib/utils'
import { generateReportPdf, printPdf } from '@/lib/pdf'

interface Removed {
  id: number; loan_id: number; name: string; father_name: string | null
  location: string | null; amount: number; detailed_type: string | null
  issue_date: string; closed_date: string; total_deposits: number
}

interface DailyDeposit {
  id: number; loan_id: number; loan_name: string; father_name: string | null
  location: string | null; loan_amount: number; detailed_type: string | null
  deposit_amount: number; deposit_date: string
}

export function DayEndWorkspace({ shopName = 'LoanPro' }: { shopName?: string }) {
  const [date, setDate] = useState(todayIST())
  const [removed, setRemoved] = useState<Removed[]>([])
  const [deposits, setDeposits] = useState<DailyDeposit[]>([])
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState(false)
  const [clearing, setClearing] = useState<'removed' | 'deposits' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [r, d] = await Promise.all([
      supabase.rpc('removed_records_report', { p_date: date }),
      supabase.rpc('daily_deposits_report', { p_date: date }),
    ])
    if (r.error || d.error) {
      toast.error(
        `The ${formatDate(date)} day-end lists could not be loaded. ${r.error?.message ?? d.error?.message ?? 'Please retry.'}`
      )
    }
    setRemoved(r.error ? [] : (r.data as Removed[]) ?? [])
    setDeposits(d.error ? [] : (d.data as DailyDeposit[]) ?? [])
    setLoading(false)
  }, [date])

  useEffect(() => { void load() }, [load])

  const depositTotal = deposits.reduce((s, d) => s + Number(d.deposit_amount), 0)
  const settledDeposits = removed.reduce((s, r) => s + Number(r.total_deposits), 0)
  const settledPrincipal = removed.reduce((s, r) => s + Number(r.amount), 0)

  const doClear = async (which: 'removed' | 'deposits') => {
    const supabase = createClient()
    const fn = which === 'removed' ? 'clear_removed_records' : 'clear_daily_deposits'
    const { data, error } = await supabase.rpc(fn, { p_date: date })

    if (error) {
      toast.error(`The ${which === 'removed' ? 'settlement' : 'part-payment'} checklist was not cleared. ${error.message}`)
      return
    }
    toast.success(`${data ?? 0} ${which === 'removed' ? 'settlement' : 'part-payment'} entr${data === 1 ? 'y' : 'ies'} marked as checked.`)
    setClearing(null)
    void load()
  }

  const onPrint = async () => {
    const rows = [
      ...removed.map(r => ({
        kind: 'Settled', loan: `#${r.loan_id}`, name: r.name,
        item: r.detailed_type ?? '', principal: r.amount, deposits: r.total_deposits,
      })),
      ...deposits.map(d => ({
        kind: 'Part-payment', loan: `#${d.loan_id}`, name: d.loan_name,
        item: d.detailed_type ?? '', principal: d.loan_amount, deposits: d.deposit_amount,
      })),
    ]
    if (rows.length === 0) {
      toast.error(`There are no settlements or part-payments on ${formatDate(date)} to include in a PDF.`)
      return
    }

    setPrinting(true)
    const notice = toast.loading(`Generating the ${formatDate(date)} end-of-day PDF…`)
    try {
      const blob = await generateReportPdf({
        title: 'End of day',
        shopName,
        period: formatDate(date),
        columns: [
          { key: 'kind', label: 'Type' },
          { key: 'loan', label: 'Loan', numeric: true },
          { key: 'name', label: 'Customer' },
          { key: 'item', label: 'Item' },
          { key: 'principal', label: 'Principal', numeric: true },
          { key: 'deposits', label: 'Deposits', numeric: true },
        ],
        rows,
        summary: [
          { label: 'Loans settled', value: String(removed.length) },
          { label: 'Part-payments', value: formatCurrency(depositTotal) },
          { label: 'Deposits on settled loans', value: formatCurrency(settledDeposits) },
        ],
      })
      printPdf(blob)
      toast.success(`End-of-day PDF for ${formatDate(date)} is ready in the print window.`, { id: notice })
    } catch (error) {
      toast.error(
        `The end-of-day PDF could not be generated. ${error instanceof Error ? error.message : 'Please try again.'}`,
        { id: notice }
      )
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="dayend-date" className="label">Date</label>
          <input
            id="dayend-date" type="date" className="input w-44"
            value={date} max={todayIST()}
            onChange={e => setDate(e.target.value)}
          />
        </div>
        <div className="flex-1 min-w-40">
          <p className="text-xs text-slate-500">
            These lists are cleared automatically each night. Clearing them by
            hand marks the day as checked.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onPrint} loading={printing} disabled={loading}>
          {!printing && <Printer className="h-4 w-4" />} {printing ? 'Generating PDF' : 'Print'}
        </Button>
      </div>

      {loading ? (
        <div className="card flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {/* Money in */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Tile
              icon={Archive} label="Loans settled today"
              value={String(removed.length)}
              sub={formatCurrency(settledPrincipal) + ' principal'}
            />
            <Tile
              icon={ArrowDownCircle} label="Part-payments taken"
              value={formatCurrency(depositTotal)}
              sub={`${deposits.length} payment${deposits.length === 1 ? '' : 's'}`}
              tone="good"
            />
            <Tile
              icon={Wallet} label="Deposits on settled loans"
              value={formatCurrency(settledDeposits)}
              sub="Already held, offset at closing"
            />
          </div>

          {/* Settlements with deposits */}
          <Section
            title="Settled today, with part-payments"
            hint="Loans closed today that had money already paid in. Check the deposit was offset correctly."
            count={removed.length}
            onClear={removed.length ? () => setClearing('removed') : undefined}
          >
            {removed.length === 0 ? (
              <EmptyState
                icon={Archive}
                title="None"
                description="No loans with part-payments were settled on this date."
              />
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Loan</th><th>Customer</th>
                      <th className="hidden sm:table-cell">Item</th>
                      <th>Principal</th><th>Deposits held</th>
                    </tr>
                  </thead>
                  <tbody>
                    {removed.map(r => (
                      <tr key={r.id}>
                        <td className="text-xs text-slate-400 tabular-nums">#{r.loan_id}</td>
                        <td>
                          <Link href={`/loans/${r.loan_id}`} className="hover:text-primary-700">
                            <p className="text-sm font-medium">{r.name}</p>
                            <p className="text-xs text-slate-400">
                              {[r.father_name && `S/o ${r.father_name}`, r.location]
                                .filter(Boolean).join(' · ')}
                            </p>
                          </Link>
                        </td>
                        <td className="hidden sm:table-cell text-sm text-slate-600">
                          {r.detailed_type || '—'}
                        </td>
                        <td className="text-sm font-semibold tabular-nums">
                          {formatCurrency(r.amount)}
                        </td>
                        <td className="text-sm text-emerald-600 tabular-nums">
                          {formatCurrency(r.total_deposits)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Part-payments */}
          <Section
            title="Part-payments taken today"
            hint="Every deposit recorded on this date, across all open loans."
            count={deposits.length}
            onClear={deposits.length ? () => setClearing('deposits') : undefined}
          >
            {deposits.length === 0 ? (
              <EmptyState
                icon={ArrowDownCircle}
                title="None"
                description="No part-payments were recorded on this date."
              />
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Loan</th><th>Customer</th>
                      <th className="hidden sm:table-cell">Item</th>
                      <th className="hidden md:table-cell">Loan amount</th>
                      <th>Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deposits.map(d => (
                      <tr key={d.id}>
                        <td className="text-xs text-slate-400 tabular-nums">#{d.loan_id}</td>
                        <td>
                          <Link href={`/loans/${d.loan_id}`} className="hover:text-primary-700">
                            <p className="text-sm font-medium">{d.loan_name}</p>
                            <p className="text-xs text-slate-400">
                              {[d.father_name && `S/o ${d.father_name}`, d.location]
                                .filter(Boolean).join(' · ')}
                            </p>
                          </Link>
                        </td>
                        <td className="hidden sm:table-cell text-sm text-slate-600">
                          {d.detailed_type || '—'}
                        </td>
                        <td className="hidden md:table-cell text-sm text-slate-500 tabular-nums">
                          {formatCurrency(d.loan_amount)}
                        </td>
                        <td className="text-sm font-semibold text-emerald-600 tabular-nums">
                          {formatCurrency(d.deposit_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-surface-border font-semibold">
                      <td colSpan={4} className="text-sm text-slate-500">Total</td>
                      <td className="text-sm tabular-nums">{formatCurrency(depositTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Section>
        </>
      )}

      <Modal
        open={clearing !== null}
        onClose={() => setClearing(null)}
        title="Clear this list?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This removes the working list for {formatDate(date)} only.
          </p>
          <p className="text-sm text-slate-600">
            <strong>Your loans and deposits are not affected.</strong> Reports
            for this date will still show the same figures — this list is just a
            checklist, and clearing it marks the day as reconciled.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setClearing(null)}>Cancel</Button>
            <Button onClick={() => clearing && doClear(clearing)}>
              <CheckCheck className="h-4 w-4" /> Clear
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Section({
  title, hint, count, onClear, children,
}: {
  title: string; hint: string; count: number
  onClear?: () => void; children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            {title} <span className="text-slate-400 font-normal">({count})</span>
          </h2>
          <p className="text-xs text-slate-500">{hint}</p>
        </div>
        {onClear && (
          <Button size="sm" variant="ghost" onClick={onClear}>
            <CheckCheck className="h-4 w-4" /> Mark checked
          </Button>
        )}
      </div>
      {children}
    </div>
  )
}

function Tile({
  icon: Icon, label, value, sub, tone,
}: {
  icon: React.ElementType; label: string; value: string; sub?: string; tone?: 'good'
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-xl font-semibold tabular-nums mt-1 ${
        tone === 'good' ? 'text-emerald-600' : 'text-slate-900'
      }`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}
