'use client'
/**
 * Remove Record — the settle-a-loan workspace.
 *
 * Ported from electron_app/renderer/src/pages/Removerecord.tsx. The desktop
 * does this on one screen: filter down to the record, then everything about it
 * — deposits, remarks, the identity photo, the interest due — in a panel
 * beside the results, with the settle action at the bottom. Keeping that shape
 * matters more than it might look: settling a loan is the moment money changes
 * hands across the counter, and making the shopkeeper navigate away to check a
 * deposit or a photo is how mistakes happen.
 *
 * Two deliberate differences from the desktop:
 *
 *   1. Interest comes from the server (loan_detail.suggested_interest, which
 *      calls calculate_interest). The desktop recomputes it in the browser from
 *      the settings. Same formula, but doing it once server-side means the
 *      figure shown here and the figure close_loan writes cannot disagree.
 *
 *   2. The closure date is its own field. On the desktop the search-by-date
 *      box doubles as the closing date, so filtering to an old date and then
 *      settling backdates the closure to it. That may be intentional; it reads
 *      like an accident. Here it defaults to today and is set explicitly.
 */
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Search, FileText, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { DepositHistory } from '@/components/loans/DepositHistory'
import { RemarksLog } from '@/components/loans/RemarksLog'
import { LoanPhoto } from '@/components/loans/LoanPhoto'
import { closeLoan } from '@/app/(app)/loans/actions'
import { formatCurrency, formatDate, getLoanAge, todayIST } from '@/lib/utils'
import type { LoanDetailPayload } from '@/types/rpc'
import type { Tables } from '@/types/supabase'

/** The desktop's four brackets, kept verbatim. */
const AMOUNT_RANGES = [
  { value: '',             label: 'All' },
  { value: '0-5000',       label: '0 – 5,000' },
  { value: '5000-10000',   label: '5,000 – 10,000' },
  { value: '10000-15000',  label: '10,000 – 15,000' },
  { value: 'above-15000',  label: 'Above 15,000' },
] as const

const BOUNDS: Record<string, [number, number | null]> = {
  '0-5000':      [0, 5000],
  '5000-10000':  [5000, 10000],
  '10000-15000': [10000, 15000],
  'above-15000': [15000, null],
}

type SearchBy = 'Name' | 'Location' | 'Date'
type LoanRow = Pick<
  Tables<'loans'>,
  'id' | 'name' | 'father_name' | 'location' | 'amount'
  | 'category_type' | 'detailed_type' | 'weight' | 'issue_date'
>

