'use client'
/**
 * Search active loans, then open one in the settlement workspace.
 *
 * Nothing is listed until a search is run. That is deliberate and the empty
 * state says so: this screen is the only route to settling a loan, and a table
 * that populates itself invites the one action in the app that cannot be undone
 * from a mis-click.
 *
 * The search bar is the largest field in the product — 44px — because it is the
 * first thing a shopkeeper touches with a customer standing in front of them.
 *
 * Works offline against the cached snapshot. Deposit totals are unavailable
 * there, and the row says so rather than printing a zero that reads as "nothing
 * has been paid".
 */
import { useState } from 'react'
import Link from 'next/link'
import { CloudOff, RefreshCw, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { searchCachedLoans } from '@/lib/offline/db'
import { useOffline } from '@/components/offline/OfflineProvider'
import { AutoSuggest } from '@/components/ui/AutoSuggest'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'

const PAGE_SIZE = 25

type SearchField = 'all' | 'loan' | 'name' | 'father' | 'location'
type Sort = 'oldest' | 'newest' | 'amount-high' | 'amount-low'
type Metal = '' | 'Gold' | 'Silver'
type Band = '' | 'under25k' | '25k-1l' | 'over1l'
type Held = '' | '6m' | '1y'

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
}

const FIELD_LABEL: Record<SearchField, string> = {
  all: 'any field',
  loan: 'Loan number',
  name: 'Customer name',
  father: "Father's name",
  location: 'Location',
}

const PLACEHOLDER: Record<SearchField, string> = {
  all: "Loan no., customer, father's name or location",
  loan: 'e.g. 4471',
  name: 'e.g. Ramesh Kumar',
  father: 'e.g. Suresh Kumar',
  location: 'e.g. Sarafa Bazaar',
}

