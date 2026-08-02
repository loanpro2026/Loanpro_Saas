import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

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
          supabaseResponse = NextResponse.next({ request })
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
  const publicRoutes = ['/', '/pricing', '/login', '/register', '/auth/callback', '/offline']
  const isPublic = publicRoutes.some(r => pathname === r || pathname.startsWith('/api/webhooks'))

  // Camera page is public (accessed from mobile via QR)
  const isCameraPage = pathname.startsWith('/camera')

  if (!user && !isPublic && !isCameraPage) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (user && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|workbox-).*)',
  ],
}
