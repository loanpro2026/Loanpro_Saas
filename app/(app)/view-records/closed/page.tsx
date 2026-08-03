/**
 * View Records → Closed — /view-records/closed
 *
 * Its own table, not the active one with a filter applied. A settled loan is a
 * different record: "Age" and "Status" mean nothing once it is closed, and the
 * three figures that matter — what was lent, what interest was charged, what
 * came back — are absent from the active view entirely.
 *
 * Columns follow the desktop's closed-records screen (RecordsPage with
 * recordType="closed"), which reads closed_date and interest alongside the
 * loan's own fields.
 */
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Archive } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { LoanFilters } from '@/components/loans/LoanFilters'
import { formatCurrency, formatDate, formatDuration } from '@/lib/utils'
import type { Tables } from '@/types/supabase'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

type Category = Tables<'loans'>['category_type']
const CATEGORIES = ['Gold', 'Silver'] as const satisfies readonly Category[]
const isCategory = (v?: string): v is Category =>
  !!v && (CATEGORIES as readonly string[]).includes(v)

/** Whole days between two ISO dates. Both are plain dates, so no timezone. */
function daysHeld(issue: string, closed: string): number {
  const ms = Date.parse(`${closed}T00:00:00Z`) - Date.parse(`${issue}T00:00:00Z`)
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : 0
}

interface Props {
  searchParams: Promise<{
    category?: string; q?: string; field?: string; page?: string
    from?: string; to?: string; min?: string; max?: string
  }>
}

const SEARCH_FIELDS = ['name', 'father_name', 'location', 'id'] as const
type SearchField = (typeof SEARCH_FIELDS)[number]
const isSearchField = (value?: string): value is SearchField =>
  !!value && (SEARCH_FIELDS as readonly string[]).includes(value)
