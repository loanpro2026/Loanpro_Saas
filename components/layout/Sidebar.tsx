'use client'
/**
 * The sidebar, built to the design reference.
 *
 * 232px wide, three bands: a 60px shop header, the scrolling nav, and the
 * signed-in owner pinned to the bottom. Sections are static headers rather than
 * collapsible groups — a shop navigates by muscle memory, and a menu that has
 * to be opened before it can be read costs a click on every visit.
 *
 * Hidden below `lg`; the phone gets BottomNav instead.
 */
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn, getInitials } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { NAV, ICON, isActive } from '@/lib/nav'
import { Icon } from '@/components/ui/Icon'
import type { Tenant, AppUser } from '@/types'

interface SidebarProps {
  tenant: Tenant
  user: AppUser
}

export function Sidebar({ tenant, user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut({ scope: 'local' })
    router.replace('/login')
    router.refresh()
  }

  return (
    <aside
      className="hidden h-dvh w-[232px] shrink-0 flex-col border-r border-surface-border
                 bg-surface-card lg:sticky lg:top-0 lg:flex"
    >
      {/* Shop — the same 60px as the top bar, so the two rules meet. */}
      <div className="flex h-[60px] items-center gap-2.5 border-b border-surface-border px-4">
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-primary text-13 font-bold text-white">
          LP
        </div>
        <div className="min-w-0">
          <p className="truncate text-13.5 font-bold text-ink">{tenant.shop_name}</p>
          <p className="truncate text-10.5 font-semibold capitalize text-green">
            ● {tenant.plan} plan · Synced
          </p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-px overflow-y-auto p-2.5" aria-label="Main navigation">
        {NAV.map((section, index) => (
          <div key={section.heading ?? `section-${index}`} className="flex flex-col gap-px">
            {section.heading && (
              <div className="px-2 pb-1 pt-3 text-10 font-bold tracking-[0.08em] text-ink-faint">
                {section.heading}
              </div>
            )}
            {section.items.map(item => {
              const active = isActive(pathname, item.href, item.also)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-[34px] items-center gap-2.5 rounded-md px-2 text-13 transition-colors',
                    active
                      ? 'bg-primary-tint font-semibold text-primary'
                      : 'font-medium text-ink-muted hover:bg-primary-tint'
                  )}
                >
                  <Icon d={item.d} size={17} className={item.nested ? 'ml-3.5' : undefined} />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Owner */}
      <div className="flex items-center gap-2.5 border-t border-surface-border px-3.5 py-3">
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-primary-tint text-12 font-bold text-primary">
          {getInitials(user.full_name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-12.5 font-semibold text-ink">{user.full_name}</p>
          <p className="truncate text-11 capitalize text-ink-faint">{user.role ?? 'Owner'}</p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          title="Sign out"
          aria-label="Sign out"
          className="p-1 text-ink-faint transition-colors hover:text-red"
        >
          <Icon d={ICON.signOut} size={16} />
        </button>
      </div>
    </aside>
  )
}
