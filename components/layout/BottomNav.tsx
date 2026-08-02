'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { MOBILE_NAV as NAV, isActive } from '@/lib/nav'

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-surface-border
                 flex items-center justify-around px-2 pb-safe"
      aria-label="Mobile navigation"
    >
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl min-w-0',
              'transition-colors duration-150',
              active ? 'text-primary-700' : 'text-slate-400 hover:text-slate-600'
            )}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className={cn('h-5 w-5', active && 'fill-current opacity-20')} strokeWidth={active ? 2.5 : 1.75} />
            <span className={cn('text-[10px] font-medium', active ? 'text-primary-700' : 'text-slate-500')}>
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
