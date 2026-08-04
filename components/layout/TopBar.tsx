'use client'
/**
 * The top bar, built to the design reference.
 *
 * A three-column grid — title, search, controls — rather than a flex row, so
 * the search field stays optically centred no matter how long the page title
 * is. Search is the most-used control in the app and gets the middle third;
 * below `lg` it takes the whole bar and the title steps aside.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getInitials } from '@/lib/utils'
import { GlobalSearch } from '@/components/layout/GlobalSearch'
import { NotificationMenu } from '@/components/layout/NotificationMenu'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { Icon } from '@/components/ui/Icon'
import { ICON, pageTitle } from '@/lib/nav'
import type { ShopSettings } from '@/lib/settings'
import type { AppUser } from '@/types'

interface TopBarProps {
  user: AppUser
  theme: ShopSettings['theme']
}

export function TopBar({ user, theme }: TopBarProps) {
  const pathname = usePathname()

  return (
    <header
      className="sticky top-0 z-30 grid h-[60px] shrink-0 grid-cols-[1fr] items-center gap-4
                 border-b border-surface-border bg-surface-card px-4
                 lg:grid-cols-[1fr_minmax(320px,560px)_1fr] lg:px-5"
    >
      <div className="hidden truncate text-13 font-medium text-ink-muted lg:block">
        {pageTitle(pathname)}
      </div>

      <div className="min-w-0">
        <GlobalSearch />
      </div>

      <div className="hidden items-center justify-end gap-1.5 lg:flex">
        <ThemeToggle initialTheme={theme} />
        <NotificationMenu />
        <Link href="/settings" aria-label="Settings" title="Settings" className="btn-icon">
          <Icon d={ICON.settings} size={17} />
        </Link>
        <div
          title={user.full_name}
          className="ml-0.5 flex h-8 w-8 cursor-default select-none items-center justify-center
                     rounded-full bg-primary-tint text-12 font-bold text-primary"
        >
          {getInitials(user.full_name)}
        </div>
      </div>
    </header>
  )
}
