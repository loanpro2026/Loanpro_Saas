'use client'

import { useRouter, usePathname } from 'next/navigation'
import { Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTransition, useState } from 'react'
import { AutoSuggest } from '@/components/ui/AutoSuggest'

interface Props {
  currentStatus: string
  currentCategory?: string
  query?: string
  searchField?: string
  issueFrom?: string
  issueTo?: string
  minAmount?: string
  maxAmount?: string
}

export function LoanFilters({
  currentStatus, currentCategory, query, searchField = 'name',
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

    let target = pathname
    if (onRecordRoutes) target = status === 'closed' ? '/view-records/closed' : '/view-records/active'
    else if (status) sp.set('status', status)

    const qs = sp.toString()
    startTransition(() => router.push(qs ? `${target}?${qs}` : target))
  }

  const apply = (e: React.FormEvent) => {
    e.preventDefault()
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
    setField('name'); setFrom(''); setTo(''); setMinimum(''); setMaximum('')
    push({ field: undefined, from: undefined, to: undefined, min: undefined, max: undefined })
  }
  const hasAdvanced = field !== 'name' || !!from || !!to || !!minimum || !!maximum

  return (
    <div className="card space-y-3" aria-busy={isPending || undefined}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <form onSubmit={apply} className="flex min-w-0 flex-1 gap-2">
          <select
            aria-label="Search field"
            value={field}
            onChange={e => setField(e.target.value)}
            className="input h-10 w-28 shrink-0 px-3 text-sm sm:w-36"
          >
            <option value="name">Name</option>
            <option value="id">Loan #</option>
            <option value="father_name">Father</option>
            <option value="location">Location</option>
          </select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
            {isPending && <Loader2 className="absolute right-3 top-1/2 z-20 h-4 w-4 -translate-y-1/2 animate-spin text-primary-600" />}
            {field === 'id' ? (
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Exact loan number…"
                className="input h-10 pl-9 pr-9 text-sm"
                inputMode="numeric"
                aria-label="Search by exact loan number"
              />
            ) : (
              <AutoSuggest
                field={field as 'name' | 'father_name' | 'location'}
                value={search}
                onChange={setSearch}
                ariaLabel={`Search by ${field === 'father_name' ? "father's name" : field}`}
                placeholder={`Search by ${field === 'father_name' ? "father's name" : field}…`}
                inputClassName="h-10 pl-9 pr-9 text-sm"
                showCompletionHint={false}
              />
            )}
          </div>
        </form>

        <div className="flex min-h-10 overflow-hidden rounded-lg border border-surface-border bg-white">
          {[
            { value: 'active', label: 'Active' },
            { value: 'closed', label: 'Closed' },
            ...(onRecordRoutes ? [] : [{ value: 'all', label: 'All' }]),
          ].map(option => (
            <button
              key={option.value}
              disabled={isPending}
              onClick={() => push({ status: option.value, q: search.trim() || undefined })}
              className={cn(
                'px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-60',
                currentStatus === option.value ? 'bg-primary-700 text-white' : 'text-slate-600 hover:bg-slate-50'
              )}
            >{option.label}</button>
          ))}
        </div>

        <div className="flex min-h-10 overflow-hidden rounded-lg border border-surface-border bg-white">
          {[
            { value: '', label: 'All' },
            { value: 'Gold', label: 'Gold' },
            { value: 'Silver', label: 'Silver' },
          ].map(option => (
            <button
              key={option.value}
              disabled={isPending}
              onClick={() => push({ category: option.value || undefined, q: search.trim() || undefined })}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60',
                currentCategory === option.value || (!currentCategory && option.value === '')
                  ? 'bg-primary-700 text-white' : 'text-slate-600 hover:bg-slate-50'
              )}
            >{option.label}</button>
          ))}
        </div>
      </div>

      <details open={hasAdvanced || undefined}>
        <summary className="w-fit cursor-pointer text-xs font-medium text-primary-700">
          {hasAdvanced ? 'Advanced filters applied' : 'More filters'}
        </summary>
        <form onSubmit={apply} className="mt-3 grid items-end gap-3 border-t border-surface-border pt-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs text-slate-600">Issue date from
            <input type="date" className="input mt-1 h-9 px-3" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} />
          </label>
          <label className="text-xs text-slate-600">Issue date to
            <input type="date" className="input mt-1 h-9 px-3" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} />
          </label>
          <label className="text-xs text-slate-600">Minimum amount
            <input type="number" min="0" max={maximum || undefined} className="input mt-1 h-9 px-3" value={minimum} onChange={e => setMinimum(e.target.value)} />
          </label>
          <label className="text-xs text-slate-600">Maximum amount
            <input type="number" min={minimum || '0'} className="input mt-1 h-9 px-3" value={maximum} onChange={e => setMaximum(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="btn-primary h-9 flex-1 px-3 py-1.5">Apply</button>
            {hasAdvanced && <button type="button" disabled={isPending} onClick={clearAdvanced} className="btn-secondary h-9 px-3 py-1.5">Clear</button>}
          </div>
        </form>
      </details>
    </div>
  )
}
