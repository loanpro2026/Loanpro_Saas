import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Today's date in IST, as YYYY-MM-DD.
 *
 * Use this everywhere instead of `new Date().toISOString().split('T')[0]`.
 * That expression is UTC: between 18:30 and 24:00 UTC it returns *tomorrow's*
 * date for a shop in India, so an evening entry gets filed against the wrong
 * day and disappears from that day's report. The same class of bug bit the
 * dashboard, the deposits page, the cash page and the migration script.
 */
export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
}

export function daysAgoIST(days: number): string {
  return new Date(Date.now() + 5.5 * 3600_000 - days * 86400_000)
    .toISOString().slice(0, 10)
}

export function formatCurrency(amount: number, compact = false): string {
  if (compact && amount >= 100000) {
    return `₹${(amount / 100000).toFixed(1)}L`
  }
  if (compact && amount >= 1000) {
    return `₹${(amount / 1000).toFixed(1)}K`
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...opts,
  })
}

export function formatWeight(weight: number | null | undefined): string {
  if (weight == null) return '—'
  return `${weight.toFixed(3)}g`
}

export function daysBetween(a: string | Date, b: string | Date = new Date()): number {
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  return Math.floor(Math.abs(db - da) / (1000 * 60 * 60 * 24))
}

export type InterestType = 'simple' | 'compound'
export type InterestPeriod = 'yearly' | 'half-yearly' | 'quarterly'

/**
 * Interest on a loan, matching the desktop app exactly.
 *
 * Two things about this that are easy to get wrong, and were:
 *
 *   1. **The rate is annual and shop-wide** (`interest_percentage`, default
 *      36% per year). It is NOT stored per loan. `loans.interest` holds the
 *      interest AMOUNT in rupees, written once when the loan is closed.
 *      Treating 36 as a monthly rate overstates every settlement twelvefold.
 *
 *   2. **365 days per year, not 365.25.** The desktop uses 365, and a shop
 *      reconciling a migrated loan against their old printout needs the same
 *      number more than they need astronomical accuracy.
 *
 * Mirrors `calculate_interest()` in migration 012 — keep them in step. The
 * server value is authoritative; this exists so the closing dialog can update
 * live as the operator edits the date.
 */
export function calculateInterestAmount(
  principal: number,
  annualRatePercent: number,
  days: number,
  type: InterestType = 'simple',
  period: InterestPeriod = 'yearly'
): number {
  const years = Math.max(0, days) / 365
  const rate = annualRatePercent / 100

  if (type === 'compound') {
    const n = period === 'quarterly' ? 4 : period === 'half-yearly' ? 2 : 1
    return Math.round(principal * (Math.pow(1 + rate / n, n * years) - 1))
  }

  return Math.round(principal * rate * years)
}

/** "3 months, 12 days" — how the desktop shows loan duration. */
export function formatDuration(days: number): string {
  const d = Math.max(0, Math.floor(days))
  const months = Math.floor(d / 30)
  const rem = d % 30
  if (months === 0) return `${rem} day${rem === 1 ? '' : 's'}`
  return `${months} month${months === 1 ? '' : 's'}, ${rem} day${rem === 1 ? '' : 's'}`
}

export function getLoanAge(issueDate: string): string {
  const days = daysBetween(issueDate)
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${(days / 365).toFixed(1)}yr`
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()
}

// Convert base64 blob (from MySQL export) to File object
export function base64ToFile(base64: string, filename: string, mimeType = 'image/jpeg'): File {
  const byteString = atob(base64.split(',').slice(-1)[0])
  const ab = new ArrayBuffer(byteString.length)
  const ia = new Uint8Array(ab)
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i)
  }
  return new File([ab], filename, { type: mimeType })
}

// Validate that a value looks like a base64 image
export function isBase64Image(val: string): boolean {
  return typeof val === 'string' && (
    val.startsWith('data:image') ||
    /^[A-Za-z0-9+/]+=*$/.test(val.slice(0, 100))
  )
}
