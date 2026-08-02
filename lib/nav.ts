/**
 * The application's navigation, ported from the desktop app.
 *
 * Source: electron_app/renderer/src/layout.tsx. The labels, the order and the
 * grouping are the desktop's, deliberately — a shop that has used LoanPro for
 * years navigates by muscle memory, and renaming "Add New Record" to "New Loan"
 * or folding Active and Closed into one filtered table costs them more than any
 * tidier structure gains.
 *
 * What the web changes, and why:
 *
 *   • Every destination is a real URL rather than a modal. The desktop opens
 *     deposits, cash and all seven reports as modals over the Dashboard, which
 *     is fine in a single window but breaks Back, refresh, bookmarking and
 *     phone screens in a browser.
 *
 *   • Three desktop items are gone because they have no meaning here:
 *     Updates (a web app is always current), Database Setup (Supabase is
 *     managed), and Google Drive Backup (replaced by a user-initiated export).
 *     Leaving them in the menu would promise something that is not there.
 */
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, FolderOpen, FileText, Archive, Wallet,
  TrendingUp, TrendingDown, Percent, PlusCircle, MinusCircle,
  Settings, LifeBuoy, MessageSquare,
} from 'lucide-react'

export interface NavLeaf {
  href: string
  label: string
  icon: LucideIcon
  /** Shown under the label on wide screens. */
  hint?: string
}

export interface NavGroup {
  label: string
  icon: LucideIcon
  /** A group is open when the current path is inside it. */
  match: string
  children: NavLeaf[]
}

export type NavEntry = NavLeaf | NavGroup

export function isGroup(e: NavEntry): e is NavGroup {
  return 'children' in e
}

/**
 * Mirrors the desktop sidebar top to bottom.
 *
 * Note the order: the two things a shopkeeper does at the counter — take a
 * loan in, settle one — sit BELOW the browsing screens on the desktop, and
 * stay there. It looks wrong on paper and is right in practice: the browsing
 * items are what you land on, the actions are what you reach for.
 */
export const NAV: NavEntry[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    label: 'View Records',
    icon: FolderOpen,
    match: '/view-records',
    children: [
      { href: '/view-records/active', label: 'Active',  icon: FileText, hint: 'Loans still out' },
      { href: '/view-records/closed', label: 'Closed',  icon: Archive,  hint: 'Settled loans' },
    ],
  },
  {
    label: 'View Accounts',
    icon: Wallet,
    match: '/view-accounts',
    children: [
      { href: '/view-accounts/investment', label: 'Investment', icon: TrendingDown, hint: 'Money lent out' },
      { href: '/view-accounts/returns',    label: 'Returns',    icon: TrendingUp,   hint: 'Money coming back' },
      { href: '/view-accounts/interest',   label: 'Interest',   icon: Percent,      hint: 'Interest charged' },
    ],
  },
  {
    href: '/add-record',
    label: 'Add New Record',
    icon: PlusCircle,
  },
  {
    href: '/remove-record',
    label: 'Remove Record',
    icon: MinusCircle,
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
  },
  {
    label: 'Help & Support',
    icon: LifeBuoy,
    match: '/help',
    children: [
      { href: '/help',                 label: 'Help',            icon: LifeBuoy },
      { href: '/help/support-tickets', label: 'Support Tickets', icon: MessageSquare },
    ],
  },
]

/**
 * The five destinations on the phone's bottom bar.
 *
 * A bottom bar holds five comfortably and the desktop has no equivalent to
 * copy, so this is a judgement call: the two counter actions plus the three
 * places you look things up. Settings and Help live behind the header menu,
 * as they are rarely needed mid-transaction.
 */
export const MOBILE_NAV: NavLeaf[] = [
  { href: '/dashboard',           label: 'Home',    icon: LayoutDashboard },
  { href: '/view-records/active', label: 'Active',  icon: FileText },
  { href: '/add-record',          label: 'Add',     icon: PlusCircle },
  { href: '/remove-record',       label: 'Settle',  icon: MinusCircle },
  { href: '/view-accounts/returns', label: 'Accounts', icon: Wallet },
]

/** True when `href` is the current page, or an ancestor of it. */
export function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(`${href}/`)
}
