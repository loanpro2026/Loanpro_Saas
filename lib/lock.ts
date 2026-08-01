/**
 * Screen lock — the web equivalent of the desktop app's app lock.
 *
 * The threat this addresses is narrow and physical: a shop counter machine
 * left unattended for a few minutes with a customer on the other side of it.
 * It is NOT a security boundary against someone with real access to the
 * device — the PIN is stored hashed in localStorage and anyone who can open
 * devtools can clear it.
 *
 * That is the right trade-off here. A real lock would mean re-authenticating
 * with Supabase, which fails when the connection is down — locking a shop out
 * of their own records because the internet dropped would be worse than the
 * problem it solves. The session cookie remains the actual auth boundary; this
 * is a screen cover.
 */

const PIN_KEY = 'loanpro.lock.pin'
const LOCKED_KEY = 'loanpro.lock.state'
const LAST_ACTIVE_KEY = 'loanpro.lock.lastActive'

/**
 * PBKDF2 rather than a bare hash. A four-digit PIN has ten thousand possible
 * values, so a fast hash is brute-forced instantly; 100k iterations makes an
 * offline attack take long enough to be pointless for the value involved.
 */
async function hashPin(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100_000, hash: 'SHA-256' },
    key, 256
  )
  return Array.from(new Uint8Array(bits))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}

function randomSalt(): string {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function setPin(pin: string): Promise<void> {
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error('PIN must be 4 to 8 digits')
  }
  const salt = randomSalt()
  const hash = await hashPin(pin, salt)
  localStorage.setItem(PIN_KEY, JSON.stringify({ salt, hash }))
}

export async function verifyPin(pin: string): Promise<boolean> {
  const raw = localStorage.getItem(PIN_KEY)
  if (!raw) return true                    // no PIN set — nothing to verify

  try {
    const { salt, hash } = JSON.parse(raw)
    return (await hashPin(pin, salt)) === hash
  } catch {
    return false
  }
}

export function hasPin(): boolean {
  return localStorage.getItem(PIN_KEY) !== null
}

export function clearPin(): void {
  localStorage.removeItem(PIN_KEY)
  localStorage.removeItem(LOCKED_KEY)
  localStorage.removeItem(LAST_ACTIVE_KEY)
}

// ─── Lock state ─────────────────────────────────────────────────────────────
// Kept in localStorage so the lock survives a reload and applies across every
// tab. Someone who locks the screen and finds a second tab still open would
// reasonably consider the feature broken.

export function isLocked(): boolean {
  return localStorage.getItem(LOCKED_KEY) === '1'
}

export function lock(): void {
  if (!hasPin()) return
  localStorage.setItem(LOCKED_KEY, '1')
  window.dispatchEvent(new Event('loanpro:lock-changed'))
}

export function unlock(): void {
  localStorage.removeItem(LOCKED_KEY)
  touch()
  window.dispatchEvent(new Event('loanpro:lock-changed'))
}

export function touch(): void {
  localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()))
}

/**
 * Whether the idle timeout has elapsed.
 *
 * Checked on a timer AND on return to the tab, because background timers are
 * throttled or suspended entirely on mobile — a phone in a pocket for an hour
 * would otherwise come back unlocked.
 */
export function shouldLock(timeoutMinutes: number): boolean {
  if (!hasPin() || timeoutMinutes <= 0) return false

  const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) ?? 0)
  if (!last) return false

  return Date.now() - last > timeoutMinutes * 60_000
}
