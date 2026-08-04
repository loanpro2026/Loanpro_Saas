'use client'
/**
 * Settings: shop details, people, preferences, plan.
 *
 * Staff invitations show the link rather than promising an email. There is no
 * transactional email configured yet, and a UI that says "invitation sent"
 * when nothing was sent is worse than one that hands the owner a link to pass
 * on themselves.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  Store, Users, CreditCard, UserPlus, Trash2, Copy, Check, Lock,
  SlidersHorizontal, ShieldCheck, Database,
} from 'lucide-react'
import { PinSettings } from '@/components/settings/PinSettings'
import { IdentitySettings } from '@/components/settings/IdentitySettings'
import { DataExport } from '@/components/settings/DataExport'
import { AccessDevices } from '@/components/settings/AccessDevices'
import { AppearanceSettings } from '@/components/settings/AppearanceSettings'
import { MobileCaptureSettings } from '@/components/settings/MobileCaptureSettings'
import type { ShopSettings } from '@/lib/settings'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import {
  updateShopName, updateMyName, inviteStaff, revokeStaff, saveSetting,
} from '@/app/(app)/settings/actions'
import { userFacingError } from '@/lib/user-message'

interface Member {
  id: string
  full_name: string
  email: string
  role: string
  created_at: string
  is_me: boolean
}

interface Props {
  me: { id: string; full_name: string; email: string; role: string }
  shopName: string
  plan: Record<string, unknown>
  members: Member[]
  settings: ShopSettings
  staffAccessEnabled?: boolean
}

export function SettingsWorkspace({ me, shopName, plan, members, settings, staffAccessEnabled = false }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [shop, setShop] = useState(shopName)
  const [myName, setMyName] = useState(me.full_name)

  const [inviting, setInviting] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'owner' | 'staff'>('staff')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'business' | 'preferences' | 'security' | 'data'>('business')

  const isOwner = me.role === 'owner'
  const planName = String(plan.plan ?? 'trial')
  const active = Boolean(plan.active)
  const trialDays = plan.trial_days_left as number | null
  const staffLimit = Number(plan.staff_limit ?? 2)

  const save = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    successMessage: string,
    failureMessage = 'The change could not be saved. The previous setting is still active.',
  ) =>
    startTransition(async () => {
      const res = await fn()
      if (res.ok) { toast.success(successMessage); router.refresh() }
      else toast.error(userFacingError(res.error, failureMessage))
    })

  const onInvite = () => startTransition(async () => {
    const res = await inviteStaff(inviteEmail, inviteRole)
    if (!res.ok) {
      toast.error(userFacingError(
        res.error,
        `The invitation for ${inviteEmail} could not be created. No access was granted.`,
      ))
      return
    }

    const url = `${window.location.origin}/join?token=${res.data!.token}`
    setInviteLink(url)
    setInviteEmail('')
    toast.success(`A 7-day ${inviteRole} invitation link was created. Access begins only after it is accepted.`)
    router.refresh()
  })

  const copyLink = async () => {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    toast.success('Invitation link copied to the clipboard.')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      {/* The design's segmented control: a tinted active chip rather than a
          solid dark one, so the same markup reads correctly in dark mode. */}
      <nav
        className="flex gap-0.5 overflow-x-auto rounded-lg border border-surface-border bg-surface-card p-[3px]"
        aria-label="Settings sections"
      >
        {([
          ['business', Store, 'Business'],
          ['preferences', SlidersHorizontal, 'Preferences'],
          ['security', ShieldCheck, 'Security'],
          ['data', Database, 'Data'],
        ] as const).map(([value, Icon, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={`flex min-w-max flex-1 items-center justify-center gap-2 rounded-md px-3 py-[5px]
                        text-12.5 transition-colors ${
              tab === value
                ? 'bg-primary-tint font-semibold text-primary'
                : 'font-medium text-ink-muted hover:bg-surface-muted'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </nav>

      {tab === 'business' && <div className="grid gap-4 xl:grid-cols-2">

      {/* ── Plan ──────────────────────────────────────────────────────────── */}
      <section className="card space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-slate-400" />
          <h2 className="card-title">Plan</h2>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-base font-semibold capitalize text-slate-900">{planName}</p>
            <p className="text-xs text-slate-500">
              {planName === 'trial' && active && trialDays !== null && (
                <>{trialDays} {trialDays === 1 ? 'day' : 'days'} left</>
              )}
              {planName === 'trial' && !active && 'Trial has ended'}
              {planName !== 'trial' && (active ? 'Active' : 'Not active')}
            </p>
          </div>
          <Badge variant={active ? 'active' : 'warning'}>
            {active ? 'Active' : 'Expired'}
          </Badge>
        </div>

        {!active && (
          <p className="text-sm text-amber-900 bg-amber-50 rounded-xl px-4 py-3">
            You can still open, search and export everything you already have.
            Adding new loans needs an active plan — recording repayments on
            existing loans keeps working either way.
          </p>
        )}
      </section>

      {/* ── Shop ──────────────────────────────────────────────────────────── */}
      <section className="card space-y-4">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-slate-400" />
          <h2 className="card-title">Shop</h2>
        </div>

        <div className="flex items-end gap-3">
          <Input
            label="Shop name"
            value={shop}
            onChange={e => setShop(e.target.value)}
            disabled={!isOwner}
            helper={isOwner ? undefined : 'Only the owner can change this'}
          />
          {isOwner && (
            <Button
              size="sm" loading={pending} disabled={shop.trim() === shopName}
              onClick={() => save(
                () => updateShopName(shop),
                `Shop name changed to “${shop.trim()}”.`,
                'The shop name could not be changed. The previous name is still shown.',
              )}
            >
              Save
            </Button>
          )}
        </div>

        <div className="flex items-end gap-3">
          <Input
            label="Your name"
            value={myName}
            onChange={e => setMyName(e.target.value)}
            helper={me.email}
          />
          <Button
            size="sm" loading={pending} disabled={myName.trim() === me.full_name}
            onClick={() => save(
              () => updateMyName(myName),
              `Your name changed to “${myName.trim()}”.`,
              'Your name could not be changed. The previous name is still shown.',
            )}
          >
            Save
          </Button>
        </div>
      </section>

      {/* ── People ────────────────────────────────────────────────────────── */}
      {staffAccessEnabled && <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" />
            <h2 className="card-title">People</h2>
            <span className="text-xs text-slate-400">
              {members.length} of {staffLimit}
            </span>
          </div>
          {isOwner && members.length < staffLimit && (
            <Button size="sm" variant="secondary" onClick={() => { setInviteLink(null); setInviting(true) }}>
              <UserPlus className="h-4 w-4" /> Invite
            </Button>
          )}
        </div>

        <ul className="divide-y divide-surface-border -my-1">
          {members.map(m => (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  {m.full_name}
                  {m.is_me && <span className="text-xs text-slate-400 font-normal"> (you)</span>}
                </p>
                <p className="text-xs text-slate-500 truncate">{m.email}</p>
              </div>
              <Badge variant={m.role === 'owner' ? 'info' : 'silver'}>{m.role}</Badge>
              {isOwner && !m.is_me && (
                <button
                  onClick={() => save(
                    () => revokeStaff(m.id),
                    `${m.full_name} can no longer access this shop.`,
                    `${m.full_name} could not be removed and still has access.`,
                  )}
                  disabled={pending}
                  className="btn-icon text-slate-400 hover:text-red-600"
                  aria-label={`Remove ${m.full_name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>

        {isOwner && (
          <p className="text-xs text-slate-400">
            Staff can add loans, record deposits and view reports. Only owners can
            close and reopen loans, delete records, invite people, or change the plan.
          </p>
        )}
      </section>}

      </div>}

      {/* Identity, interest and form fields — ported from the desktop's
          General Settings screen (migration 012). */}
      {tab === 'preferences' && <div className="grid gap-4 xl:grid-cols-2">
        <IdentitySettings settings={settings} />
        {settings.identity_verification_enabled && settings.photo_capture_mode === 'mobile' && (
          <MobileCaptureSettings isOwner={isOwner} />
        )}
        <AppearanceSettings initialTheme={settings.theme} />
      </div>}

      {tab === 'security' && <div className="grid gap-4 xl:grid-cols-2">
      <AccessDevices />

      {/* ── Screen lock ───────────────────────────────────────────────────── */}
      <section className="card space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-slate-400" />
          <h2 className="card-title">Screen lock</h2>
        </div>

        <Select
          label="Lock automatically after"
          defaultValue={String(settings.lock_after_minutes ?? '0')}
          onChange={e => save(
            () => saveSetting('lock_after_minutes', Number(e.target.value)),
            Number(e.target.value) > 0
              ? `The screen will lock after ${e.target.value} minutes of inactivity.`
              : 'Automatic screen locking is now off.',
            'The automatic lock time could not be changed.',
          )}
          options={[
            { value: '0',  label: 'Never' },
            { value: '5',  label: '5 minutes of inactivity' },
            { value: '15', label: '15 minutes of inactivity' },
            { value: '30', label: '30 minutes of inactivity' },
          ]}
        />

        <label className="flex items-start gap-3 cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={settings.lock_on_startup}
            onClick={() => save(
              () => saveSetting('lock_on_startup', !settings.lock_on_startup),
              settings.lock_on_startup
                ? 'The app will no longer lock when a new session starts.'
                : 'The app will lock when a new session starts on devices with a PIN.',
              'The startup lock setting could not be changed.',
            )}
            className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
              settings.lock_on_startup ? 'bg-primary-600' : 'bg-slate-300'
            }`}
          >
            <span
              className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
              style={{ transform: `translateX(${settings.lock_on_startup ? 18 : 2}px)` }}
            />
          </button>
          <span>
            <span className="block text-sm text-slate-900">Lock when the app starts</span>
            <span className="block text-xs text-slate-500 mt-0.5">Requires a PIN on this device. The lock appears when a new app session opens.</span>
          </span>
        </label>

        <div className="pt-3 border-t border-surface-border space-y-3">
          <PinSettings timeoutMinutes={Number(settings.lock_after_minutes ?? 0)} />
        </div>
      </section>
      </div>}

      {/* Replaces the desktop's export/backup — a shop must be able to take
          their own records out whenever they like. */}
      {tab === 'data' && <div className="max-w-3xl"><DataExport /></div>}

      {/* ── Invite modal ──────────────────────────────────────────────────── */}
      {staffAccessEnabled && <Modal open={inviting} onClose={() => setInviting(false)} title="Invite someone">
        {inviteLink ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Send this link to them. It works once, expires in 7 days, and only
              opens for the email address you invited.
            </p>
            <div className="flex gap-2">
              <input readOnly value={inviteLink} className="input font-mono text-xs" />
              <Button variant="secondary" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              We don&rsquo;t send this by email yet — pass it on however you normally
              reach them.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => { setInviting(false); setInviteLink(null) }}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              label="Email address" type="email" required autoFocus
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="them@example.com"
              helper="They will need to sign up with this exact address"
            />
            <Select
              label="Role"
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as 'owner' | 'staff')}
              options={[
                { value: 'staff', label: 'Staff — day-to-day work' },
                { value: 'owner', label: 'Owner — full access' },
              ]}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setInviting(false)}>Cancel</Button>
              <Button onClick={onInvite} loading={pending} disabled={!inviteEmail.trim()}>
                Create invitation
              </Button>
            </div>
          </div>
        )}
      </Modal>}
    </div>
  )
}
