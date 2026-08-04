import { NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { rateLimit } from '@/lib/api-security'
import { getSessionContext } from '@/lib/tenant'
import {
  cloudPairingQrPayload,
  createCloudPairingSession,
  listCloudCaptureDevices,
  MobileCaptureError,
} from '@/lib/mobile-capture'

function failure(error: unknown) {
  const status = error instanceof MobileCaptureError ? error.status : 500
  const message = error instanceof Error ? error.message : 'Could not start phone pairing.'
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: Request) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'owner') return NextResponse.json({ error: 'Owner access required' }, { status: 403 })

  const limited = await rateLimit(req, {
    scope: 'mobile-capture.pair', limit: 10, windowSeconds: 600,
    identity: `user:${ctx.authId}`,
  })
  if (limited) return limited

  try {
    const existing = await listCloudCaptureDevices(ctx.tenantId)
    const session = await createCloudPairingSession(ctx.tenantId)
    const rawPayload = cloudPairingQrPayload(ctx.tenantId, session.pairingToken)
    const qrDataUrl = await QRCode.toDataURL(rawPayload, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'M',
    })

    return NextResponse.json({
      qr_data_url: qrDataUrl,
      pairing_token: session.pairingToken,
      expires_at: session.expiresAt,
      existing_device_ids: existing.map(device => device.deviceId),
      existing_device_activity: Object.fromEntries(
        existing.map(device => [device.deviceId, device.lastActive]),
      ),
    }, { headers: { 'Cache-Control': 'no-store, private' } })
  } catch (error) {
    return failure(error)
  }
}
