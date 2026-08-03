import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AccessDevices } from '@/components/settings/AccessDevices'
import { DeviceRevoked } from '@/components/settings/DeviceRevoked'

export default async function DeviceAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { reason } = await searchParams
  const revoked = reason === 'revoked'

  return (
    <main className="min-h-screen bg-surface-muted px-4 py-12">
      <div className="mx-auto max-w-2xl rounded-2xl border border-surface-border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          {revoked ? 'This device was signed out' : 'Choose a device to sign out'}
        </h1>
        <p className="mb-6 mt-2 text-sm text-slate-600">
          {revoked
            ? 'For your security, this session can no longer open LoanPro.'
            : 'Your plan’s device allowance has been reached. Sign out an older device, then refresh this page.'}
        </p>
        {revoked ? <DeviceRevoked /> : <AccessDevices recovery />}
      </div>
    </main>
  )
}
