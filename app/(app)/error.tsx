'use client'
/**
 * Error boundary for the signed-in app.
 *
 * Without this, a server component that throws renders as a blank white page.
 * Nothing on screen, nothing in the browser console — the failure is only
 * visible in the Vercel function logs, which a shop owner will never look at
 * and which cost us a debugging round trip the first time it happened.
 *
 * Next passes a `digest` on production errors: the real message is redacted
 * from the browser on purpose (it can leak query text or table names), but the
 * digest matches a log line server-side. Showing it means "the dashboard is
 * blank" becomes "the dashboard shows digest 3f2a91c", which is findable.
 */
import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app] render failed', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="card max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-50">
          <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-base font-semibold text-slate-900">
            This page could not load
          </h1>
          <p className="text-sm text-slate-500">
            Your records are safe — this is a problem displaying them, not
            storing them. Try again, and if it keeps happening send us the
            reference below.
          </p>
        </div>

        {error.digest && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
            Reference: {error.digest}
          </p>
        )}

        <div className="flex justify-center gap-2">
          <Button size="sm" onClick={reset}>
            <RotateCw className="h-4 w-4" /> Try again
          </Button>
          <Link href="/help">
            <Button size="sm" variant="secondary">Get help</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
