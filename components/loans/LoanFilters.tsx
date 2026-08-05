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
 *
 * ── On the crowding ────────────────────────────────────────────────────────
 * This previously rendered six separate bordered controls in a row: a field
 * select, a search box, a submit button, a metal select, a sort select and a
 * disclosure. Six objects, each with its own outline, competing with the page
 * title on the same line.
 *
 * Only one idea is being expressed by the first three of those — "find this" —
 * so they are now one control with two internal dividers rather than three
 * boxes with six edges. That is the single biggest reduction available here:
 * it takes the toolbar from six visual objects to three without removing a
 * single capability.
 *
 * The submit button stays, as an icon inside the group. Enter already submits,
 * but a visible affordance matters for a counter machine used by staff who did
 * not choose this software.
 */
import { useRouter, usePathname } from 'next/navigation'
import { Loader2, Search, SlidersHorizontal } from 'lucide-react'
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
    <div className="flex w-full flex-col gap-2.5 lg:items-end" aria-busy={isPending || undefined}>
      <div className="flex w-full flex-wrap items-center gap-2.5 lg:w-auto lg:flex-nowrap lg:justify-end">
        {/* One control, three parts. The group owns the border and the focus
            ring; the parts inside are borderless and separated by hairlines. */}
        {/* No `overflow-hidden` on this group, deliberately. It is the obvious
            way to clip the children to the group's radius, and it would also
            clip the AutoSuggest dropdown that opens out of the middle child —
            so the suggestions would be invisible. The inner corners are
            rounded by hand instead: 7px inside an 8px border. */}
        <form
          onSubmit={apply}
          className="flex h-10 min-w-0 flex-1 items-stretch rounded-lg border
                     border-surface-border bg-surface-card transition-colors
                     focus-within:border-primary lg:w-[360px] lg:flex-none"
        >
          <select
            aria-label="Search field"
            value={field}
            onChange={event => setField(event.target.value)}
            className="h-full shrink-0 rounded-l-md border-0 border-r border-surface-border
                       bg-surface-muted px-2.5 text-12 font-medium text-ink-muted focus:ring-0"
          >
            <option value="name">Name</option>
            <option value="father_name">Father&rsquo;s</option>
            <option value="location">Location</option>
            <option value="id">Loan no.</option>
          </select>

          <div className="relative min-w-0 flex-1">
            {isPending && (
              <Loader2 className="absolute right-2.5 top-1/2 z-20 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />
            )}
            {field === 'id' ? (
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search…"
                inputMode="numeric"
                aria-label="Search by exact loan number"
                className="h-full w-full border-0 bg-transparent px-3 text-13 text-ink
                           placeholder:text-ink-faint focus:ring-0"
              />
            ) : (
              <AutoSuggest
                field={field as 'name' | 'father_name' | 'location'}
                value={search}
                onChange={setSearch}
                ariaLabel={`Search by ${FIELD_LABEL[field] ?? field}`}
                placeholder={`Search by ${FIELD_LABEL[field] ?? field}…`}
                inputClassName="h-10 rounded-none border-0 bg-transparent px-3 text-13 focus:ring-0"
                showCompletionHint={false}
              />
            )}
          </div>

          <button
            type="submit"
            title="Search"
            aria-label="Search"
            className="flex h-full w-10 shrink-0 items-center justify-center rounded-r-md border-0
                       border-l border-surface-border text-ink-muted transition-colors
                       hover:bg-surface-muted hover:text-primary"
          >
            <Search className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </form>

        <select
          aria-label="Metal"
          value={currentCategory ?? ''}
          onChange={event => push({ category: event.target.value || undefined, q: search.trim() || undefined })}
          className="select h-10 shrink-0"
        >
          <option value="">All metals</option>
          <option value="Gold">Gold</option>
          <option value="Silver">Silver</option>
        </select>

        <select
          aria-label="Sort order"
          value={sort}
          onChange={event => push({ sort: event.target.value === 'newest' ? undefined : event.target.value })}
          className="select h-10 shrink-0"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="amount">Amount high–low</option>
        </select>
      </div>

      <details open={hasAdvanced || undefined} className="w-full lg:w-auto">
        <summary
          className="inline-flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md
                     px-1.5 py-0.5 text-12 font-semibold text-primary hover:bg-primary-tint"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          {hasAdvanced ? 'Filters applied' : 'Date and amount'}
        </summary>
        <form
          onSubmit={apply}
          className="card mt-2.5 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          <label className="label mb-0">Issue date from
            <input type="date" className="input mt-1.5" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} />
          </label>
          <label className="label mb-0">Issue date to
            <input type="date" className="input mt-1.5" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} />
          </label>
          <label className="label mb-0">Minimum amount
            <input type="number" min="0" max={maximum || undefined} className="input mt-1.5" value={minimum} onChange={e => setMinimum(e.target.value)} />
          </label>
          <label className="label mb-0">Maximum amount
            <input type="number" min={minimum || '0'} className="input mt-1.5" value={maximum} onChange={e => setMaximum(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="btn-primary h-[38px] flex-1">Apply</button>
            {hasAdvanced && (
              <button type="button" disabled={isPending} onClick={clearAdvanced} className="btn-secondary h-[38px]">
                Clear
              </button>
            )}
          </div>
        </form>
      </details>
    </div>
  )
}
