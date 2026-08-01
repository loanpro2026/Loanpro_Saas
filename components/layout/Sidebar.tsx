'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, FileText, ArrowDownCircle,
  Wallet, BarChart2, Settings, LogOut,
  ChevronRight, ClipboardCheck, LifeBuoy
} from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Tenant, AppUser } from '@/types'

const NAV = [
  { href: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/loans',      label: 'Loans',       icon: FileText        },
  { href: '/deposits',   label: 'Deposits',    icon: ArrowDownCircle },
  { href: '/cash',       label: 'Cash',        icon: Wallet          },
  { href: '/day-end',    label: 'End of day', icon: ClipboardCheck },
  { href: '/reports',    label: 'Reports',     icon: BarChart2       },
]

interface SidebarProps {
  tenant: Tenant
  user: AppUser
}

export function Sidebar({ tenant, user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-primary-950 text-white border-r border-primary-900">
      {/* Logo */}
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

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5" aria-label="Main navigation">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                active
                  ? 'bg-primary-700 text-white'
                  : 'text-primary-300 hover:bg-primary-800/60 hover:text-white'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
              {active && <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-50" />}
            </Link>
          )
        })}
      </nav>

      {/* Bottom links */}
      <div className="px-3 py-3 space-y-0.5 border-t border-primary-900">
        <Link
          href="/help"
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
            pathname.startsWith('/help')
              ? 'bg-primary-700 text-white'
              : 'text-primary-300 hover:bg-primary-800/60 hover:text-white'
          )}
        >
          <LifeBuoy className="h-4 w-4" />
          Help
        </Link>
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
            pathname === '/settings'
              ? 'bg-primary-700 text-white'
              : 'text-primary-300 hover:bg-primary-800/60 hover:text-white'
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>

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
