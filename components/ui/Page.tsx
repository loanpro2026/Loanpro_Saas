/**
 * The furniture every screen in the design repeats: a page header, a card, a
 * card header with a title and an optional right-hand action, a stat tile and a
 * fused strip of figures.
 *
 * These exist so the numbers live in one place. The design's cards are 12px
 * radius / 1px border / flat shadow and its card titles are one size on every
 * screen; when that is spelled out inline on nine pages, one of them ends up a
 * pixel off and the grid stops reading as a single surface.
 *
 * Which is what had happened: every component below restated the same values as
 * inline utilities instead of using the shared class, so the classes in
 * globals.css had drifted into being documentation. They now apply.
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
    /**
     * Actions sit on their own row until there is real width for them.
     *
     * `sm:items-center` put a five-control toolbar on the title's baseline from
     * 640px up, so from a small laptop to a large one the title and the
     * controls fought over the same line and the controls wrapped into two
     * ragged rows. A toolbar is not a title decoration; below `lg` it gets its
     * own line, and above it aligns to the top of the heading rather than the
     * middle so a two-line subtitle does not drag it off-centre.
     */
    <div className={cn('page-header mb-5', className)}>
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle mt-1 max-w-prose">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          {actions}
        </div>
      )}
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
    <div className={cn(flush ? 'card-flush' : 'card', accent && 'border-primary', className)}>
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
    <div className={cn('flex items-center justify-between gap-4 border-b border-surface-border px-5 py-3.5', className)}>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
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
    <div className={cn('stat-card', tone === 'primary' && 'border-primary', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('stat-label', tone === 'primary' && 'text-primary')}>{label}</span>
        {badge}
      </div>
      <div className={cn('stat-value', valueTone)}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

/**
 * Figures fused into one card and divided by hairlines, as on the loan detail.
 *
 * The column count is a class rather than an inline `grid-template-columns`:
 * an inline style outranks every class, so a responsive override could never
 * take effect and the strip would stay at its widest count on a phone.
 */
const STRIP_COLUMNS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 lg:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6',
}

export function StatStrip({
  children, columns = 4, className,
}: {
  children: React.ReactNode
  columns?: number
  className?: string
}) {
  return (
    <div className={cn('card-flush grid', STRIP_COLUMNS[columns] ?? STRIP_COLUMNS[4], className)}>
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
    <div className={cn('stat-strip-cell', highlight && 'bg-primary-tint', className)}>
      <div className={cn('stat-label', highlight && 'text-primary')}>{label}</div>
      {/* A rung below StatCard: a strip is supporting detail for the screen it
          sits on, while a stat card is the screen's headline. Both were within
          five pixels of the body text before, so neither read as a figure. */}
      <div className={cn('mt-2 text-19 font-bold tabular-nums tracking-[-0.01em]', valueTone)}>{value}</div>
      {sub && <div className="mt-1 text-12 leading-snug text-ink-faint">{sub}</div>}
    </div>
  )
}
