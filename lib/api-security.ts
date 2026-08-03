import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'

import { createServiceClient } from '@/lib/supabase/server'

type RateLimitOptions = {
  scope: string
  limit: number
  windowSeconds: number
  /** Prefer a verified auth id, tenant id, or unguessable session key. */
  identity?: string
}

type RateLimitRow = {
  allowed: boolean
  remaining: number
  retry_after: number
}

function requestAddress(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

function identityHash(scope: string, identity: string): string {
  // Only the digest reaches Postgres. This keeps IP addresses and session keys
  // out of the limiter table and out of database logs/backups.
  return createHash('sha256').update(`${scope}\0${identity}`).digest('hex')
}

export function requestId(req: Request): string {
  const supplied = req.headers.get('x-request-id')?.trim()
  return supplied && /^[a-zA-Z0-9._:-]{8,100}$/.test(supplied)
    ? supplied
    : randomUUID()
}

export function logServerError(
  event: string,
  error: unknown,
  context: Record<string, string | number | boolean | null | undefined> = {},
) {
  const details = error instanceof Error
    ? { error_name: error.name, error_message: error.message }
    : { error_message: String(error) }

  // One JSON object per failure is searchable in any log provider and avoids
  // accidentally serialising request bodies, cookies, tokens, or photo keys.
  console.error(JSON.stringify({
    level: 'error',
    event,
    timestamp: new Date().toISOString(),
    ...context,
    ...details,
  }))
}

/**
 * Database-backed fixed-window limiter. Unlike an in-memory Map, the limit is
 * shared by every web instance and survives a deployment or cold start.
 */
export async function rateLimit(
  req: Request,
  options: RateLimitOptions,
): Promise<NextResponse | null> {
  const identity = options.identity || `ip:${requestAddress(req)}`
  const service = createServiceClient()
  const { data, error } = await service.rpc('consume_api_rate_limit', {
    p_scope: options.scope,
    p_identity_hash: identityHash(options.scope, identity),
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
  })

  if (error) {
    // Fail open for availability, but make the control failure actionable.
    // Authentication and authorisation continue to protect the route.
    logServerError('api.rate_limit.unavailable', error, {
      request_id: requestId(req),
      scope: options.scope,
    })
    return null
  }

  const row = (Array.isArray(data) ? data[0] : data) as RateLimitRow | null
  if (!row || row.allowed) return null

  const retryAfter = Math.max(1, Number(row.retry_after) || options.windowSeconds)
  return NextResponse.json(
    {
      error: 'Too many requests. Please wait before trying this action again.',
      retry_after: retryAfter,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'Cache-Control': 'no-store',
        'X-RateLimit-Limit': String(options.limit),
        'X-RateLimit-Remaining': '0',
      },
    },
  )
}
