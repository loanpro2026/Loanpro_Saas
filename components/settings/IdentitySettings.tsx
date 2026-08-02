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
      if (res.ok) router.refresh()
      else {
        setLocal(s => ({ ...s, [key]: settings[key] }))
        toast.error(res.error ?? 'Could not save')
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
          <h2 className="text-sm font-semibold text-slate-900">Customer identity</h2>
        </div>

        <Toggle
          label="Capture customer photos"
          description="Master switch. With this off, the photo section disappears from the loan screens entirely."
          checked={idOn}
          disabled={pending}
          onChange={v => save('identity_verification_enabled', v)}
        />

        <div className={idOn ? 'space-y-4 pl-1' : 'space-y-4 pl-1 opacity-40 pointer-events-none'}>
          <Toggle
            label="Require a photo before a loan can be saved"
            description="The new loan form will not submit without one."
            checked={local.identity_mandatory_at_creation}
            disabled={pending || !idOn}
            onChange={v => save('identity_mandatory_at_creation', v)}
          />
          <Toggle
            label="Require a photo before a loan can be closed"
            description="Blocks handing jewellery back to someone with no photo on file. Enforced on the server, so it cannot be worked around."
            checked={local.identity_mandatory_at_closure}
            disabled={pending || !idOn}
            onChange={v => save('identity_mandatory_at_closure', v)}
          />
          {/* One three-way choice rather than two booleans. The old pair could
              express "a photo is required" together with "there is no way to
              take one", which the settings screen happily allowed. */}
          <div className="space-y-1.5">
            <Select
              label="Where photos are taken"
              value={local.photo_capture_mode}
              disabled={pending || !idOn}
              onChange={e =>
                save('photo_capture_mode', e.target.value as ShopSettings['photo_capture_mode'])
              }
              options={[
                { value: 'webcam', label: 'Camera on this computer' },
                { value: 'phone',  label: 'Paired phone' },
                { value: 'off',    label: 'Do not capture photos' },
              ]}
            />
            <p className="text-xs text-slate-500">
              {local.photo_capture_mode === 'webcam'
                ? 'Uses the webcam on the machine you are working at. Nothing to set up.'
                : local.photo_capture_mode === 'phone'
                ? 'Sends a capture request to a paired phone. Better photos, but the phone must be paired first.'
                : 'Loans are saved with their details only. The two requirements above are ignored while this is off.'}
            </p>
          </div>

          <Toggle
            label="Allow more than one paired phone"
            description="Useful if two people work the counter."
            checked={local.identity_allow_multiple_mobile_devices}
            disabled={pending || !idOn || local.photo_capture_mode !== 'phone'}
            onChange={v => save('identity_allow_multiple_mobile_devices', v)}
          />
        </div>
      </section>

      {/* ── Interest ────────────────────────────────────────────────────── */}
      <section className="card space-y-4">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-slate-400 opacity-0" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">Interest</h2>
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
              { value: 'yearly', label: 'Yearly' },
              { value: 'half-yearly', label: 'Half-yearly' },
              { value: 'quarterly', label: 'Quarterly' },
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
          <h2 className="text-sm font-semibold text-slate-900">Fields on the loan form</h2>
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
