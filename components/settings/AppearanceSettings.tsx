'use client'

import { useState, useTransition } from 'react'
import { Moon, Palette, Sun } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { saveSetting } from '@/app/(app)/settings/actions'
import { applyTheme } from '@/components/settings/ThemeBridge'
import type { ShopSettings } from '@/lib/settings'

export function AppearanceSettings({ initialTheme }: { initialTheme: ShopSettings['theme'] }) {
  const router = useRouter()
  const [theme, setTheme] = useState(initialTheme)
  const [pending, startTransition] = useTransition()

  const choose = (next: ShopSettings['theme']) => {
    if (next === theme) return
    const previous = theme
    setTheme(next)
    applyTheme(next)
    startTransition(async () => {
      const result = await saveSetting('theme', next)
      if (!result.ok) {
        setTheme(previous)
        applyTheme(previous)
        toast.error(`${next === 'dark' ? 'Dark' : 'Light'} mode was not saved. ${result.error ?? 'The previous theme has been restored.'}`)
        return
      }
      toast.success(`${next === 'dark' ? 'Dark' : 'Light'} mode is now active on this shop account.`)
      router.refresh()
    })
  }

  return (
    <section className="card space-y-4">
      <div className="flex items-center gap-2">
        <Palette className="h-4 w-4 text-slate-400" />
        <div>
          <h2 className="card-title">Appearance</h2>
          <p className="mt-0.5 text-xs text-slate-500">Saved for your shop and applied on every device.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Colour theme">
        <ThemeChoice label="Light" icon={Sun} selected={theme === 'light'} disabled={pending} onClick={() => choose('light')} />
        <ThemeChoice label="Dark" icon={Moon} selected={theme === 'dark'} disabled={pending} onClick={() => choose('dark')} />
      </div>
    </section>
  )
}

function ThemeChoice({ label, icon: Icon, selected, disabled, onClick }: {
  label: string
  icon: typeof Sun
  selected: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
        selected
          ? 'border-primary-500 bg-primary-50 text-primary-800 dark:bg-primary-950 dark:text-primary-200'
          : 'border-surface-border bg-surface-card text-slate-700 hover:bg-surface-muted'
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  )
}
