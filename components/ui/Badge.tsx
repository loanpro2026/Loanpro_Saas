import { cn } from '@/lib/utils'

type BadgeVariant = 'gold' | 'silver' | 'active' | 'closed' | 'warning' | 'info'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const styles: Record<BadgeVariant, string> = {
  gold:    'bg-gold-100 text-gold-700',
  silver:  'bg-slate-100 text-slate-600',
  active:  'bg-emerald-100 text-emerald-700',
  closed:  'bg-slate-100 text-slate-500',
  warning: 'bg-amber-100 text-amber-700',
  info:    'bg-primary-100 text-primary-700',
}

export function Badge({ variant = 'info', children, className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
      styles[variant],
      className
    )}>
      {children}
    </span>
  )
}