export function RemoveRecordWorkspace({ canDelete }: { canDelete: boolean }) {
  const router = useRouter()

  // ── Filters ───────────────────────────────────────────────────────────────
  const [searchBy, setSearchBy]       = useState<SearchBy>('Name')
  const [term, setTerm]               = useState('')
  const [searchDate, setSearchDate]   = useState(todayIST())
  const [amountRange, setAmountRange] = useState('')
  const [newestFirst, setNewestFirst] = useState(true)

  const [rows, setRows]       = useState<LoanRow[]>([])
  const [loading, setLoading] = useState(false)

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail]         = useState<LoanDetailPayload | null>(null)
  const [closureDate, setClosureDate] = useState(todayIST())
  const [interest, setInterest]     = useState('')
  const [settling, setSettling]     = useState(false)

  const search = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      let q = supabase
        .from('loans')
        .select('id, name, father_name, location, amount, category_type, detailed_type, weight, issue_date')
        .eq('status', 'active')

      if (searchBy === 'Name'     && term.trim()) q = q.ilike('name', `%${term.trim()}%`)
      if (searchBy === 'Location' && term.trim()) q = q.ilike('location', `%${term.trim()}%`)
      if (searchBy === 'Date')                    q = q.eq('issue_date', searchDate)

      const bounds = BOUNDS[amountRange]
      if (bounds) {
        q = q.gte('amount', bounds[0])
        if (bounds[1] !== null) q = q.lt('amount', bounds[1])
      }

      // Filtering and sorting run in Postgres, not here. The desktop sorts an
      // already-loaded array because its whole table is local; a shop with
      // thousands of loans would otherwise be shipping all of them to the
      // browser to show twenty.
      q = q.order('issue_date', { ascending: !newestFirst })
           .order('id',         { ascending: !newestFirst })
           .limit(100)

      const { data, error } = await q
      if (error) throw new Error(error.message)
      setRows(data ?? [])
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not search')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [searchBy, term, searchDate, amountRange, newestFirst])

  useEffect(() => { void search() }, [search])

  // Load everything about the chosen record in one round trip.
  useEffect(() => {
    if (selectedId === null) { setDetail(null); return }
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('loan_detail', { p_loan_id: selectedId })
      if (cancelled) return
      if (error) { toast.error(error.message); setDetail(null); return }

      const d = (data ?? null) as LoanDetailPayload | null
      setDetail(d)
      setClosureDate(todayIST())
      // Prefill with what the server says is due. The shopkeeper can override —
      // rounding a settlement down is a normal courtesy — but the default must
      // be the computed figure, not blank.
      setInterest(String(Math.round(d?.suggested_interest ?? 0)))
    })()
    return () => { cancelled = true }
  }, [selectedId])

  const loan = detail?.loan ?? null
  const totalDeposits = detail?.total_deposits ?? 0
  const outstanding = (loan?.amount ?? 0) - totalDeposits
  const dueNow = outstanding + (Number(interest) || 0)

  const settle = async () => {
    if (!loan) return
    const value = Number(interest)
    if (!Number.isFinite(value) || value < 0) {
      toast.error('Interest must be zero or more')
      return
    }
    setSettling(true)
    try {
      const res = await closeLoan(loan.id, value, closureDate)
      if (!res.ok) throw new Error(res.error ?? 'Could not settle this loan')
      toast.success(`Loan #${loan.id} settled`)
      setRows(r => r.filter(x => x.id !== loan.id))
      setSelectedId(null)
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not settle this loan')
    } finally {
      setSettling(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      {/* ── Search ────────────────────────────────────────────────────────── */}
      <div className="lg:col-span-2 space-y-4">
        <div className="card space-y-3">
          <Select
            label="Search By"
            value={searchBy}
            onChange={e => { setSearchBy(e.target.value as SearchBy); setTerm('') }}
            options={[
              { value: 'Name',     label: 'Name' },
              { value: 'Location', label: 'Location' },
              { value: 'Date',     label: 'Date' },
            ]}
          />

          {searchBy === 'Date' ? (
            <Input
              label="Issue date"
              type="date"
              value={searchDate}
              onChange={e => setSearchDate(e.target.value)}
            />
          ) : (
            <Input
              label={searchBy}
              placeholder={`Enter ${searchBy.toLowerCase()}`}
              value={term}
              onChange={e => setTerm(e.target.value)}
            />
          )}

          <Select
            label="Amount range"
            value={amountRange}
            onChange={e => setAmountRange(e.target.value)}
            options={AMOUNT_RANGES.map(r => ({ value: r.value, label: r.label }))}
          />

          <Select
            label="Date order"
            value={newestFirst ? 'newest' : 'oldest'}
            onChange={e => setNewestFirst(e.target.value === 'newest')}
            options={[
              { value: 'newest', label: 'Newest first' },
              { value: 'oldest', label: 'Oldest first' },
            ]}
          />
        </div>

        <div className="card p-0 overflow-hidden">
          <p className="px-4 py-2.5 text-xs font-medium text-slate-500 border-b border-surface-border">
            {loading ? 'Searching…' : `${rows.length} active record${rows.length === 1 ? '' : 's'}`}
          </p>

          {!loading && rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Search}
                title="No records found"
                description="Use the filters above to find a record."
              />
            </div>
          ) : (
            <ul className="divide-y divide-surface-border max-h-[26rem] overflow-y-auto">
              {rows.map(r => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full text-left px-4 py-2.5 transition-colors ${
                      selectedId === r.id ? 'bg-primary-50' : 'hover:bg-slate-50'
                    }`}
                    aria-current={selectedId === r.id ? 'true' : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 tabular-nums w-10 shrink-0">#{r.id}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">{r.name}</span>
                        <span className="block text-xs text-slate-400 truncate">
                          {formatDate(r.issue_date)} · {getLoanAge(r.issue_date)}
                          {r.location ? ` · ${r.location}` : ''}
                        </span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums shrink-0">
                        {formatCurrency(r.amount)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── The chosen record ─────────────────────────────────────────────── */}
      <div className="lg:col-span-3 space-y-4">
        {!loan ? (
          <div className="card">
            <EmptyState
              icon={FileText}
              title="No record selected"
              description="Pick a record on the left to see its deposits, remarks and photo, and to settle it."
            />
          </div>
        ) : (
          <>
            <div className="card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900 truncate">
                    #{loan.id} · {loan.name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {loan.father_name ? `S/o ${loan.father_name} · ` : ''}
                    {formatDate(loan.issue_date)} · held {getLoanAge(loan.issue_date)}
                  </p>
                </div>
                <Badge variant={loan.category_type === 'Gold' ? 'gold' : 'silver'}>
                  {loan.detailed_type || loan.category_type}
                </Badge>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-slate-500">Principal</dt>
                  <dd className="font-semibold tabular-nums">{formatCurrency(loan.amount)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Deposits</dt>
                  <dd className="font-semibold tabular-nums">{formatCurrency(totalDeposits)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Outstanding</dt>
                  <dd className="font-semibold tabular-nums">{formatCurrency(outstanding)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Weight</dt>
                  <dd className="font-semibold tabular-nums">
                    {loan.weight ? `${loan.weight}g` : '—'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Settle */}
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Settle this loan</h3>

              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Interest charged"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={interest}
                  onChange={e => setInterest(e.target.value)}
                  helper="Rupees, not a rate. Prefilled from the shop's interest setting."
                />
                <Input
                  label="Closure date"
                  type="date"
                  value={closureDate}
                  onChange={e => setClosureDate(e.target.value)}
                  helper="Defaults to today."
                />
              </div>

              <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Customer pays now</span>
                  <span className="font-semibold tabular-nums text-base">
                    {formatCurrency(dueNow)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatCurrency(outstanding)} outstanding + {formatCurrency(Number(interest) || 0)} interest
                </p>
              </div>

              {detail?.photos?.collection == null && (
                <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
                  <span>
                    No collection photo yet. If your shop requires one at closing,
                    capture it below before settling — the server will refuse otherwise.
                  </span>
                </p>
              )}

              <Button onClick={settle} loading={settling} className="w-full">
                Settle and close
              </Button>
            </div>

            {/* Deposits */}
            <DepositHistory
              loanId={loan.id}
              deposits={detail?.deposits ?? []}
              readOnly={false}
              principal={loan.amount}
            />

            {/* Photos: who pledged, who is collecting */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-500">At pledge</p>
                <LoanPhoto
                  loanId={loan.id}
                  hasPhoto={!!detail?.photos?.pledge}
                  verifiedBy={loan.face_verified_by}
                  readOnly
                  stage="pledge"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-500">At collection</p>
                <LoanPhoto
                  loanId={loan.id}
                  hasPhoto={!!detail?.photos?.collection}
                  verifiedBy={null}
                  readOnly={false}
                  stage="collection"
                />
              </div>
            </div>

            <RemarksLog loanId={loan.id} remarks={loan.remarks} />

            {canDelete && (
              <p className="text-xs text-slate-500">
                Entered by mistake?{' '}
                <Link href={`/loans/${loan.id}`} className="text-primary-700 underline underline-offset-2">
                  Open the full record
                </Link>{' '}
                to delete it. Settling keeps the history; deleting does not.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
