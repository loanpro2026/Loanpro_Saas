'use client'
/**
 * The top bar's light/dark switch.
 *
 * Flips the class immediately and saves in the background: the theme is a shop
 * setting stored server-side, but waiting on a round trip to repaint would make
 * the button feel broken. If the save fails the class goes back and the toast
 * says so, rather than leaving the screen and the database disagreeing.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { userFacingError } from '@/lib/user-message'
import { saveSetting } from '@/app/(app)/settings/actions'
import { applyTheme } from '@/components/settings/ThemeBridge'
import { ICON } from '@/lib/nav'
import { Icon } from '@/components/ui/Icon'
import type { ShopSettings } from '@/lib/settings'

export function ThemeToggle({ initialTheme }: { initialTheme: ShopSettings['theme'] }) {
  const router = useRouter()
  const [theme, setTheme] = useState(initialTheme)
  const [pending, startTransition] = useTransition()

  const toggle = () => {
    const previous = theme
    const next = previous === 'light' ? 'dark' : 'light'
    setTheme(next)
    applyTheme(next)
    startTransition(async () => {
      const result = await saveSetting('theme', next)
      if (!result.ok) {
        setTheme(previous)
        applyTheme(previous)
        toast.error(userFacingError(
          result.error,
          'The display mode could not be saved. The previous theme has been restored.',
        ))
        return
      }
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
      aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
      className="btn-icon"
    >
      <Icon d={theme === 'light' ? ICON.moon : ICON.sun} size={17} />
    </button>
  )
}
