'use client'
/**
 * The records toolbar — the row of controls beside the page title.
 *
 * The design puts search, metal and sort inline in the header rather than in a
 * filter card below it: on the records screens the table is the page, and a
 * card of filters above it pushes the first row of money below the fold.
 *
 * Date and amount ranges do not appear in the design and stay behind "More
 * filters". They are genuinely used — a shop reconciling a month needs them —
 * but they are a monthly need, not a daily one, and they open automatically
 * when they are already applied so an active filter is never invisible.
 */
import { useRouter, usePathname } from 'next/navigation'
import { Loader2, Search } from 'lucide-react'
import { useTransition, useState } from 'react'
import { AutoSuggest } from '@/components/ui/AutoSuggest'

interface Props {
  currentStatus: string
  currentCategory?: string
  query?: string
  searchField?: string
  sort?: string
  issueFrom?: string
  issueTo?: string
  minAmount?: string
  maxAmount?: string
}

const FIELD_LABEL: Record<string, string> = {
  name: 'customer name',
  father_name: "father's name",
  location: 'location',
  id: 'loan number',
}

export function LoanFilters({
  currentStatus, currentCategory, query, searchField = 'name', sort = 'newest',
  issueFrom, issueTo, minAmount, maxAmount,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState(query ?? '')
  const [field, setField] = useState(searchField)
  const [from, setFrom] = useState(issueFrom ?? '')
  const [to, setTo] = useState(issueTo ?? '')
  const [minimum, setMinimum] = useState(minAmount ?? '')
  const [maximum, setMaximum] = useState(maxAmount ?? '')
  const onRecordRoutes = pathname.startsWith('/view-records')

  const push = (overrides: Record<string, string | undefined>) => {
    const status = overrides.status ?? currentStatus
    const sp = new URLSearchParams()
    const current: Record<string, string> = {
      ...(currentCategory ? { category: currentCategory } : {}),
      ...(search ? { q: search } : {}),
      ...(field !== 'name' ? { field } : {}),
      ...(sort !== 'newest' ? { sort } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(minimum ? { min: minimum } : {}),
      ...(maximum ? { max: maximum } : {}),
    }
    for (const [key, value] of Object.entries(current)) sp.set(key, value)
    for (const [key, value] of Object.entries(overrides)) {
      if (key === 'status') continue
      if (value) sp.set(key, value)
      else sp.delete(key)
    }
    // Any change to the filters invalidates the page you were on.
    sp.delete('page')

    let target = pathname
    if (onRecordRoutes) target = status === 'closed' ? '/view-records/closed' : '/view-records/active'
    else if (status) sp.set('status', status)

    const qs = sp.toString()
    startTransition(() => router.push(qs ? `${target}?${qs}` : target))
  }

  const apply = (event: React.FormEvent) => {
    event.preventDefault()
    push({
      q: search.trim() || undefined,
      field: field === 'name' ? undefined : field,
      from: from || undefined,
      to: to || undefined,
      min: minimum || undefined,
      max: maximum || undefined,
    })
  }

  const clearAdvanced = () => {
    setFrom(''); setTo(''); setMinimum(''); setMaximum('')
    push({ from: undefined, to: undefined, min: undefined, max: undefined })
  }
  const hasAdvanced = !!from || !!to || !!minimum || !!maximum

  return (
    <div className="flex flex-col items-end gap-2" aria-busy={isPending || undefined}>
      <form onSubmit={apply} className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
        <select
          aria-label="Search field"
          value={field}
          onChange={event => setField(event.target.value)}
          className="select h-9 shrink-0"
        >
          <option value="name">Customer name</option>
          <option value="father_name">Father&rsquo;s name</option>
          <option value="location">Location</option>
          <option value="id">Loan number</option>
        </select>

        <div className="relative min-w-0 flex-1 lg:w-[210px] lg:flex-none">
          {isPending && (
            <Loader2 className="absolute right-3 top-1/2 z-20 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />
          )}
          {field === 'id' ? (
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Type to search…"
              inputMode="numeric"
              aria-label="Search by exact loan number"
              className="select h-9 w-full pr-9"
            />
          ) : (
            <AutoSuggest
              field={field as 'name' | 'father_name' | 'location'}
              value={search}
              onChange={setSearch}
              ariaLabel={`Search by ${FIELD_LABEL[field] ?? field}`}
              placeholder="Type to search…"
              inputClassName="h-9 bg-surface-card pr-9 text-13"
              showCompletionHint={false}
            />
          )}
        </div>

        <button type="submit" title="Search" aria-label="Search" className="btn-primary h-9 w-[38px] px-0">
          <Search className="h-[15px] w-[15px]" strokeWidth={2.2} />
        </button>

        <select
          aria-label="Metal"
          value={currentCategory ?? ''}
          onChange={event => push({ category: event.target.value || undefined, q: search.trim() || undefined })}
          className="select h-9 shrink-0"
        >
          <option value="">All metals</option>
          <option value="Gold">Gold</option>
          <option value="Silver">Silver</option>
        </select>

        <select
          aria-label="Sort order"
          value={sort}
          onChange={event => push({ sort: event.target.value === 'newest' ? undefined : event.target.value })}
          className="select h-9 shrink-0"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="amount">Amount high–low</option>
        </select>
      </form>

      <details open={hasAdvanced || undefined} className="w-full lg:w-auto">
        <summary className="w-fit cursor-pointer text-12 font-semibold text-primary lg:ml-auto">
          {hasAdvanced ? 'Advanced filters applied' : 'More filters'}
        </summary>
        <form
          onSubmit={apply}
          className="card mt-2 grid items-end gap-3 p-3.5 sm:grid-cols-2 lg:grid-cols-5"
        >
          <label className="text-12 text-ink-muted">Issue date from
            <input type="date" className="input mt-1 h-9" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} />
          </label>
          <label className="text-12 text-ink-muted">Issue date to
            <input type="date" className="input mt-1 h-9" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} />
          </label>
          <label className="text-12 text-ink-muted">Minimum amount
            <input type="number" min="0" max={maximum || undefined} className="input mt-1 h-9" value={minimum} onChange={e => setMinimum(e.target.value)} />
          </label>
          <label className="text-12 text-ink-muted">Maximum amount
            <input type="number" min={minimum || '0'} className="input mt-1 h-9" value={maximum} onChange={e => setMaximum(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="btn-primary h-9 flex-1">Apply</button>
            {hasAdvanced && (
              <button type="button" disabled={isPending} onClick={clearAdvanced} className="btn-secondary h-9">
                Clear
              </button>
            )}
          </div>
        </form>
      </details>
    </div>
  )
}
