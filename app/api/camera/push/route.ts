/**
 * Camera Push API
 * POST /api/camera/push
 *
 * Called by the web UI when it wants the user's phone to open the camera.
 * Creates a camera_session and sends a Web Push notification to every paired
 * device.
 *
 * Web Push only. It reaches Android Chrome, iOS 16.4+ installed as a PWA, and
 * desktop Chrome — every browser the phone-capture flow actually runs in.
 *
 * Returns: { session_key, session_id } so the caller can subscribe to
 *          Supabase Realtime on camera_sessions.id for the photo result.
 */
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { PushSubscription } from 'web-push'
import { logServerError, rateLimit, requestId } from '@/lib/api-security'
import { currentPhotoCaptureEnabled } from '@/lib/photo-policy'

/**
 * A row from `paired_devices`, narrowed to the two columns this route selects.
 *
 * Declared explicitly rather than inferred, because `types/supabase.ts` is
 * still the loose placeholder: every `.select()` currently resolves to `any`,
 * so a callback parameter destructured from one has no type at all and
 * `noImplicitAny` rejects it. Annotating here keeps the route honest now and
 * stays correct once the generated types land — at which point a mismatch
 * against the real column types becomes a compile error, which is the point.
 */
type PairedDevice = {
  device_type: string | null
  push_subscription: unknown
}

function isPushSubscription(value: unknown): value is PushSubscription {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { endpoint?: unknown; keys?: { auth?: unknown; p256dh?: unknown } }
  return typeof candidate.endpoint === 'string'
    && typeof candidate.keys?.auth === 'string'
    && typeof candidate.keys?.p256dh === 'string'
}

// ─── Web Push (lazy init) ──────────────────────────────────────────────────
async function sendWebPush(subscription: PushSubscription, sessionKey: string, appUrl: string) {
  const webpush = (await import('web-push')).default
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_CONTACT_EMAIL!}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  await webpush.sendNotification(
    subscription,
    JSON.stringify({
      title:       'Photo Capture',
      body:        'Tap to open camera for customer photo',
      url:         `${appUrl}/camera?key=${sessionKey}`,
      session_key: sessionKey,
    }),
  )
}

// ─── POST ──────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await currentPhotoCaptureEnabled())) return NextResponse.json({ error: 'Photo capture is disabled in Settings' }, { status: 403 })

  const limited = await rateLimit(req, {
    scope: 'camera.push', limit: 20, windowSeconds: 60, identity: `user:${user.id}`,
  })
  if (limited) return limited

  const { data: appUser } = await supabase
    .from('users')
    .select('id, tenant_id')
    .eq('auth_id', user.id)
    .single()
  if (!appUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json()
  const { loan_id } = body   // optional — attach session to a loan

  const service = createServiceClient()

  // 1. Create camera session
  const sessionKey = crypto.randomUUID()
  const expiresAt  = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min

  const { data: session, error: sessionErr } = await service
    .from('camera_sessions')
    .insert({
      tenant_id:   appUser.tenant_id,
      loan_id:     loan_id ?? null,
      session_key: sessionKey,
      status:      'pending',
      expires_at:  expiresAt,
    })
    .select('id')
    .single()

  if (sessionErr) return NextResponse.json({ error: sessionErr.message }, { status: 500 })

  // 2. Fetch paired devices for this tenant/user
  const { data: devices } = await service
    .from('paired_devices')
    .select('device_type, push_subscription')
    .eq('user_id', appUser.id)

  if (!devices || devices.length === 0) {
    // No paired device — return session key so caller can fall back to QR
    return NextResponse.json({
      session_key: sessionKey,
      session_id:  session.id,
      pushed:      false,
      reason:      'no_paired_device',
    })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://loanpro.app'
  const errors: string[] = []

  await Promise.allSettled(
    (devices as PairedDevice[]).map(async (device) => {
      try {
        // Web Push covers every browser we care about: Android Chrome,
        // iOS 16.4+ as an installed PWA, and desktop Chrome. FCM was only
        // needed to reach the *native* Android companion app, which belongs
        // to the desktop product — dropping it removed firebase-admin and
        // with it a long tail of vulnerable transitive dependencies.
        if (isPushSubscription(device.push_subscription)) {
          await sendWebPush(device.push_subscription, sessionKey, appUrl)
        } else {
          errors.push(`${device.device_type}: invalid push subscription — re-pair this device`)
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'push delivery failed'
        errors.push(`${device.device_type}: ${message}`)
        logServerError('camera.push.delivery_failed', err, {
          request_id: requestId(req), device_type: device.device_type,
        })
      }
    }),
  )

  return NextResponse.json({
    session_key: sessionKey,
    session_id:  session.id,
    pushed:      true,
    errors:      errors.length ? errors : undefined,
  })
}
