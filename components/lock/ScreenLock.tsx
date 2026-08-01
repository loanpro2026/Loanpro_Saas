'use client'
/**
 * The lock overlay and its idle timer.
 *
 * Renders over the app rather than redirecting, so nothing in progress is
 * lost — a half-filled loan form is still there after unlocking.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Lock, Delete } from 'lucide-react'
import {
  isLocked, lock, unlock, verifyPin, hasPin, touch, shouldLock,
} from '@/lib/lock'

interface Props {
  timeoutMinutes: number
  shopName: string
}

export function ScreenLock({ timeoutMinutes, shopName }: Props) {
  const [locked, setLocked] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)
  const attempts = useRef(0)

  // Sync with other tabs and with lock()/unlock() called elsewhere.
  useEffect(() => {
    const sync = () => setLocked(isLocked())
    sync()
    window.addEventListener('loanpro:lock-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('loanpro:lock-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  // Idle detection.
  useEffect(() => {
    if (!hasPin() || timeoutMinutes <= 0) return

    const onActivity = () => { if (!isLocked()) touch() }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart']
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }))

    const check = () => { if (shouldLock(timeoutMinutes)) { lock(); setLocked(true) } }

    // Both a timer and a visibility check: mobile browsers throttle or suspend
    // background timers, so a phone in a pocket would come back unlocked.
    const timer = setInterval(check, 15_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
      else if (!isLocked()) touch()
    }
    document.addEventListener('visibilitychange', onVisible)

    touch()

    return () => {
      events.forEach(e => window.removeEventListener(e, onActivity))
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [timeoutMinutes])

  const submit = useCallback(async (value: string) => {
    setChecking(true)
    const ok = await verifyPin(value)
    setChecking(false)

    if (ok) {
      attempts.current = 0
      setPin(''); setError(false)
      unlock(); setLocked(false)
    } else {
      attempts.current++
      setError(true)
      setPin('')
      // No lockout after N attempts. This guards against a customer leaning
      // over the counter, not a determined attacker — and locking the shop out
      // of their own till during business hours would be a worse outcome.
      setTimeout(() => setError(false), 1200)
    }
  }, [])

  const press = (d: string) => {
    if (checking) return
    const next = pin + d
    setPin(next)
    if (next.length >= 4) void submit(next)
  }

  useEffect(() => {
    if (!locked) return
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') setPin(p => p.slice(0, -1))
      else if (e.key === 'Enter' && pin.length >= 4) void submit(pin)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!locked) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-primary-950/95 backdrop-blur-md flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Screen locked"
    >
      <div className="w-full max-w-xs text-center">
        <span className="mx-auto h-14 w-14 rounded-2xl bg-white/10 flex items-center justify-center">
          <Lock className="h-6 w-6 text-white" />
        </span>

        <h1 className="mt-4 text-lg font-semibold text-white">{shopName}</h1>
        <p className="text-sm text-white/60">Enter your PIN to continue</p>

        {/* Dots */}
        <div className={`flex justify-center gap-3 my-7 ${error ? 'animate-shake' : ''}`}>
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full transition-colors ${
                error ? 'bg-red-400'
                  : i < pin.length ? 'bg-white' : 'bg-white/25'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-300 -mt-4 mb-4">Wrong PIN — try again</p>
        )}

        {/* Keypad. Large targets: this gets tapped with the side of a thumb
            while the other hand is holding a customer's jewellery. */}
        <div className="grid grid-cols-3 gap-3">
          {['1','2','3','4','5','6','7','8','9'].map(d => (
            <button
              key={d}
              onClick={() => press(d)}
              className="h-16 rounded-2xl bg-white/10 text-2xl font-medium text-white hover:bg-white/20 active:scale-95 transition-all"
            >
              {d}
            </button>
          ))}
          <span />
          <button
            onClick={() => press('0')}
            className="h-16 rounded-2xl bg-white/10 text-2xl font-medium text-white hover:bg-white/20 active:scale-95 transition-all"
          >
            0
          </button>
          <button
            onClick={() => setPin(p => p.slice(0, -1))}
            className="h-16 rounded-2xl text-white/70 hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center"
            aria-label="Delete"
          >
            <Delete className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-6 text-xs text-white/40">
          Forgotten it? Sign out and back in from another device to clear the PIN.
        </p>
      </div>
    </div>
  )
}
