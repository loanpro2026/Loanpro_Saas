/**
 * Device Registration API
 * GET  /api/devices          — list paired devices for current user's tenant
 * POST /api/devices          — register / upsert a device (FCM or Web Push)
 * DELETE /api/devices?id=… — remove a specific device
 */
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/api-security'

// ─── GET — list devices ────────────────────────────────────────────────────
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('paired_devices')
    .select('id, device_name, device_type, last_seen_at, created_at')
    .order('last_seen_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ devices: data })
}

// ─── POST — register / upsert device ──────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await rateLimit(req, {
    scope: 'devices.register', limit: 20, windowSeconds: 600, identity: `user:${user.id}`,
  })
  if (limited) return limited

  const { data: appUser } = await supabase
    .from('users')
    .select('id, tenant_id')
    .eq('auth_id', user.id)
    .single()
  if (!appUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json()
  const { device_name, device_type, fcm_token, push_subscription, local_ip, local_port } = body

  if (!device_type || !['android', 'ios', 'pwa'].includes(device_type)) {
    return NextResponse.json({ error: 'Invalid device_type' }, { status: 400 })
  }
  if (device_type === 'android' && !fcm_token) {
    return NextResponse.json({ error: 'fcm_token required for android' }, { status: 400 })
  }
  if ((device_type === 'ios' || device_type === 'pwa') && !push_subscription) {
    return NextResponse.json({ error: 'push_subscription required for ios/pwa' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('paired_devices')
    .upsert({
      tenant_id:         appUser.tenant_id,
      user_id:           appUser.id,
      device_name:       device_name ?? 'My Phone',
      device_type,
      fcm_token:         fcm_token ?? null,
      push_subscription: push_subscription ?? null,
      local_ip:          local_ip ?? null,
      local_port:        local_port ?? null,
      last_seen_at:      new Date().toISOString(),
    }, { onConflict: 'user_id,device_type' })
    .select('id, device_name, device_type')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ device: data })
}

// ─── DELETE — remove device ────────────────────────────────────────────────
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const deviceId = searchParams.get('id')
  if (!deviceId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await rateLimit(req, {
    scope: 'devices.remove', limit: 20, windowSeconds: 600, identity: `user:${user.id}`,
  })
  if (limited) return limited

  // RLS enforces tenant isolation — delete only matches tenant
  const { error } = await supabase
    .from('paired_devices')
    .delete()
    .eq('id', deviceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
