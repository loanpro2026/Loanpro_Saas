'use client'
/**
 * Set, change or remove the screen-lock PIN.
 *
 * The PIN lives on this device only. That is stated plainly, because a shop
 * owner who sets it on the counter machine and then finds their phone
 * unlocked would otherwise assume it is broken. It is a screen cover for an
 * unattended counter, not an account password.
 */
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Lock, LockOpen, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { setPin, verifyPin, hasPin, clearPin, lock } from '@/lib/lock'

export function PinSettings({ timeoutMinutes }: { timeoutMinutes: number }) {
  const [isSet, setIsSet] = useState(false)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'set' | 'remove'>('set')

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  // localStorage is not available during SSR, so read it after mount.
  useEffect(() => { setIsSet(hasPin()) }, [])

  const reset = () => { setCurrent(''); setNext(''); setConfirm('') }

  const onSave = async () => {
    setBusy(true)
    try {
      if (isSet && !(await verifyPin(current))) {
        toast.error('The current device PIN is incorrect. The screen-lock setting was not changed.'); return
      }
      if (next !== confirm) {
        toast.error('The new PIN and confirmation do not match. The existing PIN is unchanged.'); return
      }
      await setPin(next)
      setIsSet(true)
      setOpen(false)
      reset()
      toast.success('Screen-lock PIN saved on this device only.')
    } catch (e: any) {
      toast.error(`The screen-lock PIN was not saved. ${e?.message ?? 'The previous device PIN remains active.'}`)
    } finally {
      setBusy(false)
    }
  }

  const onRemove = async () => {
    setBusy(true)
    try {
      if (!(await verifyPin(current))) { toast.error('The device PIN is incorrect, so the screen lock was not removed.'); return }
      clearPin()
      setIsSet(false)
      setOpen(false)
      reset()
      toast.success('Screen-lock PIN removed from this device; other devices are unchanged.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-900">Screen PIN</p>
          <p className="text-xs text-slate-500">
            {isSet
              ? timeoutMinutes > 0
                ? `Set. Locks after ${timeoutMinutes} minutes of inactivity.`
                : 'Set, but the lock timeout above is “Never” — it will only lock when you tap Lock now.'
              : 'Not set. Anyone at this machine can see your records.'}
          </p>
        </div>

        <div className="flex gap-2 shrink-0">
          {isSet && (
            <Button size="sm" variant="ghost" onClick={() => lock()}>
              <Lock className="h-4 w-4" /> Lock now
            </Button>
          )}
          <Button
            size="sm" variant="secondary"
            onClick={() => { setMode('set'); reset(); setOpen(true) }}
          >
            {isSet ? 'Change' : 'Set PIN'}
          </Button>
          {isSet && (
            <Button
              size="sm" variant="ghost"
              onClick={() => { setMode('remove'); reset(); setOpen(true) }}
            >
              <LockOpen className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        The PIN is stored on this device only — set it separately on each machine
        or phone you use. It covers the screen; it does not sign you out.
      </p>

      <Modal
        open={open}
        onClose={() => { setOpen(false); reset() }}
        title={mode === 'remove' ? 'Remove the PIN' : isSet ? 'Change PIN' : 'Set a PIN'}
        size="sm"
      >
        <div className="space-y-4">
          {mode === 'set' && !isSet && (
            <p className="flex items-start gap-2 text-xs text-slate-600 bg-surface-muted rounded-lg px-3 py-2">
              <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Useful on a counter machine a customer can see. If you forget it,
              sign out and back in on this device to clear it.
            </p>
          )}

          {isSet && (
            <Input
              label="Current PIN" type="password" inputMode="numeric"
              autoFocus maxLength={8}
              value={current} onChange={e => setCurrent(e.target.value.replace(/\D/g, ''))}
            />
          )}

          {mode === 'set' && (
            <>
              <Input
                label="New PIN" type="password" inputMode="numeric"
                maxLength={8} autoFocus={!isSet}
                value={next} onChange={e => setNext(e.target.value.replace(/\D/g, ''))}
                helper="4 to 8 digits"
              />
              <Input
                label="Confirm PIN" type="password" inputMode="numeric" maxLength={8}
                value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g, ''))}
                error={confirm && next !== confirm ? 'PINs do not match' : undefined}
              />
            </>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { setOpen(false); reset() }}>
              Cancel
            </Button>
            {mode === 'remove' ? (
              <Button variant="danger" onClick={onRemove} loading={busy} disabled={!current}>
                Remove PIN
              </Button>
            ) : (
              <Button
                onClick={onSave} loading={busy}
                disabled={next.length < 4 || next !== confirm || (isSet && !current)}
              >
                Save PIN
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}
