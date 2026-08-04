import { cn } from '@/lib/utils'

/**
 * The design's pill: a 5px-radius rectangle, not a lozenge — 11px/700 on a
 * tinted ground. Metal badges are the most-repeated element in the app, and a
 * fully rounded pill made columns of them read as noise.
 */
type BadgeVariant = 'gold' | 'silver' | 'active' | 'closed' | 'warning' | 'danger' | 'info'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const styles: Record<BadgeVariant, string> = {
  gold:    'bg-gold-bg text-gold',
  silver:  'bg-silver-bg text-silver',
  active:  'bg-green-bg text-green',
  closed:  'bg-surface-muted text-ink-muted',
  warning: 'bg-amber-bg text-amber',
  danger:  'bg-red-bg text-red',
  info:    'bg-primary-tint text-primary',
}

export function Badge({ variant = 'info', children, className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-11 font-bold uppercase',
      styles[variant],
      className
    )}>
      {children}
    </span>
  )
}

/** Convenience for the Gold/Silver column, which appears on six screens. */
export function MetalBadge({ metal, className }: { metal: string; className?: string }) {
  return (
    <Badge variant={metal?.toLowerCase() === 'silver' ? 'silver' : 'gold'} className={className}>
      {metal}
    </Badge>
  )
}
