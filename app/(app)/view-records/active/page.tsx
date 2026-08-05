/**
 * View Records → Active — /view-records/active
 *
 * Every loan currently out, in the design's nine-column table. Settlement does
 * not happen here: this screen is for looking things up, and the only way to
 * take money is through Remove Record. That separation is deliberate and is why
 * the subtitle says so out loud.
 */
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FileText, Plus } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/Page'
import { LoanFilters } from '@/components/loans/LoanFilters'
import {
  DiagnosticPanel, describeError, type CallFailure,
} from '@/components/dashboard/DiagnosticPanel'
import { RecordsTable, Pagination, type RecordRow } from '@/components/loans/RecordsTable'
import { formatCurrency } from '@/lib/utils'

export const dynamic = 'force-dynamic'

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

/** Rows per page. A migrated shop can have thousands of loans; the previous
 *  hard cap of 200 silently hid the rest with no indication anything was
 *  missing — which is worse than a slow page. */
const PAGE_SIZE = 50

/**
 * Query-string values are whatever someone typed in the address bar, so they
 * have to be checked against the values the column actually permits.
 *
 * `satisfies` ties this list to the CHECK constraint in the migrations: if a
 * category is ever added or renamed in SQL, the generated union changes and
 * this stops compiling, rather than quietly filtering on a value the database
 * will never contain.
 */
type Category = Tables<'loans'>['category_type']
const CATEGORIES = ['Gold', 'Silver'] as const satisfies readonly Category[]
const isCategory = (v?: string): v is Category =>
  !!v && (CATEGORIES as readonly string[]).includes(v)

export default async function ActiveRecordsPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: appUser } = await supabase
    .from('users').select('tenant_id, role').eq('auth_id', user.id).single()
  if (!appUser) redirect('/login')

  const page = Math.max(1, Number(params.page ?? 1) || 1)
  const offset = (page - 1) * PAGE_SIZE
  const sort: Sort = isSort(params.sort) ? params.sort : 'newest'

  let query = supabase
    .from('loans')
    .select(
      'id, name, father_name, location, amount, category_type, detailed_type, weight, interest, issue_date',
      { count: 'exact' }
    )
    .eq('tenant_id', appUser.tenant_id)
    .eq('status', 'active')

  if (sort === 'amount') query = query.order('amount', { ascending: false })
  else query = query.order('issue_date', { ascending: sort === 'oldest' })
  // Stable tiebreak; many loans share a date.
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

  /**
   * A failed query reports itself instead of taking the screen down.
   *
   * This used to `throw`, which in a production build gives the error boundary
   * and a digest — a number you have to carry to the Vercel logs to learn
   * anything at all. For a screen whose whole job is to look records up, that
   * turns "one query failed" into "the page is gone, and I cannot tell you
   * why", which is how a five-second fix becomes a long afternoon.
   *
   * The page still renders. The reason appears above it, for owners.
   */
  const diagnostics: CallFailure[] = []
  if (error) {
    diagnostics.push(describeError('loans (active records)', error))
    console.error('[view-records/active] query errored:', error)
  }

  const total = count ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const outstanding = (loans ?? []).reduce((sum, loan) => sum + Number(loan.amount ?? 0), 0)

  const pageHref = (n: number) => {
    const sp = new URLSearchParams()
    for (const key of ['category', 'q', 'field', 'sort', 'from', 'to', 'min', 'max'] as const) {
      const value = params[key]
      if (value) sp.set(key, value)
    }
    if (n > 1) sp.set('page', String(n))
    const qs = sp.toString()
    return qs ? `/view-records/active?${qs}` : '/view-records/active'
  }

  return (
    <div className="page-stack">
      {appUser.role === 'owner' && <DiagnosticPanel failures={diagnostics} />}

      <PageHeader
        title="Active Records"
        subtitle={
          total === 0
            ? 'No active loans. Settlement happens on the Remove Record page.'
            : `${total} active loan${total === 1 ? '' : 's'} · ${formatCurrency(outstanding)} on this page. ` +
              'Settlement happens on the Remove Record page.'
        }
        actions={
          <LoanFilters
            currentStatus="active" currentCategory={params.category} query={params.q}
            searchField={params.field} sort={sort} issueFrom={params.from} issueTo={params.to}
            minAmount={params.min} maxAmount={params.max}
          />
        }
      />

      {!loans?.length ? (
        <EmptyState
          icon={FileText}
          title="No loans found"
          description={params.q ? `Nothing matches “${params.q}”.` : 'No active loans in this category yet.'}
          action={
            <Link href="/add-record">
              <Button size="sm"><Plus className="h-4 w-4" /> Add New Record</Button>
            </Link>
          }
        />
      ) : (
        <RecordsTable
          variant="active"
          rows={loans as RecordRow[]}
          countLabel={
            total <= PAGE_SIZE
              ? `Showing all ${total} active record${total === 1 ? '' : 's'}`
              : `Showing ${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total} active records`
          }
          pagination={<Pagination page={page} lastPage={lastPage} hrefFor={pageHref} />}
        />
      )}
    </div>
  )
}
