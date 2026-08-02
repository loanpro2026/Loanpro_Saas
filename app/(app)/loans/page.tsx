/**
 * /loans — retired.
 *
 * The desktop splits records into Active and Closed as separate screens, and
 * the app now follows that. This route existed before the split and rendered a
 * near-duplicate of the active table, which is exactly the sort of thing that
 * drifts: a column added in one place and forgotten in the other.
 *
 * Kept as a redirect rather than deleted, so any bookmark a shop already has
 * still lands somewhere sensible. /loans/[id] is unaffected — the detail page
 * is still the canonical place a single record lives.
 */
import { redirect } from 'next/navigation'

export default function LoansIndexPage() {
  redirect('/view-records/active')
}
