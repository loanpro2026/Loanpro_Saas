'use client'
/**
 * The sidebar, matching the desktop app's structure.
 *
 * Groups (View Records, View Accounts, Help & Support) expand in place rather
 * than flying out on hover as they do on the desktop. A hover flyout depends on
 * a mouse; this app is used on laptops at a counter and on phones, and a menu
 * that only opens on hover is unreachable on the second.
 *
 * A group is open when the current page is inside it, and can be toggled
 * otherwise — so landing on /view-records/closed shows you where you are
 * without a click.
 */
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { ChevronRight, ChevronDown, LogOut } from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { NAV, isGroup, isActive, type NavLeaf } from '@/lib/nav'
import type { Tenant, AppUser } from '@/types'

interface SidebarProps {
  tenant: Tenant
  user: AppUser
}

export function Sidebar({ tenant, user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  // Groups the user has opened by hand. A group containing the current page is
  // always open regardless.
  const [opened, setOpened] = useState<Record<string, boolean>>({})

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut({ scope: 'local' })
    router.replace('/login')
    router.refresh()
  }

  const leafClass = (active: boolean, nested = false) =>
    cn(
      'relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-150',
      nested ? 'px-3 py-2 ml-3' : 'px-3 py-2.5',
      active
        ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    )

  const Leaf = ({ item, nested }: { item: NavLeaf; nested?: boolean }) => {
    const active = isActive(pathname, item.href)
    const Icon = item.icon
    return (
      <Link
        href={item.href}
        className={leafClass(active, nested)}
        aria-current={active ? 'page' : undefined}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
        {active && !nested && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary-600" />}
      </Link>
    )
  }

  return (
    <aside className="hidden lg:sticky lg:top-0 lg:flex h-dvh w-[248px] shrink-0 flex-col border-r border-surface-border bg-white">
      {/* Shop */}
      <div className="flex h-[61px] items-center border-b border-surface-border px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-900 shadow-sm dark:bg-white">
            <span className="text-xs font-bold tracking-tight text-white dark:text-slate-950">LP</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{tenant.shop_name}</p>
            <p className="truncate text-[11px] capitalize text-slate-500">{tenant.plan} workspace</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3" aria-label="Main navigation">
        {NAV.map(entry => {
          if (!isGroup(entry)) return <Leaf key={entry.href} item={entry} />

          const inside = pathname.startsWith(entry.match)
          const open = inside || !!opened[entry.label]
          const Icon = entry.icon

          return (
            <div key={entry.label}>
              <button
                type="button"
                onClick={() => setOpened(o => ({ ...o, [entry.label]: !open }))}
                aria-expanded={open}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                  inside
                    ? 'text-primary-700 dark:text-primary-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left truncate">{entry.label}</span>
                {open
                  ? <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  : <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
              </button>

              {open && (
                <div className="mt-0.5 space-y-0.5">
                  {entry.children.map(child => (
                    <Leaf key={child.href} item={child} nested />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* User */}
      <div className="border-t border-surface-border p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-100">
            <span className="text-xs font-bold text-primary-700">{getInitials(user.full_name)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{user.full_name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
