'use client'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  loading?: boolean
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
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/70 focus-visible:ring-offset-2 active:scale-[0.98]'

  const variants = {
    primary:   'bg-primary-600 text-white hover:bg-primary-700 shadow-sm',
    secondary: 'bg-surface-muted text-slate-700 hover:bg-slate-200 border border-surface-border',
    danger:    'bg-red-600 text-white hover:bg-red-700 shadow-sm',
    ghost:     'text-slate-600 hover:bg-slate-100',
  }

  const sizes = {
    sm:   'h-8 px-3 text-xs',
    md:   'h-10 px-4 text-sm',
    lg:   'h-11 px-5 text-base',
    icon: 'p-2',
  }

  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />}
      {children}
    </button>
  )
}
