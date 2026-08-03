/**
 * Remove Record — /remove-record
 *
 * Deliberate entry point: search active loans, then open the complete record.
 */
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RemoveRecordWorkspace } from '@/components/records/RemoveRecordWorkspace'

export const dynamic = 'force-dynamic'

export default async function RemoveRecordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Remove Record</h1>
          <p className="page-subtitle">Find an active loan to add a deposit or settle it.</p>
        </div>
      </div>

      <RemoveRecordWorkspace />
    </div>
  )
}
