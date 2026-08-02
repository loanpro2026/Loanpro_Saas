import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency, formatDate, getLoanAge } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Plus, FileText } from 'lucide-react'
import { LoanFilters } from '@/components/loans/LoanFilters'
import { Button } from '@/components/ui/Button'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ category?: string; q?: string; page?: string }>
}

/** Rows per page. A migrated shop can have thousands of loans; the previous
 *  hard cap of 200 silently hid the rest with no indication anything was
 *  missing — which is worse than a slow page. */
const PAGE_SIZE = 50

/**
 * Query-string values are whatever someone typed in the address bar, so they
 * have to be checked against the values the column actually permits.
 *
 * `satisfies` ties these lists to the CHECK constraints in the migrations: if
 * a status is ever added or renamed in SQL, the generated union changes and
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
    .from('users').select('tenant_id').eq('auth_id', user.id).single()
  if (!appUser) redirect('/login')

  const page = Math.max(1, Number(params.page ?? 1) || 1)
  const from = (page - 1) * PAGE_SIZE

  let query = supabase
    .from('loans')
    .select(
      'id, name, father_name, location, amount, category_type, detailed_type, weight, interest, issue_date',
      { count: 'exact' }
    )
    .eq('tenant_id', appUser.tenant_id)
    .order('issue_date', { ascending: false })
    .order('id', { ascending: false })   // stable tiebreak; many loans share a date
    .range(from, from + PAGE_SIZE - 1)

  query = query.eq('status', 'active')

  if (isCategory(params.category)) {
    query = query.eq('category_type', params.category)
  }

  if (params.q) {
    query = query.ilike('name', `%${params.q}%`)
  }

  const { data: loans, count } = await query
  const total = count ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const pageHref = (n: number) => {
    const sp = new URLSearchParams()
    if (params.category) sp.set('category', params.category)
    if (params.q) sp.set('q', params.q)
    if (n > 1) sp.set('page', String(n))
    const qs = sp.toString()
    return qs ? `/view-records/active?${qs}` : '/view-records/active'
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Active Records</h1>
          <p className="page-subtitle">
            {total === 0 ? 'No records'
              : total <= PAGE_SIZE ? `${total} record${total === 1 ? '' : 's'}`
              : `${from + 1}–${Math.min(from + PAGE_SIZE, total)} of ${total}`}
          </p>
        </div>
        <Link href="/add-record">
          <Button size="sm"><Plus className="h-4 w-4" /> Add New Record</Button>
        </Link>
      </div>

      <LoanFilters currentStatus="active" currentCategory={params.category} query={params.q} />

      {!loans?.length ? (
        <EmptyState
          icon={FileText}
          title="No loans found"
          description={params.q ? `No loans matching "${params.q}"` : "No loans in this category yet."}
          action={<Link href="/add-record"><Button size="sm"><Plus className="h-4 w-4" /> Add Loan</Button></Link>}
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
                <th className="hidden md:table-cell">Interest</th>
                <th className="hidden md:table-cell">Date</th>
                <th className="hidden lg:table-cell">Age</th>
              </tr>
            </thead>
            <tbody>
              {loans.map(loan => (
                <tr key={loan.id}>
                  <td className="text-slate-400 text-xs tabular-nums">#{loan.id}</td>
                  <td>
                    <Link href={`/loans/${loan.id}`} className="hover:text-primary-700 transition-colors">
                      <p className="font-medium text-sm">{loan.name}</p>
                      {loan.father_name && <p className="text-xs text-slate-400">S/o {loan.father_name}</p>}
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
                  {/* Interest is the amount charged at closing, in rupees —
                      NULL while a loan is active. */}
                  <td className="hidden md:table-cell text-slate-500 text-sm tabular-nums">
                    {loan.interest != null ? formatCurrency(loan.interest) : '—'}
                  </td>
                  <td className="hidden md:table-cell text-slate-500 text-sm">
                    {formatDate(loan.issue_date)}
                  </td>
                  <td className="hidden lg:table-cell text-slate-500 text-sm">
                    {getLoanAge(loan.issue_date)}
                  </td>
                </tr>
              ))}
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
            <Button variant="secondary" size="sm" disabled={page <= 1}>Previous</Button>
          </Link>

          <span className="text-xs text-slate-500 tabular-nums">
            Page {page} of {lastPage}
          </span>

          <Link
            href={pageHref(page + 1)}
            aria-disabled={page >= lastPage}
            className={page >= lastPage ? 'pointer-events-none opacity-40' : ''}
          >
            <Button variant="secondary" size="sm" disabled={page >= lastPage}>Next</Button>
          </Link>
        </nav>
      )}
    </div>
  )
}
