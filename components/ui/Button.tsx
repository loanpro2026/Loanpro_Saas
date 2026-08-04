'use client'
/**
 * The design's button.
 *
 * Heights are the reference's exact ones — 30 / 32 / 36 / 38 / 44 — because the
 * screens line buttons up against inputs and selects of matching height and any
 * drift shows immediately in a toolbar. Variants map to the tinted pairs the
 * design uses for money: green for cash in, amber for cash out, red for
 * destructive.
 */
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'tinted' | 'success' | 'warn' | 'danger' | 'ghost'
type Size = 'mini' | 'setting' | 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const VARIANTS: Record<Variant, string> = {
  primary:   'bg-primary text-white hover:brightness-110',
  secondary: 'border border-surface-border bg-surface-card text-ink hover:border-primary hover:text-primary',
  tinted:    'border border-primary bg-primary-tint text-primary hover:brightness-105',
  success:   'border border-green bg-green-bg text-green hover:brightness-[0.98]',
  warn:      'border border-amber bg-amber-bg text-amber hover:brightness-[0.98]',
  danger:    'bg-red text-white hover:brightness-110',
  ghost:     'text-ink-muted hover:bg-surface-muted hover:text-ink',
}

const SIZES: Record<Size, string> = {
  mini:    'h-[30px] rounded-md px-3 text-12',
  setting: 'h-8 rounded-md px-3 text-12.5',
  sm:      'h-8 px-3 text-12.5',
  md:      'h-9 px-4 text-13',
  lg:      'h-[38px] px-5 text-13',
  icon:    'h-[34px] w-[34px] p-0',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold',
        'transition-[filter,background-color,border-color,color] duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
