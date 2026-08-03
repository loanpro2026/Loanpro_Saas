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
      'flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-150',
      nested ? 'px-3 py-2 ml-3' : 'px-3 py-2.5',
      active
        ? 'bg-primary-700 text-white'
        : 'text-primary-300 hover:bg-primary-800/60 hover:text-white'
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
        {active && !nested && <ChevronRight className="h-3.5 w-3.5 opacity-50" />}
      </Link>
    )
  }

  return (
    <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-primary-950 text-white border-r border-primary-900">
      {/* Shop */}
      <div className="px-6 py-5 border-b border-primary-900">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gold-500 flex items-center justify-center flex-shrink-0">
            <span className="text-primary-950 font-bold text-sm">LP</span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-white truncate">{tenant.shop_name}</p>
            <p className="text-xs text-primary-300 truncate capitalize">{tenant.plan} plan</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" aria-label="Main navigation">
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
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                  inside
                    ? 'text-white'
                    : 'text-primary-300 hover:bg-primary-800/60 hover:text-white'
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
      <div className="px-4 py-4 border-t border-primary-900">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-700 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">{getInitials(user.full_name)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{user.full_name}</p>
            <p className="text-xs text-primary-400 truncate">{user.email}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="p-1.5 rounded-lg text-primary-400 hover:text-white hover:bg-primary-800 transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
