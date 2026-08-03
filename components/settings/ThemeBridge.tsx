'use client'

import { useLayoutEffect } from 'react'
import type { ShopSettings } from '@/lib/settings'

export function applyTheme(theme: ShopSettings['theme']) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
  try { window.localStorage.setItem('loanpro-theme', theme) } catch { /* storage may be blocked */ }
}

/** Keeps portalled UI and the browser's native controls on the shop theme. */
export function ThemeBridge({ theme }: { theme: ShopSettings['theme'] }) {
  useLayoutEffect(() => { applyTheme(theme) }, [theme])
  return null
}
