/**
 * View Records → Closed — /view-records/closed
 *
 * Its own screen, not the active table with a filter applied. A settled loan is
 * a different record: the date that matters is the closing date, not the issue
 * date, and the figures a shop comes here for — what interest was charged, what
 * came back — belong to the settlement rather than the loan.
 *
 * Columns follow the design's records table, with "Closed" in place of
 * "Issued". Interest and returned principal live on the record itself and in
 * View Accounts → Interest, which is where the design puts them.
 */
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Archive } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/Page'
import { LoanFilters } from '@/components/loans/LoanFilters'
import { RecordsTable, Pagination, type RecordRow } from '@/components/loans/RecordsTable'
import type { Tables } from '@/types/supabase'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

type Category = Tables<'loans'>['category_type']
const CATEGORIES = ['Gold', 'Silver'] as const satisfies readonly Category[]
const isCategory = (v?: string): v is Category =>
  !!v && (CATEGORIES as readonly string[]).includes(v)

interface Props {
  searchParams: Promise<{
    category?: string; q?: string; field?: string; page?: string; sort?: string
    from?: string; to?: string; min?: string; max?: string
  }>
}

const SEARCH_FIELDS = ['name', 'father_name', 'location', 'id'] as const
type SearchField = (typeof SEARCH_FIELDS)[number]
const isSearchField = (value?: string): value is SearchField =>
  !!value && (SEARCH_FIELDS as readonly string[]).includes(value)

const SORTS = ['newest', 'oldest', 'amount'] as const
type Sort = (typeof SORTS)[number]
const isSort = (value?: string): value is Sort =>
  !!value && (SORTS as readonly string[]).includes(value)

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
  const offset = (page - 1) * PAGE_SIZE
  const sort: Sort = isSort(params.sort) ? params.sort : 'newest'

  let query = supabase
    .from('loans')
    .select(
      'id, name, father_name, location, amount, interest, category_type, detailed_type, weight, issue_date, closed_date',
      { count: 'exact' }
    )
    .eq('status', 'closed')

  // Most recently settled first: a shop on this screen is nearly always
  // checking something that happened today or yesterday.
  if (sort === 'amount') query = query.order('amount', { ascending: false })
  else query = query.order('closed_date', { ascending: sort === 'oldest' })
  query = query.order('id', { ascending: sort === 'oldest' }).range(offset, offset + PAGE_SIZE - 1)

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
    for (const key of ['category', 'q', 'field', 'sort', 'from', 'to', 'min', 'max'] as const) {
      const value = params[key]
      if (value) sp.set(key, value)
    }
    if (n > 1) sp.set('page', String(n))
    const qs = sp.toString()
    return qs ? `/view-records/closed?${qs}` : '/view-records/closed'
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Closed Records"
        subtitle={
          total === 0
            ? 'Loans appear here once they are settled.'
            : `${total} settled loan${total === 1 ? '' : 's'} · deposits and interest are archived, ` +
              'records stay editable by the owner'
        }
        actions={
          <LoanFilters
            currentStatus="closed" currentCategory={params.category} query={params.q}
            searchField={params.field} sort={sort} issueFrom={params.from} issueTo={params.to}
            minAmount={params.min} maxAmount={params.max}
          />
        }
      />

      {!loans?.length ? (
        <EmptyState
          icon={Archive}
          title="No closed records"
          description={
            params.q
              ? `No settled loans match “${params.q}”.`
              : 'Loans appear here once they are settled on the Remove Record page.'
          }
        />
      ) : (
        <RecordsTable
          variant="closed"
          rows={loans as RecordRow[]}
          countLabel={
            total <= PAGE_SIZE
              ? `Showing all ${total} closed record${total === 1 ? '' : 's'}`
              : `Showing ${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total} closed records`
          }
          pagination={<Pagination page={page} lastPage={lastPage} hrefFor={pageHref} />}
        />
      )}
    </div>
  )
}
