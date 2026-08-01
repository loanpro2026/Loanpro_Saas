import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center px-4', className)}>
      {Icon && (
        <div className="mb-4 rounded-2xl bg-surface-muted p-4">
          <Icon className="h-8 w-8 text-slate-400" strokeWidth={1.5} />
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-700">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-500 max-w-xs">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
