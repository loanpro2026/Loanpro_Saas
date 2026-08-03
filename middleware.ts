import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { deviceNameFromUserAgent } from '@/lib/device'
import { isPublicCameraRoute } from '@/lib/public-route'

export async function middleware(request: NextRequest) {
  const incomingRequestId = request.headers.get('x-request-id')?.trim()
  const correlationId = incomingRequestId && /^[a-zA-Z0-9._:-]{8,100}$/.test(incomingRequestId)
    ? incomingRequestId
    : crypto.randomUUID()
  const forwardedHeaders = new Headers(request.headers)
  forwardedHeaders.set('x-request-id', correlationId)

  let supabaseResponse = NextResponse.next({ request: { headers: forwardedHeaders } })

  /**
   * Check the two variables this file needs before using them.
   *
   * They were read with `!`, which tells TypeScript they exist but does nothing
   * at runtime — `undefined` reached createServerClient, which threw
   * "supabaseUrl is required". Because this middleware matches every route,
   * that single missing variable turned the entire site into
   * MIDDLEWARE_INVOCATION_FAILED, marketing pages included, with nothing in the
   * message naming the cause.
   *
   * Failing here is still correct: without Supabase the app cannot
   * authenticate anyone, and quietly serving pages would be worse. But it
   * should say what is wrong, in a line you can find in the Vercel function
   * logs, rather than making you guess.
   */
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    const missing = [
      !url && 'NEXT_PUBLIC_SUPABASE_URL',
      !anonKey && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ].filter(Boolean).join(', ')

    console.error(
      `[middleware] Missing environment variable(s): ${missing}.\n` +
      'Set them in Vercel → Settings → Environment Variables (Production, ' +
      'Preview and Development), then REDEPLOY — NEXT_PUBLIC_ values are ' +
      'inlined at build time, so saving them alone changes nothing.'
    )

    return new NextResponse(
      `Server not configured: missing ${missing}. See the function logs.`,
      { status: 500, headers: { 'Content-Type': 'text/plain' } }
    )
  }

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request: { headers: forwardedHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Public routes — no auth needed.
  //
  // /offline is public deliberately. It is the page the service worker caches
  // at install and serves when a navigation fails, and it renders from
  // IndexedDB with no session. If it required auth, the install-time
  // `cache.add('/offline')` would store a redirect to /login instead — and a
  // redirected response replayed for a navigation throws, so the one page
  // whose whole job is to work when nothing else does would be the page that
  // reliably failed.
  const publicRoutes = [
    '/', '/about', '/support', '/terms', '/privacy', '/refunds',
    '/login', '/register', '/forgot-password', '/reset-password',
    '/api/auth/callback', '/offline', '/device-access',
  ]
  const isPublic = publicRoutes.some(r => pathname === r || pathname.startsWith('/api/webhooks'))

  // Camera page is public (accessed from mobile via QR)
  // The phone has no login cookie; possession of the short-lived random
  // session key authorises only this poll/upload endpoint. Camera push remains
  // authenticated because `/api/camera/push` does not equal `/api/camera`.
  const isCameraPage = isPublicCameraRoute(pathname)
  const isDeviceRecovery = pathname === '/device-access' || pathname.startsWith('/api/access-devices')

  if (!user && !isPublic && !isCameraPage && !isDeviceRecovery) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (user && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Each Supabase login has a server-verified session_id claim. Register and
  // check that session here so revoking one device does not depend on a
  // spoofable browser fingerprint or affect the owner's other devices.
  if (user && !isDeviceRecovery && !isCameraPage && !pathname.startsWith('/api/webhooks')) {
    const { data: claimData, error: claimError } = await supabase.auth.getClaims()
    const sessionId = String(claimData?.claims?.session_id ?? '')

    if (!claimError && sessionId) {
      const { data: access, error: accessError } = await supabase.rpc('register_access_session', {
        p_session_id: sessionId,
        p_display_name: deviceNameFromUserAgent(request.headers.get('user-agent')),
        p_user_agent: request.headers.get('user-agent'),
      })

      if (accessError) {
        // During staged rollout the application may briefly be ahead of the
        // migration. Log loudly but do not lock the owner out of their books.
        console.error('[device-access] session check failed', accessError.message)
      } else {
        const state = access && typeof access === 'object' && !Array.isArray(access)
          ? access as Record<string, unknown>
          : {}
        const status = String(state.status ?? '')

        if (status === 'revoked' || status === 'limit_reached') {
          if (pathname.startsWith('/api/')) {
            return NextResponse.json(
              { error: status === 'revoked' ? 'This device was signed out' : 'Device limit reached' },
              { status: 403 },
            )
          }
          const recovery = new URL('/device-access', request.url)
          recovery.searchParams.set('reason', status === 'revoked' ? 'revoked' : 'limit')
          return NextResponse.redirect(recovery)
        }
      }
    }
  }

  supabaseResponse.headers.set('x-request-id', correlationId)
  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|workbox-).*)',
  ],
}
