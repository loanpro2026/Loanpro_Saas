/**
 * The actual reason a dashboard call failed, on the page.
 *
 * The page has always logged this — `[dashboard] dashboard_snapshot errored:`
 * — but a Vercel function log is a place you have to go and know how to read,
 * and the widget errors it produces ("could not be loaded") deliberately say
 * nothing about why. That is right for a shopkeeper at a counter and useless
 * for whoever has to fix it, so the same failure has cost several rounds of
 * guessing at a message the server already had in its hand.
 *
 * PostgREST errors are structured — code, message, details, hint — and the
 * code alone usually settles it:
 *
 *   PGRST202  the function is not in PostgREST's schema cache
 *   PGRST203  two functions share that name; it cannot choose
 *   42883     no such function in the database at all
 *   42501     the function exists but `authenticated` cannot execute it
 *   42P01     a table the function reads does not exist
 *   42703     a column it reads does not exist
 *   28000     get_tenant_id() returned NULL — no session reached Postgres
 *   57014     statement timeout
 *
 * Shown to owners only. A staff account gains nothing from a SQLSTATE, and a
 * database error message can name tables and columns.
 */
import { AlertTriangle } from 'lucide-react'

export interface CallFailure {
  /** The RPC or table the app asked for. */
  call: string
  code?: string
  message?: string
  details?: string
  hint?: string
}

/** Pull the useful fields off whatever supabase-js handed back. */
export function describeError(call: string, error: unknown): CallFailure {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>
    return {
      call,
      code: typeof e.code === 'string' ? e.code : undefined,
      message: typeof e.message === 'string' ? e.message : String(error),
      details: typeof e.details === 'string' ? e.details : undefined,
      hint: typeof e.hint === 'string' ? e.hint : undefined,
    }
  }
  return { call, message: String(error) }
}

const MEANING: Record<string, string> = {
  PGRST202: 'PostgREST cannot see this function. Its schema cache is stale — run NOTIFY pgrst, \'reload schema\';',
  PGRST203: 'Two functions share this name. PostgREST cannot choose between them — drop the old signature.',
  PGRST301: 'The request carried no valid JWT, so Postgres saw no session.',
  '42883': 'No such function in the database. The migration that creates it has not been applied.',
  '42501': 'The function exists but the authenticated role has no EXECUTE grant on it.',
  '42P01': 'The function reads a table that does not exist.',
  '42703': 'The function reads a column that does not exist.',
  '28000': 'get_tenant_id() returned NULL — the session did not reach Postgres.',
  '57014': 'Statement timeout. The query took longer than the database allows.',
  '55000': 'The object is in a state that does not permit this — often a stale prepared plan.',
}

export function DiagnosticPanel({ failures }: { failures: CallFailure[] }) {
  if (failures.length === 0) return null

  return (
    <section
      className="rounded-2xl border border-amber bg-amber-bg p-4"
      aria-labelledby="diagnostic-title"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="diagnostic-title" className="text-13 font-bold text-amber">
            {failures.length === 1
              ? 'One dashboard call failed'
              : `${failures.length} dashboard calls failed`}
          </h2>
          <p className="mt-0.5 text-12 text-amber">
            Visible to owners only. No data was changed.
          </p>

          <ul className="mt-3 space-y-2.5">
            {failures.map(failure => (
              <li
                key={failure.call}
                className="rounded-lg border border-amber/40 bg-surface-card p-3"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <code className="text-12.5 font-bold text-ink">{failure.call}</code>
                  {failure.code && (
                    <code className="rounded bg-red-bg px-1.5 py-0.5 text-11 font-bold text-red">
                      {failure.code}
                    </code>
                  )}
                </div>

                {failure.message && (
                  <p className="mt-1.5 break-words text-12.5 text-ink">{failure.message}</p>
                )}
                {failure.details && (
                  <p className="mt-1 break-words text-12 text-ink-muted">{failure.details}</p>
                )}
                {failure.hint && (
                  <p className="mt-1 break-words text-12 text-ink-muted">Hint: {failure.hint}</p>
                )}
                {failure.code && MEANING[failure.code] && (
                  <p className="mt-1.5 text-12 font-medium text-amber">
                    {MEANING[failure.code]}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
