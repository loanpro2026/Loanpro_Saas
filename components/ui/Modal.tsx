'use client'
/**
 * The design's dialog: a fixed-width card on a flat scrim, 12px radius, 22px of
 * padding, title and subtitle stacked at the top and the actions right-aligned
 * at the bottom.
 *
 * Widths are named rather than free: the reference uses 400px for a single-field
 * dialog (add deposit, add cash), 420px for a confirmation and 460px for the
 * settlement summary. On a phone the panel becomes a bottom sheet, since a
 * centred 400px card with a keyboard open is unusable.
 */
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { useEffect } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  /** One line under the title — the design puts context here, not in the body. */
  subtitle?: React.ReactNode
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Tints the title red, for destructive confirmations. */
  danger?: boolean
  className?: string
}

const SIZES = {
  sm: 'sm:max-w-[400px]',
  md: 'sm:max-w-[420px]',
  lg: 'sm:max-w-[460px]',
  xl: 'sm:max-w-2xl',
}

export function Modal({
  open, onClose, title, subtitle, children, size = 'md', danger, className,
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 animate-fade-in"
        style={{ background: 'var(--scrim)' }}
        onClick={onClose}
      />
      <div
        className={cn(
          'relative w-full animate-slide-up border border-surface-border bg-surface-card',
          'rounded-t-3xl p-[22px] shadow-modal sm:rounded-2xl',
          SIZES[size],
          className
        )}
      >
        {title && (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className={cn('text-15.5 font-bold', danger ? 'text-red' : 'text-ink')}>{title}</h2>
              {subtitle && <p className="modal-subtitle">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="-mr-1 -mt-1 shrink-0 p-1 text-ink-faint transition-colors hover:text-ink"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
