import { JoinForm } from '@/components/settings/JoinForm'
import Link from 'next/link'

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
    <div className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md space-y-5">
        <Link href="/" className="mx-auto flex w-fit items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white dark:bg-white dark:text-slate-950">LP</span>
          <span className="text-lg font-bold text-slate-900">LoanPro</span>
        </Link>
        <JoinForm token={token ?? ''} />
      </div>
    </div>
  )
}
