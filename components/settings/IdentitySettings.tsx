'use client'
/**
 * Identity verification and add-record field settings, ported from the
 * desktop's General Settings screen.
 *
 * These are compliance controls, not preferences — a shop uses "photo
 * mandatory at closure" as proof of who collected the jewellery. So the
 * wording explains what each one actually prevents, rather than just naming
 * the toggle.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ShieldCheck, Camera, FormInput } from 'lucide-react'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { saveSetting } from '@/app/(app)/settings/actions'
import type { ShopSettings } from '@/lib/settings'
import { userFacingError } from '@/lib/user-message'

function settingNotice(key: keyof ShopSettings, value: unknown): string {
  switch (key) {
    case 'identity_verification_enabled':
      return value ? 'Customer photo capture is now available.' : 'Customer photo capture is now hidden and blocked.'
    case 'identity_mandatory_at_creation':
      return value ? 'New loans now require a customer photo.' : 'New loans can now be saved without a photo.'
    case 'identity_mandatory_at_closure':
      return value ? 'Settling a loan now requires a new collection photo.' : 'Settled loans will keep the original pledge photo.'
    case 'photo_capture_mode':
      return value === 'mobile' ? 'Photos will now be requested from the paired phone.' : 'Photos will now use this device’s camera.'
    case 'interest_percentage':
      return `The suggested annual interest rate is now ${value}%.`
    case 'interest_calculation_type':
      return `Interest will now be calculated using the ${value} method.`
    case 'interest_calculation_period':
      return `Compound interest will now be calculated ${value}.`
    case 'add_record_address_field_enabled':
      return value ? 'The address field is now shown on loan records.' : 'The address field is now hidden from loan records.'
    case 'add_record_additional_information_field_enabled':
      return value ? 'Additional information is now shown on loan records.' : 'Additional information is now hidden from loan records.'
    case 'default_category':
      return `${value} is now selected by default for new loans.`
    case 'date_display_format':
      return `Dates will now be displayed as ${value}.`
    default:
      return 'The setting was saved.'
  }
}

export function IdentitySettings({ settings }: { settings: ShopSettings }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [local, setLocal] = useState(settings)

  const save = (key: keyof ShopSettings, value: unknown) => {
    // Optimistic: these are toggles, and waiting for a round trip before the
    // switch moves makes the whole page feel broken on a slow connection.
    setLocal(s => ({ ...s, [key]: value }))
    startTransition(async () => {
      const res = await saveSetting(key, value)
      if (res.ok) {
        toast.success(settingNotice(key, value))
        router.refresh()
      }
      else {
        setLocal(s => ({ ...s, [key]: settings[key] }))
        toast.error(userFacingError(
          res.error,
          'This setting could not be saved. The previous choice is still active.',
        ))
      }
    })
  }

  const idOn = local.identity_verification_enabled

  return (
    <>
      {/* ── Identity ────────────────────────────────────────────────────── */}
      <section className="card space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-slate-400" />
          <h2 className="card-title">Customer identity</h2>
        </div>

        <Toggle
          label="Enable customer photo capture"
          description="Master switch. Turning this off hides photo controls and blocks photo APIs; existing stored photos are preserved but hidden."
          checked={idOn}
          disabled={pending}
          onChange={v => save('identity_verification_enabled', v)}
        />

        {idOn && <div className="space-y-4 pl-1">
          <Toggle
            label="Require a photo before a loan can be saved"
            description="The new loan form will not submit without one."
            checked={local.identity_mandatory_at_creation}
            disabled={pending || !idOn}
            onChange={v => save('identity_mandatory_at_creation', v)}
          />
          <Toggle
            label="Take a new photo when closing a loan"
            description="When on, settlement requires a new collection photo and retires the original pledge photo. When off, the original pledge photo remains the source of truth."
            checked={local.identity_mandatory_at_closure}
            disabled={pending || !idOn}
            onChange={v => save('identity_mandatory_at_closure', v)}
          />
          {/* One source choice rather than two booleans. The old pair could
              express "a photo is required" together with "there is no way to
              take one", which the settings screen happily allowed. */}
          <div className="space-y-1.5">
            <Select
              label="Camera source"
              value={local.photo_capture_mode}
              disabled={pending || !idOn}
              onChange={e =>
                save('photo_capture_mode', e.target.value as ShopSettings['photo_capture_mode'])
              }
              options={[
                { value: 'local', label: 'Local camera on this device' },
                { value: 'mobile', label: 'Paired Android phone' },
              ]}
            />
            <p className="text-xs text-slate-500">
              {local.photo_capture_mode === 'local'
                ? 'Uses the camera attached to the browser device. File upload remains available as a fallback.'
                : 'On desktop, sends capture requests to the paired Android companion through Cloud Run. On a phone, its own camera is used directly.'}
            </p>
          </div>
        </div>}
      </section>

      {/* ── Interest ────────────────────────────────────────────────────── */}
      <section className="card space-y-4">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-slate-400 opacity-0" aria-hidden />
          <h2 className="card-title">Interest</h2>
        </div>

        <p className="text-xs text-slate-500 -mt-2">
          One rate for the whole shop, applied when a loan is closed. The figure
          is always editable at closing — this only sets what is suggested.
        </p>

        <div className="grid sm:grid-cols-3 gap-4">
          <Input
            label="Rate (% per year)"
            type="number" step="0.5" min={0} max={500}
            defaultValue={String(local.interest_percentage)}
            onBlur={e => {
              const v = Number(e.target.value)
              if (Number.isFinite(v) && v !== local.interest_percentage) {
                save('interest_percentage', v)
              }
            }}
            helper="Per year, not per month"
          />
          <Select
            label="Type"
            value={local.interest_calculation_type}
            onChange={e => save('interest_calculation_type', e.target.value)}
            options={[
              { value: 'simple', label: 'Simple' },
              { value: 'compound', label: 'Compound' },
            ]}
          />
          <Select
            label="Compounding"
            value={local.interest_calculation_period}
            disabled={local.interest_calculation_type !== 'compound'}
            onChange={e => save('interest_calculation_period', e.target.value)}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'quarterly', label: 'Quarterly' },
              { value: 'half-yearly', label: 'Half-yearly' },
              { value: 'yearly', label: 'Yearly' },
            ]}
          />
        </div>

        <p className="text-xs text-slate-400">
          At {local.interest_percentage}% per year, a ₹45,000 loan held six
          months comes to roughly{' '}
          <strong className="text-slate-600">
            ₹{Math.round(45000 * (local.interest_percentage / 100) * (182 / 365)).toLocaleString('en-IN')}
          </strong>{' '}
          in interest.
        </p>
      </section>

      {/* ── Form fields ─────────────────────────────────────────────────── */}
      <section className="card space-y-4">
        <div className="flex items-center gap-2">
          <FormInput className="h-4 w-4 text-slate-400" />
          <h2 className="card-title">Fields on the loan form</h2>
        </div>

        <Toggle
          label="Address"
          description="Off by default — most shops do not collect an address for a pawn loan."
          checked={local.add_record_address_field_enabled}
          disabled={pending}
          onChange={v => save('add_record_address_field_enabled', v)}
        />
        <Toggle
          label="Additional information"
          description="A free-text notes box on the customer section."
          checked={local.add_record_additional_information_field_enabled}
          disabled={pending}
          onChange={v => save('add_record_additional_information_field_enabled', v)}
        />

        <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-surface-border">
          <Select
            label="Default metal"
            value={local.default_category}
            onChange={e => save('default_category', e.target.value)}
            options={[
              { value: 'Gold', label: 'Gold' },
              { value: 'Silver', label: 'Silver' },
            ]}
          />
          <Select
            label="Date format"
            value={local.date_display_format}
            onChange={e => save('date_display_format', e.target.value)}
            options={[
              { value: 'yyyy/mm/dd', label: 'yyyy/mm/dd - 2026/03/01' },
              { value: 'dd/mm/yyyy', label: 'dd/mm/yyyy — 01/03/2026' },
              { value: 'mm/dd/yyyy', label: 'mm/dd/yyyy — 03/01/2026' },
              { value: 'yyyy-mm-dd', label: 'yyyy-mm-dd — 2026-03-01' },
            ]}
          />
        </div>
      </section>
    </>
  )
}

function Toggle({
  label, description, checked, disabled, onChange,
}: {
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
          checked ? 'bg-primary-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4.5' : 'translate-x-0.5'
          }`}
          style={{ transform: `translateX(${checked ? 18 : 2}px)` }}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm text-slate-900">{label}</span>
        {description && (
          <span className="block text-xs text-slate-500 mt-0.5">{description}</span>
        )}
      </span>
    </label>
  )
}
