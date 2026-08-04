import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

/**
 * The design's empty state: a dashed-border card with a round icon chip, a
 * 14.5px heading and a constrained line of explanation. It is a card rather
 * than bare centred text so an empty table still occupies the space a full one
 * would — the page does not jump when results arrive.
 */
interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('empty-state', className)}>
      {Icon && (
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-muted text-ink-faint">
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </div>
      )}
      <h3 className="text-14.5 font-bold text-ink">{title}</h3>
      {description && (
        <p className="max-w-[420px] text-12.5 leading-relaxed text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
