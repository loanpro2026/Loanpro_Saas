/**
 * View Records → Active — /view-records/active
 *
 * A separate screen rather than a status filter, matching the desktop. The
 * loans table already accepts a status in the query string, so this fixes it
 * to 'active' and hands the rest through.
 */
import LoansPage from '../../loans/page'

export const dynamic = 'force-dynamic'

export default async function ActiveRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; page?: string }>
}) {
  const params = await searchParams
  return LoansPage({ searchParams: Promise.resolve({ ...params, status: 'active' }) })
}
