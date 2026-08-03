import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/api-security'

async function authenticatedClient() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { supabase, user, authenticated: !error && !!user }
}

export async function GET() {
  const { supabase, authenticated } = await authenticatedClient()
  if (!authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.rpc('my_access_devices')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ devices: data ?? [] })
}

export async function PATCH(req: Request) {
  const { supabase, user, authenticated } = await authenticatedClient()
  if (!authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await rateLimit(req, {
    scope: 'access_devices.rename', limit: 30, windowSeconds: 600, identity: `user:${user!.id}`,
  })
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const deviceId = String(body?.device_id ?? '')
  const name = String(body?.name ?? '').trim()
  if (!deviceId || !name) {
    return NextResponse.json({ error: 'Device and name are required' }, { status: 400 })
  }

  const { error } = await supabase.rpc('rename_access_device', {
    p_device_id: deviceId,
    p_name: name,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: Request) {
  const { supabase, user, authenticated } = await authenticatedClient()
  if (!authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await rateLimit(req, {
    scope: 'access_devices.revoke', limit: 30, windowSeconds: 600, identity: `user:${user!.id}`,
  })
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const action = String(body?.action ?? 'device')

  if (action === 'others') {
    const { data, error } = await supabase.rpc('revoke_other_access_devices')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, revoked: data ?? 0 })
  }

  if (action === 'all') {
    const { data, error } = await supabase.rpc('revoke_all_access_devices')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, revoked: data ?? 0, current_revoked: true })
  }

  const deviceId = String(body?.device_id ?? '')
  if (!deviceId) return NextResponse.json({ error: 'Device is required' }, { status: 400 })

  const { data, error } = await supabase.rpc('revoke_access_device', { p_device_id: deviceId })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, current_revoked: data === true })
}
