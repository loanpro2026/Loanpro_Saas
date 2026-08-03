'use client'

import { useCallback, useEffect, useState } from 'react'
import { Laptop, Pencil, RefreshCw, ShieldCheck, Smartphone, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

interface AccessDevice {
  id: string
  display_name: string
  user_agent: string
  first_seen_at: string
  last_seen_at: string
  revoked_at: string | null
  is_current: boolean
}

function seenAt(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

export function AccessDevices({ recovery = false }: { recovery?: boolean }) {
  const [devices, setDevices] = useState<AccessDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/access-devices', { cache: 'no-store' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) toast.error(`Signed-in devices could not be loaded. ${body.error ?? 'Your current session remains active.'}`)
    else setDevices(body.devices ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const request = async (method: 'PATCH' | 'DELETE', body: Record<string, string>) => {
    setBusy(body.device_id ?? body.action ?? 'request')
    const res = await fetch('/api/access-devices', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { toast.error(`Device access was not changed. ${result.error ?? 'Existing sessions remain active.'}`); return null }
    return result
  }

  const rename = async (deviceId: string) => {
    if (!name.trim()) return
    const result = await request('PATCH', { device_id: deviceId, name: name.trim() })
    if (!result) return
    setEditing(null)
    toast.success(`Device renamed to “${name.trim()}”.`)
    await load()
  }

  const revoke = async (device: AccessDevice) => {
    if (!window.confirm(`Sign out ${device.display_name}?`)) return
    const result = await request('DELETE', { action: 'device', device_id: device.id })
    if (!result) return
    if (result.current_revoked) {
      await createClient().auth.signOut({ scope: 'local' })
      window.location.assign('/login?message=This device has been signed out')
      return
    }
    toast.success(`${device.display_name} was signed out; its next request will be denied.`)
    await load()
  }

  const revokeOthers = async () => {
    if (!window.confirm('Sign out every other device? This device will stay signed in.')) return
    const result = await request('DELETE', { action: 'others' })
    if (!result) return
    // Invalidate the remote Supabase sessions as well as our application sessions.
    await createClient().auth.signOut({ scope: 'others' })
    toast.success(`${result.revoked ?? 0} other device session${result.revoked === 1 ? '' : 's'} signed out. This device remains active.`)
    await load()
  }

  const revokeAll = async () => {
    if (!window.confirm('Sign out every device, including this one?')) return
    const result = await request('DELETE', { action: 'all' })
    if (!result) return
    await createClient().auth.signOut({ scope: 'global' })
    window.location.assign('/login?message=All devices have been signed out')
  }

  const active = devices.filter(device => !device.revoked_at)
  const history = devices.filter(device => device.revoked_at)

  return (
    <section className={recovery ? 'space-y-4' : 'card space-y-4'}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-slate-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Signed-in devices</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Use LoanPro on all your devices. Device limits are not enforced during testing.
            </p>
          </div>
        </div>
        <button className="btn-icon" onClick={() => void load()} aria-label="Refresh devices">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && devices.length === 0 ? (
        <p className="text-sm text-slate-500">Loading devices…</p>
      ) : active.length === 0 ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">No active device was found.</p>
      ) : (
        <ul className="divide-y divide-surface-border">
          {active.map(device => {
            const mobile = /Mobile|Android|iPhone|iPad/i.test(device.user_agent)
            return (
              <li key={device.id} className="flex items-center gap-3 py-3">
                {mobile ? <Smartphone className="h-5 w-5 text-slate-400" /> : <Laptop className="h-5 w-5 text-slate-400" />}
                <div className="min-w-0 flex-1">
                  {editing === device.id ? (
                    <div className="flex max-w-sm gap-2">
                      <input className="input py-1.5" value={name} onChange={event => setName(event.target.value)} maxLength={80} autoFocus />
                      <Button size="sm" loading={busy === device.id} onClick={() => void rename(device.id)}>Save</Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditing(null)} aria-label="Cancel"><X className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">{device.display_name}</p>
                      {device.is_current && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">This device</span>}
                    </div>
                  )}
                  <p className="mt-0.5 text-xs text-slate-500">Last used {seenAt(device.last_seen_at)}</p>
                </div>
                {editing !== device.id && (
                  <>
                    <button className="btn-icon" onClick={() => { setEditing(device.id); setName(device.display_name) }} aria-label={`Rename ${device.display_name}`}><Pencil className="h-4 w-4" /></button>
                    <Button size="sm" variant="ghost" loading={busy === device.id} onClick={() => void revoke(device)}>Sign out</Button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!recovery && (
        <div className="flex flex-wrap gap-2">
          {active.length > 1 && (
            <Button variant="secondary" size="sm" loading={busy === 'others'} onClick={() => void revokeOthers()}>
              Sign out all other devices
            </Button>
          )}
          <Button variant="ghost" size="sm" loading={busy === 'all'} onClick={() => void revokeAll()}>
            Sign out all devices
          </Button>
        </div>
      )}

      {history.length > 0 && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer select-none">Signed-out history ({history.length})</summary>
          <ul className="mt-2 space-y-1">
            {history.map(device => <li key={device.id}>{device.display_name} · {seenAt(device.revoked_at!)}</li>)}
          </ul>
        </details>
      )}
    </section>
  )
}
