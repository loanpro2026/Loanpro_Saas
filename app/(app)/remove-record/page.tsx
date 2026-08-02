/**
 * Remove Record — /remove-record
 *
 * The desktop screen (Removerecord.tsx) is a search-and-settle workspace:
 * filters across the top (Search By, Amount Range, Loan Duration, Date Order),
 * then for the chosen record its deposit history, remarks, stored identity
 * photo and computed interest, with the settle action at the end.
 *
 * This route currently lists the active loans so the path works and leads to
 * the right records — the loan detail page carries the closing flow. Rebuilding
 * the desktop's single-screen version is the next piece of work, and is where
 * the collection-photo capture from migration 019 will live.
 */
import LoansPage from '../loans/page'

export const dynamic = 'force-dynamic'

export default async function RemoveRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; page?: string }>
}) {
  const params = await searchParams
  return LoansPage({ searchParams: Promise.resolve({ ...params, status: 'active' }) })
}
