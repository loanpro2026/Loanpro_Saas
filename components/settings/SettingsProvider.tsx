'use client'
/**
 * Shop settings, available to any client component.
 *
 * Loaded once in the app layout and passed down, rather than fetched per
 * component — the new-loan form, the closing dialog and the dashboard all
 * need them, and three round trips on every page load is wasteful on a shop's
 * connection.
 */
import { createContext, useContext, type ReactNode } from 'react'
import { withDefaults, type ShopSettings } from '@/lib/settings'
import type { Json } from '@/types/supabase'
import { DEFAULT_SETTINGS } from '@/lib/settings'

const Ctx = createContext<ShopSettings>(DEFAULT_SETTINGS)

export const useSettings = () => useContext(Ctx)

export function SettingsProvider({
  settings,
  children,
}: {
  settings: Json | Record<string, unknown> | null
  children: ReactNode
}) {
  return <Ctx.Provider value={withDefaults(settings)}>{children}</Ctx.Provider>
}
