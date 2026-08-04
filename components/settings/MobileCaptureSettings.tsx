'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, CircleOff, Pencil, QrCode, RefreshCw, Smartphone, Star, Trash2, Wifi } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { userFacingError } from '@/lib/user-message'

interface Device {
  deviceId: string
  deviceName: string
  isDefault: boolean
  pairedAt: string | null
  lastActive: string | null
  online: boolean
}

interface PairingState {
  qrDataUrl: string
  pairingToken: string
  expiresAt: string
  existingDeviceIds: string[]
  existingDeviceActivity: Record<string, string | null>
}

async function responseJson(response: Response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}

export function MobileCaptureSettings({ isOwner }: { isOwner: boolean }) {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [pairing, setPairing] = useState<PairingState | null>(null)
  const [pairingBusy, setPairingBusy] = useState(false)
  const [paired, setPaired] = useState(false)
  const pairingRef = useRef<PairingState | null>(null)

  useEffect(() => { pairingRef.current = pairing }, [pairing])

  const loadDevices = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const response = await fetch('/api/mobile-capture/devices', { cache: 'no-store' })
      const data = await responseJson(response)
      const next = Array.isArray(data.devices) ? data.devices as Device[] : []
      setConfigured(data.configured !== false)
      setDevices(next)

      const currentPairing = pairingRef.current
      if (currentPairing) {
        const known = new Set(currentPairing.existingDeviceIds)
        const connected = next.some(device => {
          if (!known.has(device.deviceId)) return true
          const previous = currentPairing.existingDeviceActivity[device.deviceId]
          return Boolean(device.lastActive && device.lastActive !== previous)
        })
        if (connected) {
          setPaired(true)
          setTimeout(() => {
            setPairing(null)
            setPaired(false)
          }, 1400)
        }
      }
    } catch (error) {
      setConfigured(true)
      if (!quiet) toast.error(userFacingError(
        error,
        'Paired phones could not be loaded. Refresh the page or try again shortly.',
      ))
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => { void loadDevices() }, [loadDevices])

  useEffect(() => {
    if (!pairing) return
    const expiresAt = new Date(pairing.expiresAt).getTime()
    const timer = setInterval(() => {
      if (Date.now() >= expiresAt) {
        setPairing(null)
        toast.error('Pairing QR expired. Create a new one to try again.')
        return
      }
      void loadDevices(true)
    }, 2000)
    return () => clearInterval(timer)
  }, [pairing, loadDevices])

  const startPairing = async () => {
    setPairingBusy(true)
    setPaired(false)
    try {
      const data = await responseJson(await fetch('/api/mobile-capture/pairing', { method: 'POST' }))
      setPairing({
        qrDataUrl: data.qr_data_url,
        pairingToken: data.pairing_token,
        expiresAt: data.expires_at,
        existingDeviceIds: data.existing_device_ids ?? [],
        existingDeviceActivity: data.existing_device_activity ?? {},
      })
    } catch (error) {
      toast.error(userFacingError(
        error,
        'A pairing code could not be created. Check the mobile capture setup and try again.',
      ))
    } finally {
      setPairingBusy(false)
    }
  }

  const updateDevice = async (deviceId: string, patch: Record<string, unknown>) => {
    setWorkingId(deviceId)
    try {
      await responseJson(await fetch('/api/mobile-capture/devices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId, ...patch }),
      }))
      await loadDevices(true)
      toast.success(
        typeof patch.device_name === 'string'
          ? `Phone renamed to “${patch.device_name}”.`
          : patch.is_default === true
            ? 'This phone will now receive photo requests by default.'
            : 'The phone setting was saved.',
      )
    } catch (error) {
      toast.error(userFacingError(
        error,
        'The phone setting could not be saved. Its previous setting is unchanged.',
      ))
    } finally {
      setWorkingId(null)
    }
  }

  const rename = (device: Device) => {
    const name = window.prompt('Phone name', device.deviceName)?.trim()
    if (name && name !== device.deviceName) void updateDevice(device.deviceId, { device_name: name })
  }

  const remove = async (device: Device) => {
    if (!window.confirm(`Remove ${device.deviceName} from this shop?`)) return
    setWorkingId(device.deviceId)
    try {
      await responseJson(await fetch(`/api/mobile-capture/devices?id=${encodeURIComponent(device.deviceId)}`, {
        method: 'DELETE',
      }))
      await loadDevices(true)
      toast.success(`${device.deviceName} was unpaired and will no longer receive photo requests.`)
    } catch (error) {
      toast.error(userFacingError(
        error,
        `${device.deviceName} could not be unpaired. It can still receive photo requests.`,
      ))
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-slate-400" />
          <div>
            <h2 className="card-title">Paired phone capture</h2>
            <p className="text-xs text-slate-500">Cloud Run transfers each capture; R2 remains the permanent photo store.</p>
          </div>
        </div>
        {isOwner && configured !== false && (
          <Button size="sm" variant="secondary" onClick={startPairing} loading={pairingBusy}>
            <QrCode className="h-4 w-4" /> Pair phone
          </Button>
        )}
      </div>

      {configured === false ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Paired-phone capture is not configured on the server yet. Add the two mobile capture environment variables, then restart the app.
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading paired phones…
        </div>
      ) : devices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border px-4 py-5 text-center">
          <CircleOff className="mx-auto h-6 w-6 text-slate-400" />
          <p className="mt-2 text-sm font-medium text-slate-800">No Android phone paired</p>
          <p className="mt-1 text-xs text-slate-500">
            {isOwner ? 'Create a QR code and scan it in the LoanPro Mobile Companion app.' : 'Ask the shop owner to pair a phone.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-surface-border">
          {devices.map(device => (
            <li key={device.deviceId} className="flex flex-wrap items-center gap-3 py-3">
              <span className={`h-2.5 w-2.5 rounded-full ${device.online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-slate-900">{device.deviceName}</p>
                  {device.isDefault && <span className="text-[11px] font-medium text-primary-600">Default</span>}
                </div>
                <p className="text-xs text-slate-500">
                  {device.online ? 'Online now' : device.lastActive ? `Last active ${new Date(device.lastActive).toLocaleString()}` : 'Not seen yet'}
                </p>
              </div>
              {isOwner && (
                <div className="flex items-center gap-1">
                  {!device.isDefault && (
                    <Button size="mini" variant="ghost" disabled={workingId === device.deviceId}
                      onClick={() => void updateDevice(device.deviceId, { is_default: true })}>
                      <Star className="h-3.5 w-3.5" /> Default
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" aria-label={`Rename ${device.deviceName}`}
                    disabled={workingId === device.deviceId} onClick={() => rename(device)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Remove ${device.deviceName}`}
                    disabled={workingId === device.deviceId} onClick={() => void remove(device)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(pairing)}
        onClose={() => setPairing(null)}
        title="Pair an Android phone"
        subtitle="Open LoanPro Mobile Companion, choose Pair Device, and scan this code."
        size="lg"
      >
        <div className="mt-5 space-y-4 text-center">
          {paired ? (
            <div className="py-10">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <p className="mt-3 card-title">Phone connected</p>
            </div>
          ) : pairing ? (
            <>
              <div className="mx-auto w-fit rounded-2xl border border-surface-border bg-white p-3 shadow-sm">
                {/* QR is generated on the authenticated server route, not by a third-party image service. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pairing.qrDataUrl} alt="LoanPro phone pairing QR code" width={280} height={280} />
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                <Wifi className="h-3.5 w-3.5" /> Waiting for the phone to connect…
              </div>
              <p className="text-xs text-slate-400">
                Expires at {new Date(pairing.expiresAt).toLocaleTimeString()}.
              </p>
            </>
          ) : null}
        </div>
      </Modal>
    </section>
  )
}
