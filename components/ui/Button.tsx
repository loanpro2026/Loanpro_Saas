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
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 active:scale-[0.98]'

  const variants = {
    primary:   'bg-primary-700 text-white hover:bg-primary-800 shadow-sm',
    secondary: 'bg-surface-muted text-slate-700 hover:bg-slate-200 border border-surface-border',
    danger:    'bg-red-600 text-white hover:bg-red-700 shadow-sm',
    ghost:     'text-slate-600 hover:bg-slate-100',
  }

  const sizes = {
    sm:   'px-3.5 py-1.5 text-xs',
    md:   'px-5 py-2.5 text-sm',
    lg:   'px-6 py-3 text-base',
    icon: 'p-2',
  }

  return (
    <button
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  )
}
