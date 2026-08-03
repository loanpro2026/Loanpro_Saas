'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, CloudOff, FileSearch, Filter, RefreshCw, Search,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { searchCachedLoans } from '@/lib/offline/db'
import { useOffline } from '@/components/offline/OfflineProvider'
import { AutoSuggest } from '@/components/ui/AutoSuggest'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { formatCurrency, formatDate, getLoanAge } from '@/lib/utils'

const PAGE_SIZE = 25

type SearchField = 'all' | 'loan' | 'name' | 'father' | 'location'
type Sort = 'newest' | 'oldest' | 'amount-high' | 'amount-low'
type Metal = '' | 'Gold' | 'Silver'

interface LoanRow {
  id: number
  name: string
  father_name: string | null
  location: string | null
  amount: number
  category_type: string
  detailed_type: string | null
  weight: number | null
  issue_date: string
  totalDeposits: number | null
}

export function RemoveRecordWorkspace() {
  const { online } = useOffline()
  const [field, setField] = useState<SearchField>('all')
  const [term, setTerm] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [metal, setMetal] = useState<Metal>('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [sort, setSort] = useState<Sort>('newest')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [rows, setRows] = useState<LoanRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const [queryError, setQueryError] = useState('')

  const trimmed = term.trim()
  const meaningful = trimmed.length >= 2 || (field === 'loan' && /^\d+$/.test(trimmed))

  const clear = () => {
    setTerm('')
    setIssueDate('')
    setMetal('')
    setMinAmount('')
    setMaxAmount('')
    setSort('newest')
    setRows([])
    setTotal(0)
    setPage(0)
    setHasSearched(false)
    setFromCache(false)
    setQueryError('')
  }

  const runSearch = async (nextPage = 0) => {
    if (!meaningful) return
    setLoading(true)
    setQueryError('')
    setHasSearched(true)

    try {
      if (!online) {
        const cached = await searchCachedLoans(trimmed, 250)
        const filtered = cached
          .filter(loan => loan.status === 'active')
          .filter(loan => {
            const query = trimmed.toLocaleLowerCase('en-IN')
            if (field === 'loan') return loan.id === Number(trimmed)
            if (field === 'name') return loan.name?.toLocaleLowerCase('en-IN').includes(query)
            if (field === 'father') return loan.father_name?.toLocaleLowerCase('en-IN').includes(query)
            if (field === 'location') return loan.location?.toLocaleLowerCase('en-IN').includes(query)
            return true
          })
          .filter(loan => !metal || loan.category_type === metal)
          .filter(loan => !issueDate || loan.issue_date === issueDate)
          .filter(loan => !minAmount || Number(loan.amount) >= Number(minAmount))
          .filter(loan => !maxAmount || Number(loan.amount) <= Number(maxAmount))

        setRows(filtered.slice(nextPage * PAGE_SIZE, (nextPage + 1) * PAGE_SIZE).map(loan => ({
          ...loan,
          totalDeposits: null,
        })) as LoanRow[])
        setTotal(filtered.length)
        setPage(nextPage)
        setFromCache(true)
        return
      }

      const safe = trimmed.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim()
      const supabase = createClient()
      let query = supabase
        .from('loans')
        .select('id, name, father_name, location, amount, category_type, detailed_type, weight, issue_date, deposits(amount)', { count: 'exact' })
        .eq('status', 'active')

      if (field === 'loan') {
        if (!/^\d+$/.test(safe)) {
          setRows([]); setTotal(0); setPage(0); setFromCache(false); return
        }
        query = query.eq('id', Number(safe))
      } else if (field === 'name') query = query.ilike('name', `%${safe}%`)
      else if (field === 'father') query = query.ilike('father_name', `%${safe}%`)
      else if (field === 'location') query = query.ilike('location', `%${safe}%`)
      else if (/^\d+$/.test(safe)) {
        query = query.or(`id.eq.${Number(safe)},name.ilike.%${safe}%,father_name.ilike.%${safe}%,location.ilike.%${safe}%`)
      } else {
        query = query.or(`name.ilike.%${safe}%,father_name.ilike.%${safe}%,location.ilike.%${safe}%`)
      }

      if (issueDate) query = query.eq('issue_date', issueDate)
      if (metal) query = query.eq('category_type', metal)
      if (minAmount) query = query.gte('amount', Number(minAmount))
      if (maxAmount) query = query.lte('amount', Number(maxAmount))

      if (sort === 'newest') query = query.order('issue_date', { ascending: false }).order('id', { ascending: false })
      if (sort === 'oldest') query = query.order('issue_date', { ascending: true }).order('id', { ascending: true })
      if (sort === 'amount-high') query = query.order('amount', { ascending: false }).order('id', { ascending: false })
      if (sort === 'amount-low') query = query.order('amount', { ascending: true }).order('id', { ascending: true })

      const { data, count, error } = await query.range(nextPage * PAGE_SIZE, (nextPage + 1) * PAGE_SIZE - 1)
      if (error) throw new Error(error.message)

      setRows((data ?? []).map(item => ({
        id: item.id,
        name: item.name,
        father_name: item.father_name,
        location: item.location,
        amount: Number(item.amount),
        category_type: item.category_type,
        detailed_type: item.detailed_type,
        weight: item.weight == null ? null : Number(item.weight),
        issue_date: item.issue_date,
        totalDeposits: item.deposits.reduce((sum, deposit) => sum + Number(deposit.amount ?? 0), 0),
      })))
      setTotal(count ?? 0)
      setPage(nextPage)
      setFromCache(false)
    } catch (error) {
      setRows([])
      setTotal(0)
      setQueryError(error instanceof Error ? error.message : 'The active-loan query could not be completed.')
    } finally {
      setLoading(false)
    }
  }

  const filterFields = (mobile = false) => (
    <div className={`${mobile ? 'grid lg:hidden' : 'hidden lg:grid'} gap-3 sm:grid-cols-2 lg:grid-cols-5`}>
      <Input label="Issue date" type="date" value={issueDate} onChange={event => setIssueDate(event.target.value)} />
      <Select label="Metal" value={metal} onChange={event => setMetal(event.target.value as Metal)} options={[
        { value: '', label: 'Any metal' }, { value: 'Gold', label: 'Gold' }, { value: 'Silver', label: 'Silver' },
      ]} />
      <Input label="Minimum amount" type="number" min={0} inputMode="numeric" value={minAmount} onChange={event => setMinAmount(event.target.value)} placeholder="Any" />
      <Input label="Maximum amount" type="number" min={0} inputMode="numeric" value={maxAmount} onChange={event => setMaxAmount(event.target.value)} placeholder="Any" />
      <Select label="Sort" value={sort} onChange={event => setSort(event.target.value as Sort)} options={[
        { value: 'newest', label: 'Newest first' },
        { value: 'oldest', label: 'Oldest first' },
        { value: 'amount-high', label: 'Highest amount' },
        { value: 'amount-low', label: 'Lowest amount' },
      ]} />
    </div>
  )

  const fieldForSuggest = field === 'name' ? 'name' : field === 'father' ? 'father_name' : 'location'
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-3.5" style={{ fontFamily: "'IBM Plex Sans', Inter, system-ui, sans-serif" }}>
      <form
        className="card space-y-3"
        onSubmit={event => { event.preventDefault(); void runSearch(0) }}
      >
        <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_auto_auto] lg:items-end">
          <Select label="Search by" value={field} onChange={event => { setField(event.target.value as SearchField); setTerm('') }} options={[
            { value: 'all', label: 'All fields' },
            { value: 'loan', label: 'Loan number' },
            { value: 'name', label: 'Customer name' },
            { value: 'father', label: "Father's name" },
            { value: 'location', label: 'Location' },
          ]} />

          {field === 'name' || field === 'father' || field === 'location' ? (
            <AutoSuggest
              field={fieldForSuggest}
              label="Search"
              value={term}
              onChange={setTerm}
              placeholder={`Enter ${field === 'father' ? "father's name" : field}`}
              ariaLabel="Search active loans"
            />
          ) : (
            <Input
              label="Search"
              value={term}
              onChange={event => setTerm(event.target.value)}
              placeholder={field === 'loan' ? 'Enter loan number' : "Loan no., customer, father's name or location"}
              autoFocus
            />
          )}

          <Button type="submit" disabled={!meaningful} loading={loading} className="min-h-10">
            <Search className="h-4 w-4" /> Search
          </Button>
          <Button type="button" variant="secondary" onClick={clear} className="min-h-10">Clear</Button>
        </div>

        <button type="button" onClick={() => setFiltersOpen(open => !open)} className="inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-slate-600 lg:hidden">
          <Filter className="h-4 w-4" /> {filtersOpen ? 'Hide filters' : 'Advanced filters'}
        </button>
        {filtersOpen && filterFields(true)}
        {filterFields(false)}
      </form>

      {fromCache && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
          Saved active-loan results from this device are shown. Deposit totals may be unavailable until the connection returns.
        </div>
      )}

      <section className="card min-h-[360px] overflow-hidden p-0" aria-live="polite">
        {!hasSearched ? (
          <PurposefulEmpty />
        ) : loading ? (
          <div className="space-y-1 p-3" role="status" aria-label="Searching active loans">
            {Array.from({ length: 7 }, (_, index) => (
              <div key={index} className="grid grid-cols-[4rem_1fr_7rem] gap-3 border-b border-surface-border px-2 py-3">
                <div className="skeleton h-4" /><div className="skeleton h-4" /><div className="skeleton h-4" />
              </div>
            ))}
          </div>
        ) : queryError ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center px-5 text-center">
            <FileSearch className="h-8 w-8 text-red-300" />
            <h2 className="mt-3 text-sm font-bold text-slate-900">Active-loan search could not be completed</h2>
            <p className="mt-1 max-w-lg text-xs text-slate-500">{queryError} Your filters are preserved and no loan was changed.</p>
            <Button type="button" variant="secondary" onClick={() => void runSearch(page)} className="mt-4">
              <RefreshCw className="h-4 w-4" /> Retry search
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center px-5 text-center">
            <FileSearch className="h-8 w-8 text-slate-300" />
            <h2 className="mt-3 text-sm font-bold text-slate-900">No active records match</h2>
            <p className="mt-1 max-w-lg text-xs text-slate-500">Keep the current filters and try another search term, or clear the filters to broaden the query.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border px-4 py-3">
              <p className="text-xs font-medium text-slate-600">{total} active result{total === 1 ? '' : 's'}</p>
              <p className="text-[11px] text-slate-400">Select a result to open its full record and settlement workspace</p>
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-surface-muted text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Loan</th><th className="px-4 py-2.5">Customer</th><th className="px-4 py-2.5">Location</th>
                    <th className="px-4 py-2.5">Issued</th><th className="px-4 py-2.5">Collateral</th><th className="px-4 py-2.5 text-right">Principal</th>
                    <th className="px-4 py-2.5 text-right">Deposits</th><th className="px-4 py-2.5 text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {rows.map(row => <ResultRow key={row.id} row={row} />)}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-surface-border lg:hidden">
              {rows.map(row => <MobileResult key={row.id} row={row} />)}
            </ul>

            {pageCount > 1 && (
              <div className="flex items-center justify-between border-t border-surface-border px-4 py-3">
                <Button type="button" variant="secondary" size="sm" disabled={page === 0 || loading} onClick={() => void runSearch(page - 1)}>
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <span className="text-xs text-slate-500">Page {page + 1} of {pageCount}</span>
                <Button type="button" variant="secondary" size="sm" disabled={page + 1 >= pageCount || loading} onClick={() => void runSearch(page + 1)}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function PurposefulEmpty() {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center px-5 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Search className="h-5 w-5" /></div>
      <h2 className="mt-3 text-sm font-bold text-slate-900">Search for an active record</h2>
      <p className="mt-1 max-w-lg text-xs text-slate-500">Search by loan number, customer, father&rsquo;s name or location. Results stay empty until you deliberately search.</p>
    </div>
  )
}

function ResultRow({ row }: { row: LoanRow }) {
  const deposits = row.totalDeposits
  const outstanding = deposits == null ? null : Math.max(0, row.amount - deposits)
  return (
    <tr className="transition-colors hover:bg-slate-50">
      <td colSpan={8} className="p-0">
        <Link href={`/loans/${row.id}?from=remove-record`} className="grid grid-cols-[5rem_minmax(11rem,1.3fr)_minmax(8rem,1fr)_8rem_9rem_8rem_8rem_8rem] items-center">
          <span className="px-4 py-3 font-semibold tabular-nums">#{row.id}</span>
          <span className="min-w-0 px-4 py-3"><span className="block truncate font-semibold text-slate-900">{row.name}</span><span className="block truncate text-[11px] text-slate-400">{row.father_name ? `S/o ${row.father_name}` : 'Father’s name not recorded'}</span></span>
          <span className="truncate px-4 py-3 text-slate-600">{row.location || '—'}</span>
          <span className="px-4 py-3 text-slate-600">{formatDate(row.issue_date)}<span className="block text-[10px] text-slate-400">{getLoanAge(row.issue_date)}</span></span>
          <span className="px-4 py-3"><Badge variant={row.category_type === 'Gold' ? 'gold' : 'silver'}>{row.category_type}</Badge><span className="ml-1 text-[11px] text-slate-500">{weightLabel(row)}</span></span>
          <span className="px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(row.amount)}</span>
          <span className="px-4 py-3 text-right tabular-nums">{deposits == null ? 'Offline' : formatCurrency(deposits)}</span>
          <span className="px-4 py-3 text-right font-semibold tabular-nums">{outstanding == null ? '—' : formatCurrency(outstanding)}</span>
        </Link>
      </td>
    </tr>
  )
}

function MobileResult({ row }: { row: LoanRow }) {
  const outstanding = row.totalDeposits == null ? null : Math.max(0, row.amount - row.totalDeposits)
  return (
    <li>
      <Link href={`/loans/${row.id}?from=remove-record`} className="block min-h-24 px-4 py-3 transition-colors hover:bg-slate-50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><p className="text-xs font-semibold text-primary-700">#{row.id}</p><p className="truncate text-sm font-bold text-slate-900">{row.name}</p><p className="truncate text-xs text-slate-500">{row.father_name ? `S/o ${row.father_name}` : row.location || 'Location not recorded'}</p></div>
          <p className="text-sm font-bold tabular-nums text-slate-900">{formatCurrency(row.amount)}</p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <Badge variant={row.category_type === 'Gold' ? 'gold' : 'silver'}>{row.category_type}</Badge>
          <span>{weightLabel(row)}</span><span>{formatDate(row.issue_date)}</span>
          <span className="ml-auto font-semibold text-slate-700">Outstanding {outstanding == null ? 'unavailable offline' : formatCurrency(outstanding)}</span>
        </div>
      </Link>
    </li>
  )
}

function weightLabel(row: LoanRow): string {
  if (row.weight == null) return row.detailed_type || '—'
  const value = row.category_type === 'Silver' ? row.weight / 1000 : row.weight
  const unit = row.category_type === 'Silver' ? 'kg' : 'g'
  return `${value.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit}`
}
