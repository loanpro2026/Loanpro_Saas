/**
 * Camera Session API
 * POST /api/camera        — create a new camera session (authenticated)
 * GET  /api/camera?key=X  — poll session status (public, used by mobile)
 * PUT  /api/camera        — upload photo and mark captured (public, used by mobile)
 */
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server'
import { putObject, presignDownload, cameraSessionKey, MAX_PHOTO_BYTES, ALLOWED_MIME, type AllowedMime } from '@/lib/r2'
import { NextResponse } from 'next/server'
import { logServerError, rateLimit, requestId } from '@/lib/api-security'

// POST — create session
export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await rateLimit(req, {
    scope: 'camera.create', limit: 20, windowSeconds: 60, identity: `user:${user.id}`,
  })
  if (limited) return limited

  const { data: appUser } = await supabase.from('users').select('tenant_id').eq('auth_id', user.id).single()
  if (!appUser) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { loan_id } = await req.json().catch(() => ({ loan_id: null }))

  const service = createServiceClient()
  const { data: session, error } = await service
    .from('camera_sessions')
    .insert({ tenant_id: appUser.tenant_id, loan_id: loan_id || null })
    .select('session_key, id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session_key: session.session_key })
}

// GET — poll session status
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

  const limited = await rateLimit(req, {
    scope: 'camera.poll', limit: 90, windowSeconds: 60,
  })
  if (limited) return limited

  const service = createServiceClient()
  const { data, error } = await service
    .from('camera_sessions')
    .select('status, r2_key, expires_at')
    .eq('session_key', key)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  if (new Date(data.expires_at) < new Date()) {
    await service.from('camera_sessions').update({ status: 'expired' }).eq('session_key', key)
    return NextResponse.json({ status: 'expired' })
  }

  // Hand back a short-lived signed URL rather than a permanent one — the
  // desktop/browser only needs it long enough to display and attach the photo.
  const photo_url = data.r2_key ? await presignDownload(data.r2_key, 300) : null

  return NextResponse.json({ status: data.status, photo_url })
}

// PUT — mobile uploads photo to this session
export async function PUT(req: Request) {
  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

  const limited = await rateLimit(req, {
    scope: 'camera.upload', limit: 10, windowSeconds: 600,
  })
  if (limited) return limited

  const service = createServiceClient()

  // Get session
  const { data: session, error: sessionError } = await service
    .from('camera_sessions')
    .select('id, tenant_id, loan_id, status, expires_at')
    .eq('session_key', key)
    .single()

  if (sessionError || !session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.status !== 'pending') return NextResponse.json({ error: 'Session already used or expired' }, { status: 409 })
  if (new Date(session.expires_at) < new Date()) {
    await service.from('camera_sessions').update({ status: 'expired' }).eq('session_key', key)
    return NextResponse.json({ error: 'Session expired' }, { status: 410 })
  }

  // Get photo from body
  const formData = await req.formData()
  const file = formData.get('photo') as File | null
  if (!file) return NextResponse.json({ error: 'No photo in request' }, { status: 400 })

  // This endpoint is reachable by anyone holding a session key, so the size and
  // type limits are the only thing standing between us and an arbitrary upload.
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: 'Photo too large' }, { status: 413 })
  }
  const mimeType = (file.type || 'image/jpeg') as AllowedMime
  if (!ALLOWED_MIME.includes(mimeType)) {
    return NextResponse.json({ error: 'Unsupported image type' }, { status: 415 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const r2Key = cameraSessionKey(session.tenant_id, session.id)

  try {
    await putObject(r2Key, buffer, mimeType)
  } catch (err) {
    logServerError('camera.upload.storage_failed', err, {
      request_id: requestId(req), session_id: String(session.id),
    })
    return NextResponse.json({ error: 'Could not store photo' }, { status: 502 })
  }

  await service.from('camera_sessions').update({
    status: 'captured',
    r2_key: r2Key,
  }).eq('session_key', key)

  // Realtime fires from the UPDATE above, so the waiting browser picks this up
  // without polling. The signed URL here is for the phone's own confirmation view.
  const photo_url = await presignDownload(r2Key, 300)
  return NextResponse.json({ success: true, photo_url })
}
