'use client'
/**
 * The Active / Closed records table.
 *
 * CSS grid rather than a `<table>`, following the design: the sticky header and
 * every row share one column template (`.records-grid`), so the header stays
 * aligned while the body scrolls inside the card. A real table with sticky
 * `thead` drifts by a pixel per row in Safari, and these columns are money.
 *
 * The whole row navigates to the record. The two buttons at the end stop
 * propagation, so editing or deleting does not also open the loan.
 *
 * Below `lg` the grid collapses to a two-line summary — the nine columns the
 * design lays out assume a counter monitor.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MetalBadge } from '@/components/ui/Badge'
import { RecordRowActions } from '@/components/loans/RecordRowActions'
import { formatCurrency } from '@/lib/utils'
import { useAppDate } from '@/components/settings/SettingsProvider'

export interface RecordRow {
  id: number
  name: string
  father_name: string | null
  location: string | null
  amount: number
  category_type: string
  detailed_type: string | null
  weight: number | null
  issue_date: string
  closed_date?: string | null
}

/** Gold is weighed in grams, silver in kilos — the shop's own convention. */
function formatWeight(weight: number | null, metal: string): string {
  if (weight == null) return '—'
  return metal === 'Silver'
    ? `${(weight / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 })} kg`
    : `${weight.toLocaleString('en-IN')} g`
}

export function RecordsTable({
  rows,
  variant,
  countLabel,
  pagination,
}: {
  rows: RecordRow[]
  variant: 'active' | 'closed'
  /** e.g. "Showing 1–50 of 128 active records". */
  countLabel: string
  pagination?: React.ReactNode
}) {
  const router = useRouter()
  const formatDate = useAppDate()
  const dateColumn = variant === 'closed' ? 'Closed' : 'Issued'

  return (
    <div className="card-flush">
      <div className="lg:max-h-[calc(100dvh-16rem)] lg:overflow-y-auto">
        <div className="records-grid grid-head hidden lg:grid">
          <span>Amount</span>
          <span>Customer</span>
          <span>Father&rsquo;s name</span>
          <span>Location</span>
          <span>{dateColumn}</span>
          <span>Metal</span>
          <span>Type</span>
          <span className="text-right">Weight</span>
          <span className="text-right">Actions</span>
        </div>

        {rows.map(row => {
          const date = variant === 'closed' ? row.closed_date : row.issue_date
          const shown = date ? formatDate(date) : '—'

          return (
            <div
              key={row.id}
              onClick={() => router.push(`/loans/${row.id}`)}
              className="records-grid cursor-pointer items-center gap-2.5 border-b border-surface-border
                         px-4 py-2.5 text-12.5 transition-colors last:border-0 hover:bg-surface-muted"
            >
              <span className="hidden font-semibold tabular-nums text-ink lg:block">
                {formatCurrency(row.amount)}
              </span>

              <div className="min-w-0">
                <Link
                  href={`/loans/${row.id}`}
                  onClick={event => event.stopPropagation()}
                  className="block truncate font-medium text-ink hover:text-primary"
                >
                  {row.name}
                </Link>
                {/* Phone: everything that did not fit, on one muted line. */}
                <span className="block truncate text-11.5 text-ink-faint lg:hidden">
                  {[formatCurrency(row.amount), row.category_type, row.location, shown]
                    .filter(Boolean).join(' · ')}
                </span>
              </div>

              <span className="hidden truncate text-ink-muted lg:block">{row.father_name || '—'}</span>
              <span className="hidden truncate text-ink-muted lg:block">{row.location || '—'}</span>
              <span className="hidden text-ink-muted lg:block">{shown}</span>
              <MetalBadge metal={row.category_type} className="hidden justify-self-start lg:inline-flex" />
              <span className="hidden truncate text-ink-muted lg:block">{row.detailed_type || '—'}</span>
              <span className="hidden text-right tabular-nums text-ink-muted lg:block">
                {formatWeight(row.weight, row.category_type)}
              </span>

              <div onClick={event => event.stopPropagation()} className="justify-self-end">
                <RecordRowActions loan={row} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid-foot flex-wrap gap-3">
        <span>{countLabel}</span>
        {pagination}
      </div>
    </div>
  )
}

/**
 * The design's numbered pager. Shows at most five page buttons around the
 * current one — a migrated shop can have sixty pages of closed records, and a
 * strip of sixty buttons is not navigation.
 */
export function Pagination({
  page, lastPage, hrefFor,
}: {
  page: number
  lastPage: number
  hrefFor: (page: number) => string
}) {
  if (lastPage <= 1) return null

  const start = Math.max(1, Math.min(page - 2, lastPage - 4))
  const numbers = Array.from({ length: Math.min(5, lastPage) }, (_, index) => start + index)
    .filter(value => value <= lastPage)

  return (
    <nav className="flex flex-wrap items-center gap-1.5" aria-label="Pagination">
      {page <= 1
        ? <span className="btn-mini cursor-default text-ink-faint">← Prev</span>
        : <Link href={hrefFor(page - 1)} className="btn-mini">← Prev</Link>}

      {numbers.map(number => (
        <Link
          key={number}
          href={hrefFor(number)}
          aria-current={number === page ? 'page' : undefined}
          className={number === page ? 'btn-mini-active' : 'btn-mini'}
        >
          {number}
        </Link>
      ))}

      {page >= lastPage
        ? <span className="btn-mini cursor-default text-ink-faint">Next →</span>
        : <Link href={hrefFor(page + 1)} className="btn-mini">Next →</Link>}
    </nav>
  )
}
