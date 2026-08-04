import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/api-security'
import { getSessionContext } from '@/lib/tenant'
import { ALLOWED_MIME, MAX_PHOTO_BYTES } from '@/lib/r2'
import {
  createCloudCaptureSession,
  deleteCloudCaptureSession,
  getCloudCaptureStatus,
  MobileCaptureError,
} from '@/lib/mobile-capture'
import { currentPhotoCaptureEnabled } from '@/lib/photo-policy'

function failure(error: unknown) {
  const status = error instanceof MobileCaptureError ? error.status : 500
  const message = error instanceof Error ? error.message : 'Mobile capture request failed.'
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: Request) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await currentPhotoCaptureEnabled())) return NextResponse.json({ error: 'Photo capture is disabled in Settings' }, { status: 403 })

  const limited = await rateLimit(req, {
    scope: 'mobile-capture.capture', limit: 20, windowSeconds: 60,
    identity: `user:${ctx.authId}`,
  })
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const deviceId = typeof body?.device_id === 'string' ? body.device_id.trim() : undefined

  try {
    const session = await createCloudCaptureSession(ctx.tenantId, deviceId || undefined)
    return NextResponse.json({
      session_id: session.sessionId,
      device_id: session.deviceId,
      expires_at: session.expiresAt,
    })
  } catch (error) {
    return failure(error)
  }
}

export async function GET(req: Request) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await currentPhotoCaptureEnabled())) return NextResponse.json({ error: 'Photo capture is disabled in Settings' }, { status: 403 })

  const sessionId = new URL(req.url).searchParams.get('session_id')?.trim()
  if (!sessionId) return NextResponse.json({ error: 'session_id is required' }, { status: 400 })

  try {
    const result = await getCloudCaptureStatus(ctx.tenantId, sessionId)
    if (result.status !== 'captured') {
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
    }

    const mimeType = result.imageContentType ?? 'image/jpeg'
    if (!ALLOWED_MIME.includes(mimeType as (typeof ALLOWED_MIME)[number])) {
      return NextResponse.json({ error: 'Phone returned an unsupported image type' }, { status: 415 })
    }
    if (!result.imageBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.imageBase64)) {
      return NextResponse.json({ error: 'Phone returned an invalid image' }, { status: 502 })
    }

    const byteSize = Buffer.from(result.imageBase64, 'base64').length
    if (byteSize <= 0 || byteSize > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: 'Phone photo is empty or too large' }, { status: 413 })
    }

    return NextResponse.json({
      status: 'captured',
      image_base64: result.imageBase64,
      image_content_type: mimeType,
      byte_size: byteSize,
      device_id: result.deviceId,
    }, { headers: { 'Cache-Control': 'no-store, private' } })
  } catch (error) {
    return failure(error)
  }
}

export async function DELETE(req: Request) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionId = new URL(req.url).searchParams.get('session_id')?.trim()
  if (!sessionId) return NextResponse.json({ error: 'session_id is required' }, { status: 400 })

  try {
    await deleteCloudCaptureSession(ctx.tenantId, sessionId)
    return NextResponse.json({ success: true })
  } catch (error) {
    return failure(error)
  }
}
