/**
 * Remove Record — /remove-record
 *
 * The only place a loan can be settled. A deliberate entry point: search for an
 * active loan, then open its record in the settlement workspace. Nothing is
 * listed until you search, which is the design's intent — settling is the one
 * irreversible thing a shop does at the counter, and a list you can click by
 * accident is the wrong shape for it.
 *
 * The two counters in the header come from the same tenant-scoped tables the
 * rest of the app reads; they are context, and a failure to load them must not
 * stop anyone settling a loan.
 */
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RemoveRecordWorkspace } from '@/components/records/RemoveRecordWorkspace'
import { PageHeader } from '@/components/ui/Page'
import { todayIST } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function RemoveRecordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = todayIST()
  const [activeResult, settledResult] = await Promise.allSettled([
    supabase.from('loans').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('loans').select('id', { count: 'exact', head: true })
      .eq('status', 'closed').eq('closed_date', today),
  ])

  /** The count, or null when the query failed — never a zero standing in for
   *  "unknown", which on this screen would read as "nothing is out on loan". */
  function countOf(result: PromiseSettledResult<unknown>): number | null {
    if (result.status !== 'fulfilled') return null
    const value = result.value as { count?: number | null; error?: unknown }
    return value.error ? null : value.count ?? 0
  }

  const activeCount = countOf(activeResult)
  const settledToday = countOf(settledResult)

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="Remove Record"
        subtitle="Find an active loan, then add a deposit or settle and close it. Settlement happens only here."
        actions={
          <div className="card flex gap-5 px-4 py-2.5">
            <div>
              <p className="text-11.5 text-ink-muted">Active loans</p>
              <p className="mt-0.5 text-15 font-bold tabular-nums text-ink">
                {activeCount ?? '—'}
              </p>
            </div>
            <div className="w-px bg-surface-border" aria-hidden />
            <div>
              <p className="text-11.5 text-ink-muted">Settled today</p>
              <p className="mt-0.5 text-15 font-bold tabular-nums text-green">
                {settledToday ?? '—'}
              </p>
            </div>
          </div>
        }
      />

      <RemoveRecordWorkspace />
    </div>
  )
}