export function RemoveRecordWorkspace() {
  const { online } = useOffline()
  const [field, setField] = useState<SearchField>('name')
  const [term, setTerm] = useState('')
  const [metal, setMetal] = useState<Metal>('')
  const [band, setBand] = useState<Band>('')
  const [held, setHeld] = useState<Held>('')
  const [sort, setSort] = useState<Sort>('oldest')
  const [rows, setRows] = useState<LoanRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const [queryError, setQueryError] = useState('')

  const trimmed = term.trim()
  const meaningful = trimmed.length >= 2 || (field === 'loan' && /^\d+$/.test(trimmed))

  // Amount bands, in rupees. Named rather than free min/max: a shop thinks in
  // "small pledges" and "the big ones", not in exact boundaries.
  const bandRange: Record<Band, [number | null, number | null]> = {
    '': [null, null],
    under25k: [null, 25_000],
    '25k-1l': [25_000, 100_000],
    over1l: [100_000, null],
  }

  const heldCutoff = (): string | null => {
    if (!held) return null
    const date = new Date()
    date.setMonth(date.getMonth() - (held === '6m' ? 6 : 12))
    return date.toISOString().slice(0, 10)
  }

  const clear = () => {
    setTerm(''); setMetal(''); setBand(''); setHeld(''); setSort('oldest')
    setRows([]); setTotal(0); setPage(0)
    setHasSearched(false); setFromCache(false); setQueryError('')
  }

  const runSearch = async (nextPage = 0) => {
    if (!meaningful) return
    setLoading(true)
    setQueryError('')
    setHasSearched(true)

    const [minAmount, maxAmount] = bandRange[band]
    const cutoff = heldCutoff()

    try {
      if (!online) {
        const cached = await searchCachedLoans(trimmed, 250)
        const query = trimmed.toLocaleLowerCase('en-IN')
        const filtered = cached
          .filter(loan => loan.status === 'active')
          .filter(loan => {
            if (field === 'loan') return loan.id === Number(trimmed)
            if (field === 'name') return loan.name?.toLocaleLowerCase('en-IN').includes(query)
            if (field === 'father') return loan.father_name?.toLocaleLowerCase('en-IN').includes(query)
            if (field === 'location') return loan.location?.toLocaleLowerCase('en-IN').includes(query)
            return true
          })
          .filter(loan => !metal || loan.category_type === metal)
          .filter(loan => minAmount === null || Number(loan.amount) >= minAmount)
          .filter(loan => maxAmount === null || Number(loan.amount) <= maxAmount)
          .filter(loan => !cutoff || loan.issue_date <= cutoff)

        setRows(filtered.slice(nextPage * PAGE_SIZE, (nextPage + 1) * PAGE_SIZE) as LoanRow[])
        setTotal(filtered.length)
        setPage(nextPage)
        setFromCache(true)
        return
      }

      const safe = trimmed.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim()
      const supabase = createClient()
      let query = supabase
        .from('loans')
        .select(
          'id, name, father_name, location, amount, category_type, detailed_type, weight, issue_date',
          { count: 'exact' }
        )
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

      if (metal) query = query.eq('category_type', metal)
      if (minAmount !== null) query = query.gte('amount', minAmount)
      if (maxAmount !== null) query = query.lte('amount', maxAmount)
      if (cutoff) query = query.lte('issue_date', cutoff)

      if (sort === 'oldest') query = query.order('issue_date', { ascending: true }).order('id', { ascending: true })
      if (sort === 'newest') query = query.order('issue_date', { ascending: false }).order('id', { ascending: false })
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

  const suggestField = field === 'father' ? 'father_name' : field === 'location' ? 'location' : 'name'
  const useSuggest = field === 'name' || field === 'father' || field === 'location'
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-3.5">
      <form
        className="card p-4 sm:p-[18px]"
        onSubmit={event => { event.preventDefault(); void runSearch(0) }}
      >
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
          <div className="lg:w-[190px] lg:shrink-0">
            <label htmlFor="remove-field" className="mb-1.5 block text-12 font-semibold text-ink-muted">
              Search by
            </label>
            <select
              id="remove-field"
              value={field}
              onChange={event => { setField(event.target.value as SearchField); setTerm('') }}
              className="h-11 w-full rounded-[9px] border border-surface-border bg-surface-muted px-3
                         text-13.5 font-semibold text-ink focus:border-primary"
            >
              <option value="name">Customer name</option>
              <option value="father">Father&rsquo;s name</option>
              <option value="location">Location</option>
              <option value="loan">Loan number</option>
              <option value="all">All fields</option>
            </select>
          </div>

          <div className="min-w-0 flex-1">
            <label htmlFor="remove-term" className="mb-1.5 block text-12 font-semibold text-ink-muted">
              {FIELD_LABEL[field]}
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-[17px] w-[17px] -translate-y-1/2 text-ink-faint"
                strokeWidth={1.8}
              />
              {useSuggest ? (
                <AutoSuggest
                  field={suggestField}
                  value={term}
                  onChange={setTerm}
                  placeholder={PLACEHOLDER[field]}
                  ariaLabel="Search active loans"
                  inputClassName="h-11 rounded-[9px] pl-10 text-14.5"
                />
              ) : (
                <input
                  id="remove-term"
                  value={term}
                  onChange={event => setTerm(event.target.value)}
                  placeholder={PLACEHOLDER[field]}
                  autoFocus
                  aria-label="Search active loans"
                  className="input-xl pl-10"
                />
              )}
            </div>
          </div>

          <Button
            type="submit"
            disabled={!meaningful}
            loading={loading}
            className="h-11 shrink-0 rounded-[9px] px-6 text-14"
          >
            <Search className="h-[15px] w-[15px]" strokeWidth={2.2} /> Search
          </Button>
          <button
            type="button"
            onClick={clear}
            className="h-11 shrink-0 rounded-[9px] border border-surface-border bg-surface-card px-4
                       text-13.5 font-semibold text-ink-muted transition-colors hover:text-ink"
          >
            Clear
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-11.5 font-semibold text-ink-faint">Narrow down</span>
          <select aria-label="Metal" value={metal} onChange={e => setMetal(e.target.value as Metal)} className="select-mini">
            <option value="">Any metal</option>
            <option value="Gold">Gold</option>
            <option value="Silver">Silver</option>
          </select>
          <select aria-label="Amount" value={band} onChange={e => setBand(e.target.value as Band)} className="select-mini">
            <option value="">Any amount</option>
            <option value="under25k">Under ₹25,000</option>
            <option value="25k-1l">₹25,000–₹1,00,000</option>
            <option value="over1l">Above ₹1,00,000</option>
          </select>
          <select aria-label="Duration held" value={held} onChange={e => setHeld(e.target.value as Held)} className="select-mini">
            <option value="">Any duration</option>
            <option value="6m">Held over 6 months</option>
            <option value="1y">Held over 1 year</option>
          </select>
          <select aria-label="Sort order" value={sort} onChange={e => setSort(e.target.value as Sort)} className="select-mini">
            <option value="oldest">Longest held first</option>
            <option value="newest">Newest first</option>
            <option value="amount-high">Amount high–low</option>
            <option value="amount-low">Amount low–high</option>
          </select>
        </div>
      </form>

      {fromCache && (
        <p className="note-amber flex items-start gap-2">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
          Saved active-loan results from this device are shown. Settlement will reconnect when
          the internet returns.
        </p>
      )}

      <section aria-live="polite">
        {!hasSearched ? (
          <div className="empty-state">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-muted text-ink-faint">
              <Search className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <h2 className="text-14.5 font-bold text-ink">Search for an active record</h2>
            <p className="max-w-[420px] text-12.5 leading-relaxed text-ink-muted">
              Active loans are not listed automatically. Pick a field above and search by customer
              name, father&rsquo;s name, location, loan number or amount — then open the record to add a
              deposit or settle it.
            </p>
          </div>
        ) : loading ? (
          <div className="card space-y-1 p-3" role="status" aria-label="Searching active loans">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="grid grid-cols-[6rem_1fr_7rem] gap-3 border-b border-surface-border px-2 py-3 last:border-0">
                <div className="skeleton h-4" /><div className="skeleton h-4" /><div className="skeleton h-4" />
              </div>
            ))}
          </div>
        ) : queryError ? (
          <div className="empty-state">
            <h2 className="text-14.5 font-bold text-ink">Active-loan search could not be completed</h2>
            <p className="max-w-[460px] text-12.5 leading-relaxed text-ink-muted">
              {queryError} Your filters are preserved and no loan was changed.
            </p>
            <Button type="button" variant="secondary" onClick={() => void runSearch(page)}>
              <RefreshCw className="h-4 w-4" /> Retry search
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <h2 className="text-14.5 font-bold text-ink">No active records match</h2>
            <p className="max-w-[420px] text-12.5 leading-relaxed text-ink-muted">
              Keep the current filters and try another search term, or clear them to broaden the search.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-12.5 text-ink-muted">
                <b>{total}</b> active record{total === 1 ? '' : 's'} match {FIELD_LABEL[field]}
                {' '}&ldquo;<b>{trimmed}</b>&rdquo;
              </p>
              <p className="text-12 text-ink-faint">Open a record to add a deposit or settle it</p>
            </div>

            <div className="card-flush">
              <div className="hidden grid-cols-[130px_1.4fr_1.3fr_1fr_40px] gap-3 border-b
                              border-surface-border bg-surface-muted px-4 py-2.5 text-11 font-bold uppercase
                              tracking-[0.04em] text-ink-faint lg:grid">
                <span>Amount</span>
                <span>Customer</span>
                <span>Father&rsquo;s name</span>
                <span>Jewellery type</span>
                <span />
              </div>

              {rows.map(row => (
                  <Link
                    key={row.id}
                    href={`/remove-record/${row.id}`}
                    className="grid grid-cols-1 items-center gap-3 border-b border-surface-border px-4 py-3
                               text-12.5 transition-colors last:border-0 hover:bg-surface-muted
                               lg:grid-cols-[130px_1.4fr_1.3fr_1fr_40px]"
                  >
                    <span className="text-13.5 font-bold tabular-nums text-ink">{formatCurrency(row.amount)}</span>

                    <div className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{row.name}</span>
                      <span className="block truncate text-11.5 text-ink-faint lg:hidden">
                        {row.father_name ? `S/o ${row.father_name}` : 'Father’s name not recorded'}
                      </span>
                    </div>

                    <span className="hidden truncate text-ink-muted lg:block">{row.father_name || '—'}</span>
                    <span className="hidden truncate text-ink-muted lg:block">
                      {row.detailed_type || '—'}
                    </span>
                    <span className="hidden text-right text-15 text-ink-faint lg:block">→</span>

                    <span className="text-11.5 text-ink-faint lg:hidden">
                      {row.detailed_type || 'Jewellery type not recorded'}
                    </span>
                  </Link>
              ))}

              {pageCount > 1 && (
                <div className="grid-foot">
                  <span>Page {page + 1} of {pageCount}</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={page === 0 || loading}
                      onClick={() => void runSearch(page - 1)}
                      className="btn-mini disabled:opacity-40"
                    >
                      ← Prev
                    </button>
                    <button
                      type="button"
                      disabled={page + 1 >= pageCount || loading}
                      onClick={() => void runSearch(page + 1)}
                      className="btn-mini disabled:opacity-40"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