const validDate = (value?: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
const validAmount = (value?: string) => {
  const amount = Number(value)
  return value !== undefined && Number.isFinite(amount) && amount >= 0 ? amount : null
}

export default async function ClosedRecordsPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const page = Math.max(1, Number(params.page ?? 1) || 1)
  const from = (page - 1) * PAGE_SIZE

  let query = supabase
    .from('loans')
    .select(
      'id, name, father_name, amount, interest, category_type, detailed_type, weight, issue_date, closed_date',
      { count: 'exact' }
    )
    .eq('status', 'closed')
    // Most recently settled first: a shop on this screen is nearly always
    // checking something that happened today or yesterday.
    .order('closed_date', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)

  if (isCategory(params.category)) query = query.eq('category_type', params.category)
  const search = params.q?.trim().slice(0, 100)
  const field: SearchField = isSearchField(params.field) ? params.field : 'name'
  if (search) {
    query = field === 'id'
      ? query.eq('id', /^\d+$/.test(search) ? Number(search) : -1)
      : query.ilike(field, `%${search}%`)
  }
  const issueFrom = validDate(params.from)
  const issueTo = validDate(params.to)
  const minAmount = validAmount(params.min)
  const maxAmount = validAmount(params.max)
  if (issueFrom) query = query.gte('issue_date', issueFrom)
  if (issueTo) query = query.lte('issue_date', issueTo)
  if (minAmount !== null) query = query.gte('amount', minAmount)
  if (maxAmount !== null) query = query.lte('amount', maxAmount)

  const { data: loans, count, error } = await query
  if (error) throw new Error(`Closed records could not be loaded: ${error.message}`)
  const total = count ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const pageHref = (n: number) => {
    const sp = new URLSearchParams()
    if (params.category) sp.set('category', params.category)
    if (params.q) sp.set('q', params.q)
    if (params.field) sp.set('field', params.field)
    if (params.from) sp.set('from', params.from)
    if (params.to) sp.set('to', params.to)
    if (params.min) sp.set('min', params.min)
    if (params.max) sp.set('max', params.max)
    if (n > 1) sp.set('page', String(n))
    const qs = sp.toString()
    return qs ? `/view-records/closed?${qs}` : '/view-records/closed'
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Closed Records</h1>
          <p className="page-subtitle">
            {total === 0 ? 'No settled loans'
              : total <= PAGE_SIZE ? `${total} settled loan${total === 1 ? '' : 's'}`
              : `${from + 1}–${Math.min(from + PAGE_SIZE, total)} of ${total}`}
          </p>
        </div>
      </div>

      <LoanFilters
        currentStatus="closed" currentCategory={params.category} query={params.q}
        searchField={params.field} issueFrom={params.from} issueTo={params.to}
        minAmount={params.min} maxAmount={params.max}
      />

      {!loans?.length ? (
        <EmptyState
          icon={Archive}
          title="No closed records"
          description={
            params.q
              ? `No settled loans matching "${params.q}"`
              : 'Loans appear here once they are settled.'
          }
        />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#ID</th>
                <th>Name</th>
                <th>Type</th>
                <th className="hidden sm:table-cell">Weight</th>
                <th>Amount</th>
                <th>Interest</th>
                <th className="hidden lg:table-cell">Returned</th>
                <th className="hidden md:table-cell">Issued</th>
                <th>Closed</th>
                <th className="hidden lg:table-cell">Held</th>
              </tr>
            </thead>
            <tbody>
              {loans.map(loan => {
                // `interest` is the amount charged in rupees, written by
                // close_loan. It is never a rate, and it is null on a loan
                // closed without one.
                const interest = loan.interest ?? 0
                const returned = loan.amount + interest

                return (
                  <tr key={loan.id}>
                    <td className="text-slate-400 text-xs tabular-nums">#{loan.id}</td>
                    <td>
                      <Link href={`/loans/${loan.id}`} className="hover:text-primary-700 transition-colors">
                        <p className="font-medium text-sm">{loan.name}</p>
                        {loan.father_name && (
                          <p className="text-xs text-slate-400">S/o {loan.father_name}</p>
                        )}
                      </Link>
                    </td>
                    <td>
                      <Badge variant={loan.category_type === 'Gold' ? 'gold' : 'silver'}>
                        {loan.detailed_type || loan.category_type}
                      </Badge>
                    </td>
                    <td className="hidden sm:table-cell text-slate-600 text-sm tabular-nums">
                      {loan.weight ? `${loan.weight}g` : '—'}
                    </td>
                    <td className="font-semibold tabular-nums text-sm">
                      {formatCurrency(loan.amount)}
                    </td>
                    <td className="tabular-nums text-sm text-slate-600">
                      {loan.interest != null ? formatCurrency(interest) : '—'}
                    </td>
                    <td className="hidden lg:table-cell font-semibold tabular-nums text-sm text-emerald-700">
                      {formatCurrency(returned)}
                    </td>
                    <td className="hidden md:table-cell text-slate-500 text-sm">
                      {formatDate(loan.issue_date)}
                    </td>
                    <td className="text-slate-600 text-sm">
                      {loan.closed_date ? formatDate(loan.closed_date) : '—'}
                    </td>
                    <td className="hidden lg:table-cell text-slate-500 text-sm">
                      {loan.closed_date
                        ? formatDuration(daysHeld(loan.issue_date, loan.closed_date))
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {lastPage > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
          <Link
            href={pageHref(page - 1)}
            aria-disabled={page <= 1}
            className={page <= 1 ? 'pointer-events-none opacity-40' : ''}
          >
            <Button size="sm" variant="secondary">Previous</Button>
          </Link>
          <span className="text-xs text-slate-500">Page {page} of {lastPage}</span>
          <Link
            href={pageHref(page + 1)}
            aria-disabled={page >= lastPage}
            className={page >= lastPage ? 'pointer-events-none opacity-40' : ''}
          >
            <Button size="sm" variant="secondary">Next</Button>
          </Link>
        </nav>
      )}
    </div>
  )
}
