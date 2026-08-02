/**
 * Remove Record — /remove-record
 *
 * Matches the desktop's Removerecord screen: filter down to a record, then
 * settle it with everything about it visible on the same page.
 */
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RemoveRecordWorkspace } from '@/components/records/RemoveRecordWorkspace'

export const dynamic = 'force-dynamic'

export default async function RemoveRecordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: appUser } = await supabase
    .from('users').select('role').eq('auth_id', user.id).single()

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Remove Record</h1>
          <p className="page-subtitle">Find a loan and settle it</p>
        </div>
      </div>

      <RemoveRecordWorkspace canDelete={appUser?.role === 'owner'} />
    </div>
  )
}
