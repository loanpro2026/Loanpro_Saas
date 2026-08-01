'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings } from 'lucide-react'
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
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-surface-border
                       flex items-center gap-3 px-4 py-3 lg:px-6">
      {/* Mobile: menu hint (sidebar handled by Sidebar component) */}
      <div className="lg:hidden w-5 h-5" aria-hidden />

      <h1 className="text-base font-semibold text-slate-900 shrink-0">{title}</h1>

      {/* Search is the most-used control in the desktop app, so it gets prime
          position rather than hiding behind a menu. */}
      <div className="flex-1 flex justify-center px-2">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-1">
        <Link href="/settings" aria-label="Settings" className="btn-icon hidden lg:flex">
          <Settings className="h-4 w-4" />
        </Link>
        <div className="w-8 h-8 rounded-full bg-primary-700 flex items-center justify-center
                        cursor-default select-none" title={user.full_name}>
          <span className="text-xs font-bold text-white">{getInitials(user.full_name)}</span>
        </div>
      </div>
    </header>
  )
}
