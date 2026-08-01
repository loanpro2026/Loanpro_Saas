import { JoinForm } from '@/components/settings/JoinForm'

/**
 * Accepting a staff invitation.
 *
 * Outside the (app) route group on purpose: the person arriving here has an
 * account but no tenant yet, so the app layout would bounce them to /register
 * in a loop.
 */
export const dynamic = 'force-dynamic'

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <JoinForm token={token ?? ''} />
      </div>
    </div>
  )
}
