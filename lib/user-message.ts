/** Convert low-level failures into language suitable for a shop counter. */
export function userFacingError(error: unknown, fallback: string): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : ''

  const clean = message.replace(/\s+/g, ' ').trim()
  if (!clean) return fallback

  if (/failed to fetch|fetch failed|networkerror|network request|connection reset|offline/i.test(clean)) {
    return 'Check your internet connection and try again. Your existing information is unchanged.'
  }
  if (/not authenticated|jwt|session.*expired|unauthori[sz]ed|\b401\b/i.test(clean)) {
    return 'Your sign-in has expired. Sign in again, then retry.'
  }
  if (/forbidden|permission denied|row.level security|\b403\b/i.test(clean)) {
    return 'Your account does not have permission for this action.'
  }
  if (/supabase|postgres|database|sqlstate|duplicate key|constraint|relation |column |r2|s3|cloud run|api[_ -]?key|environment variable|unexpected token|invalid json|\b5\d\d\b/i.test(clean)) {
    return fallback
  }

  // Concise domain errors from server actions are useful (for example,
  // "This loan is already closed"). Do not expose an unbounded provider dump.
  return clean.length <= 180 ? clean : fallback
}
