/**
 * Shop settings — the desktop app's general-settings set, ported.
 *
 * Source: electron_app/backend/settingsManager.js DEFAULT_SETTINGS.
 *
 * The defaults here must match the desktop's exactly. A shop that migrates
 * and finds the address field suddenly visible, or interest calculated
 * differently, will reasonably conclude the migration went wrong — even
 * though every record moved across correctly.
 */
import { asObject } from '@/lib/json'
import type { Json } from '@/types/supabase'

export interface ShopSettings {
  // Display
  theme: 'light' | 'dark'
  date_display_format: 'dd/mm/yyyy' | 'mm/dd/yyyy' | 'yyyy-mm-dd'
  language: string

  /** Annual percentage, applied shop-wide. NOT stored per loan. */
  interest_percentage: number
  interest_calculation_type: 'simple' | 'compound'
  interest_calculation_period: 'yearly' | 'half-yearly' | 'quarterly'

  // Identity verification
  identity_verification_enabled: boolean
  identity_mandatory_at_creation: boolean
  identity_mandatory_at_closure: boolean
  identity_allow_multiple_mobile_devices: boolean

  /**
   * Where the identity photo is taken.
   *
   *   automatic  mobile camera directly; desktop paired-phone relay
   *   off     no identity photos at all — record fields only
   *
   * Replaces the old identity_allow_mobile_capture boolean. As two booleans,
   * "verification on" plus "mobile capture off" described a shop that requires
   * a photo it has no way to take.
   */
  photo_capture_mode: 'automatic' | 'off'

  // Optional fields on the add-record form. Both OFF by default, as on the
  // desktop — most shops do not collect an address for a pawn loan.
  add_record_address_field_enabled: boolean
  add_record_additional_information_field_enabled: boolean

  // Misc
  dashboard_division_factor: number
  lock_after_minutes: number
  default_category: 'Gold' | 'Silver'
}

/** Mirrors default_settings() in migration 012. */
export const DEFAULT_SETTINGS: ShopSettings = {
  theme: 'light',
  date_display_format: 'dd/mm/yyyy',
  language: 'en',

  interest_percentage: 36,
  interest_calculation_type: 'simple',
  interest_calculation_period: 'yearly',

  identity_verification_enabled: true,
  identity_mandatory_at_creation: true,
  identity_mandatory_at_closure: true,
  identity_allow_multiple_mobile_devices: false,

  photo_capture_mode: 'automatic',

  add_record_address_field_enabled: false,
  add_record_additional_information_field_enabled: false,

  dashboard_division_factor: 1,
  lock_after_minutes: 0,
  // Silver, matching the desktop's hardcoded form default. See migration 021.
  default_category: 'Silver',
}

/**
 * Keys the client may write. Anything outside this list is rejected server-side
 * rather than letting tenant_settings become an untyped dumping ground.
 */
export const WRITABLE_SETTINGS = Object.keys(DEFAULT_SETTINGS) as Array<keyof ShopSettings>

/**
 * Fill in anything missing so callers never have to guess a default.
 *
 * Accepts a raw `Json` because that is what `my_settings()` returns — it is
 * declared `RETURNS jsonb`, so its generated type is the whole Json union.
 * asObject() narrows it with a runtime check, which also means a null result
 * (a tenant whose settings row has not been seeded yet) yields the defaults
 * rather than throwing.
 */
export function withDefaults(
  raw: Json | Record<string, unknown> | null | undefined
): ShopSettings {
  const merged = { ...DEFAULT_SETTINGS, ...asObject(raw as Json) } as Record<string, unknown>
  // Smooth rolling deployment: application code may reach a project just
  // before migration 025 converts the legacy values.
  if (merged.photo_capture_mode === 'webcam' || merged.photo_capture_mode === 'phone') {
    merged.photo_capture_mode = 'automatic'
  }
  return merged as unknown as ShopSettings
}

/**
 * Whether a photo is required before a loan can be saved or closed.
 *
 * `identity_verification_enabled` is the master switch — the "mandatory"
 * flags mean nothing when the whole feature is off, and the desktop treats
 * them the same way (`captureFeatureEnabled = identityEnabled && ...`).
 */
export function photoRequiredAtCreation(s: ShopSettings): boolean {
  return photoCaptureEnabled(s) && s.identity_mandatory_at_creation
}

export function photoRequiredAtClosure(s: ShopSettings): boolean {
  return photoCaptureEnabled(s) && s.identity_mandatory_at_closure
}

export function photoCaptureEnabled(s: ShopSettings): boolean {
  return s.identity_verification_enabled && s.photo_capture_mode !== 'off'
}

/**
 * Date formatting per the shop's preference.
 *
 * Indian shops overwhelmingly read dd/mm/yyyy, and a printed report showing
 * 03/01/2026 for the 1st of March would be misread as 3rd January.
 */
export function formatDateSetting(
  date: string | Date,
  format: ShopSettings['date_display_format'] = 'dd/mm/yyyy'
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return '—'

  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()

  switch (format) {
    case 'mm/dd/yyyy': return `${mm}/${dd}/${yyyy}`
    case 'yyyy-mm-dd': return `${yyyy}-${mm}-${dd}`
    default:           return `${dd}/${mm}/${yyyy}`
  }
}

/**
 * The desktop's `dashboardDivisionFactor`: divides headline figures for
 * display, so a shop working in lakhs can read 4.5 rather than 450000.
 * A factor of 1 (the default) means no change.
 */
export function applyDivisionFactor(value: number, factor: number): number {
  if (!factor || factor <= 1) return value
  return value / factor
}
