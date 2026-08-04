import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/api-security'
import { getSessionContext } from '@/lib/tenant'
import {
  listCloudCaptureDevices,
  MobileCaptureError,
  mobileCaptureConfigured,
  removeCloudCaptureDevice,
  updateCloudCaptureDevice,
} from '@/lib/mobile-capture'
import { currentPhotoSettings } from '@/lib/photo-policy'

export const dynamic = 'force-dynamic'

function failure(error: unknown) {
  const status = error instanceof MobileCaptureError ? error.status : 500
  const message = error instanceof Error ? error.message : 'Mobile capture request failed.'
  return NextResponse.json({ error: message }, { status })
}

export async function GET() {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await currentPhotoSettings()
  if (!settings.identity_verification_enabled || settings.photo_capture_mode !== 'mobile') {
    return NextResponse.json({ configured: false, devices: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }

  if (!mobileCaptureConfigured()) {
    return NextResponse.json({ configured: false, devices: [] }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  try {
    const devices = await listCloudCaptureDevices(ctx.tenantId)
    return NextResponse.json({ configured: true, devices }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return failure(error)
  }
}

export async function PATCH(req: Request) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'owner') return NextResponse.json({ error: 'Owner access required' }, { status: 403 })
  const settings = await currentPhotoSettings()
  if (!settings.identity_verification_enabled || settings.photo_capture_mode !== 'mobile') {
    return NextResponse.json({ error: 'Mobile photo capture is not enabled in Settings' }, { status: 403 })
  }

  const limited = await rateLimit(req, {
    scope: 'mobile-capture.devices.update', limit: 20, windowSeconds: 600,
    identity: `user:${ctx.authId}`,
  })
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const deviceId = String(body?.device_id ?? '').trim()
  const deviceName = typeof body?.device_name === 'string' ? body.device_name.trim() : undefined
  const isDefault = typeof body?.is_default === 'boolean' ? body.is_default : undefined

  if (!deviceId || (deviceName === undefined && isDefault === undefined)) {
    return NextResponse.json({ error: 'device_id and an update are required' }, { status: 400 })
  }
  if (deviceName !== undefined && (deviceName.length < 1 || deviceName.length > 100)) {
    return NextResponse.json({ error: 'Device name must be between 1 and 100 characters' }, { status: 400 })
  }

  try {
    await updateCloudCaptureDevice(ctx.tenantId, deviceId, { deviceName, isDefault })
    return NextResponse.json({ success: true })
  } catch (error) {
    return failure(error)
  }
}

export async function DELETE(req: Request) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'owner') return NextResponse.json({ error: 'Owner access required' }, { status: 403 })
  const settings = await currentPhotoSettings()
  if (!settings.identity_verification_enabled || settings.photo_capture_mode !== 'mobile') {
    return NextResponse.json({ error: 'Mobile photo capture is not enabled in Settings' }, { status: 403 })
  }

  const limited = await rateLimit(req, {
    scope: 'mobile-capture.devices.remove', limit: 20, windowSeconds: 600,
    identity: `user:${ctx.authId}`,
  })
  if (limited) return limited

  const deviceId = new URL(req.url).searchParams.get('id')?.trim()
  if (!deviceId) return NextResponse.json({ error: 'Device id is required' }, { status: 400 })

  try {
    await removeCloudCaptureDevice(ctx.tenantId, deviceId)
    return NextResponse.json({ success: true })
  } catch (error) {
    return failure(error)
  }
}
