/**
 * View Records → Closed — /view-records/closed
 *
 * Settled loans. On the desktop this is its own screen with its own columns
 * (closing date, interest charged, total returned) rather than the active
 * table with a filter applied — aligning those columns is follow-up work.
 */
import LoansPage from '../../loans/page'

export const dynamic = 'force-dynamic'

export default async function ClosedRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; page?: string }>
}) {
  const params = await searchParams
  return LoansPage({ searchParams: Promise.resolve({ ...params, status: 'closed' }) })
}
