'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { MOBILE_NAV as NAV, isActive } from '@/lib/nav'

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-surface-border
                 bg-white/95 px-2 pb-safe shadow-[0_-8px_30px_-24px_rgb(15_23_42/0.45)] backdrop-blur-xl lg:hidden"
      aria-label="Mobile navigation"
    >
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'relative flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-3 py-2',
              'transition-colors duration-150',
              active ? 'text-primary-700' : 'text-slate-400 hover:text-slate-600'
            )}
            aria-current={active ? 'page' : undefined}
          >
            {active && <span className="absolute -top-px h-0.5 w-6 rounded-full bg-primary-600" />}
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
