import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ensureTenantProvisioned } from '@/lib/tenant'
import { numberAt } from '@/lib/json'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'
import { TopBar } from '@/components/layout/TopBar'
import { DeviceRegistrationBridge } from '@/components/DeviceRegistrationBridge'
import { OfflineProvider } from '@/components/offline/OfflineProvider'
import { OfflineBanner } from '@/components/offline/OfflineBanner'
import { ScreenLock } from '@/components/lock/ScreenLock'
import { SettingsProvider } from '@/components/settings/SettingsProvider'
import { ThemeBridge } from '@/components/settings/ThemeBridge'
import { withDefaults } from '@/lib/settings'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  let { data: appUser } = await supabase
    .from('users')
    .select('*, tenant:tenants(*)')
    .eq('auth_id', user.id)
    .maybeSingle()

  // An account confirmed by email arrives here with a session but no shop —
  // see ensureTenantProvisioned(). Provision, then read again.
  if (!appUser) {
    const ok = await ensureTenantProvisioned()
    if (!ok) redirect('/setup')

    ;({ data: appUser } = await supabase
      .from('users')
      .select('*, tenant:tenants(*)')
      .eq('auth_id', user.id)
      .maybeSingle())

    // Never send them to /register: the middleware bounces signed-in users off
    // that route straight back here, which is the loop this replaced.
    if (!appUser) redirect('/setup')
  }

  const tenant = (appUser as any).tenant

  // All shop settings in one call. Loaded here rather than per-component:
  // the new-loan form, the closing dialog and the dashboard all need them,
  // and three round trips per page load is wasteful on a shop's connection.
  const { data: settings } = await supabase.rpc('my_settings')
  const appSettings = withDefaults(settings)
  const lockAfter = numberAt(settings, 'lock_after_minutes')

  return (
    <SettingsProvider settings={settings}>
    <ThemeBridge theme={appSettings.theme} />
    <OfflineProvider>
    <div className={`${appSettings.theme === 'dark' ? 'dark ' : ''}flex min-h-dvh bg-surface lg:h-dvh lg:overflow-hidden`}>
      <Sidebar tenant={tenant} user={appUser} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar user={appUser} theme={appSettings.theme} />
        {/* Connection state sits directly under the top bar, above content —
            a shop must never have to hunt for whether their entry saved. */}
        <OfflineBanner />

        {/* The design's content well: 1600px max, 24px gutters, 40px of air at
            the bottom so the last card never sits flush against the viewport. */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] px-3 pb-24 pt-3 sm:px-4 lg:px-6 lg:pb-10 lg:pt-5">
            {children}
          </div>
        </main>
      </div>

      <BottomNav />
      {/* Renders over the app rather than redirecting, so a half-filled loan
          form survives being locked and unlocked. */}
      <ScreenLock
        timeoutMinutes={lockAfter}
        lockOnStartup={appSettings.lock_on_startup}
        shopName={tenant?.shop_name ?? 'LoanPro'}
      />
      {/* Silently registers Android FCM token / iOS push subscription when running inside native app */}
      <DeviceRegistrationBridge />
    </div>
    </OfflineProvider>
    </SettingsProvider>
  )
}
