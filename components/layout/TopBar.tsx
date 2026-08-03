'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings, Bell } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { GlobalSearch } from '@/components/layout/GlobalSearch'
import type { AppUser } from '@/types'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/loans':     'Loans',
  '/deposits':  'Deposits',
  '/cash':      'Cash',
  '/reports':   'Reports',
  '/settings':  'Settings',
  '/billing':   'Billing',
}

interface TopBarProps {
  user: AppUser
}

export function TopBar({ user }: TopBarProps) {
  const pathname = usePathname()
  const title = Object.entries(PAGE_TITLES).find(([k]) => pathname.startsWith(k))?.[1] ?? 'LoanPro'

  return (
    <header className="sticky top-0 z-30 flex h-[61px] items-center gap-3 border-b border-surface-border
                       bg-white/95 px-3 backdrop-blur-xl sm:px-4 lg:px-5">
      {/* Mobile: menu hint (sidebar handled by Sidebar component) */}
      <div className="lg:hidden w-5 h-5" aria-hidden />

      <h1 className="hidden shrink-0 text-sm font-semibold text-slate-700 xl:block">{title}</h1>

      {/* Search is the most-used control in the desktop app, so it gets prime
          position rather than hiding behind a menu. */}
      <div className="flex flex-1 justify-center lg:justify-start xl:px-3">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-1">
        <Link href="/help" aria-label="Notifications and help" className="btn-icon hidden sm:flex">
          <Bell className="h-4 w-4" />
        </Link>
        <Link href="/settings" aria-label="Settings" className="btn-icon hidden lg:flex">
          <Settings className="h-4 w-4" />
        </Link>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100
                        cursor-default select-none" title={user.full_name}>
          <span className="text-xs font-bold text-primary-700">{getInitials(user.full_name)}</span>
        </div>
      </div>
    </header>
  )
}
