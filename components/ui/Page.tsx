/**
 * The furniture every screen in the design repeats: a page header, a card, a
 * card header with a title and an optional right-hand action, a stat tile and a
 * fused strip of figures.
 *
 * These exist so the numbers live in one place. The design's cards are 12px
 * radius / 1px border / flat shadow and its card titles are 13.5px/700 on every
 * screen; when that is spelled out inline on nine pages, one of them ends up at
 * 14px and the grid stops reading as a single surface.
 */
import { cn } from '@/lib/utils'

export function PageHeader({
  title, subtitle, actions, className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-bold leading-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-13 text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({
  children, className, flush = false, accent,
}: {
  children: React.ReactNode
  className?: string
  /** Children are full-bleed rows — clip them to the radius. */
  flush?: boolean
  /** Draws the border in the primary colour, for the one card that matters most. */
  accent?: boolean
}) {
  return (
    <div className={cn('card', flush && 'overflow-hidden', accent && 'border-primary', className)}>
      {children}
    </div>
  )
}

export function CardHeader({
  title, meta, action, className,
}: {
  title: React.ReactNode
  /** Sits beside the title in muted 12px — counts, totals, a date range. */
  meta?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 border-b border-surface-border px-4 py-3', className)}>
      <div className="flex min-w-0 items-baseline gap-2.5">
        <span className="card-title whitespace-nowrap">{title}</span>
        {meta && <span className="truncate text-12 text-ink-muted">{meta}</span>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}

/** The four-across figures at the top of Dashboard, Accounts and Cash. */
export function StatCard({
  label, value, sub, tone = 'default', badge, className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: 'default' | 'green' | 'amber' | 'red' | 'primary'
  /** Small pill at the top right, e.g. LIVE. */
  badge?: React.ReactNode
  className?: string
}) {
  const valueTone = {
    default: 'text-ink',
    green:   'text-green',
    amber:   'text-amber',
    red:     'text-red',
    primary: 'text-primary',
  }[tone]

  return (
    <div className={cn('card px-4 py-3.5', tone === 'primary' && 'border-primary', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-12 font-semibold', tone === 'primary' ? 'text-primary' : 'text-ink-muted')}>
          {label}
        </span>
        {badge}
      </div>
      <div className={cn('mt-1.5 text-22 font-bold tabular-nums', valueTone)}>{value}</div>
      {sub && <div className="mt-0.5 text-12 text-ink-faint">{sub}</div>}
    </div>
  )
}

/** Figures fused into one card and divided by hairlines, as on the loan detail. */
export function StatStrip({
  children, columns = 4, className,
}: {
  children: React.ReactNode
  columns?: number
  className?: string
}) {
  return (
    <div
      className={cn('card grid overflow-hidden', className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  )
}

export function StatStripCell({
  label, value, sub, tone = 'default', highlight = false, className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: 'default' | 'green' | 'amber' | 'red' | 'primary'
  /** Fills the cell with the primary tint — the design's "this is the answer" cell. */
  highlight?: boolean
  className?: string
}) {
  const valueTone = {
    default: 'text-ink',
    green:   'text-green',
    amber:   'text-amber',
    red:     'text-red',
    primary: 'text-primary',
  }[tone]

  return (
    <div className={cn(
      'border-r border-surface-border px-4 py-3 last:border-r-0',
      highlight && 'bg-primary-tint',
      className
    )}>
      <div className={cn('text-11.5', highlight ? 'font-semibold text-primary' : 'text-ink-muted')}>{label}</div>
      <div className={cn('mt-0.5 text-17 font-bold tabular-nums', valueTone)}>{value}</div>
      {sub && <div className="mt-0.5 text-11 text-ink-faint">{sub}</div>}
    </div>
  )
}
