'use client'
/**
 * The phone's bottom bar. No equivalent exists in the design reference, which
 * is desktop-only, so it follows the same tokens — card surface, hairline
 * border, tinted active state — rather than inventing a second visual language.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { MOBILE_NAV as NAV, isActive } from '@/lib/nav'

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-surface-border
                 bg-surface-card/95 px-2 pb-safe backdrop-blur-xl lg:hidden"
      aria-label="Mobile navigation"
    >
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'relative flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-3 py-2 transition-colors',
              active ? 'text-primary' : 'text-ink-faint hover:text-ink-muted'
            )}
            aria-current={active ? 'page' : undefined}
          >
            {active && <span className="absolute -top-px h-0.5 w-6 rounded-full bg-primary" />}
            <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} />
            <span className={cn('text-10 font-semibold', active ? 'text-primary' : 'text-ink-faint')}>
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
