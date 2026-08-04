/**
 * The design's line icons.
 *
 * Every glyph in the reference is a single `<path>` on a 24×24 grid, drawn with
 * no fill and a 1.8 stroke. Rendering them from the raw path data rather than
 * substituting an icon-set equivalent keeps the sidebar, the top bar and the
 * table row buttons pixel-identical to the design — lucide's shapes are close
 * but not the same, and the difference shows at 14–17px.
 */
import { cn } from '@/lib/utils'

interface IconProps {
  /** Path data — use a member of `ICON` from lib/nav. */
  d: string
  /** Pixel size; the design uses 14, 15, 16, 17 and 22. */
  size?: number
  strokeWidth?: number
  className?: string
}

export function Icon({ d, size = 17, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <path d={d} />
    </svg>
  )
}
