/**
 * The application's navigation.
 *
 * Structure and labels follow the LoanPro design reference: a flat list under
 * four always-visible section headers (VIEW RECORDS, VIEW ACCOUNTS, ACTIONS,
 * SYSTEM) rather than collapsible groups. Nothing is hidden behind a disclosure
 * — every destination in the shop is one click from anywhere, which is what a
 * counter app needs and what the desktop app trained people to expect.
 *
 * Icons are carried as raw SVG path data, taken from the design, so the
 * sidebar renders the same glyphs at the same 1.8 stroke weight rather than an
 * approximation from an icon set.
 *
 * Three desktop items are deliberately absent: Updates (a web app is always
 * current), Database Setup (Supabase is managed) and Google Drive Backup
 * (replaced by a user-initiated export). Leaving them in the menu would promise
 * something that is not there.
 */
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, FileText, Wallet, PlusCircle, MinusCircle,
} from 'lucide-react'

/** The design's icon set, as `d` attributes on a 24×24 viewBox. */
export const ICON = {
  dashboard: 'M3 3h8v8H3zM13 3h8v5h-8zM13 12h8v9h-8zM3 15h8v6H3z',
  record:    'M6 3h9l4 4v14H6zM9 9h7M9 13h7M9 17h5',
  account:   'M3 7h17v12H3zM3 10h17M15 14h3',
  add:       'M12 5v14M5 12h14',
  remove:    'M12 3a9 9 0 100 18 9 9 0 000-18zM8 12h8',
  cash:      'M2 7h20v10H2zM12 10a2 2 0 100 4 2 2 0 000-4z',
  settings:  'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1',
  help:      'M12 3a9 9 0 100 18 9 9 0 000-18zM9.8 9.5a2.2 2.2 0 113.4 1.9c-.8.5-1.2 1-1.2 1.9M12 16.8v.2',
  signOut:   'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  search:    'M10 4a6 6 0 100 12 6 6 0 000-12zM14.5 14.5L20 20',
  bell:      'M6 16v-5a6 6 0 1112 0v5l1.5 2h-15zM10 20a2 2 0 004 0',
  moon:      'M20 14A8 8 0 1110 4a6.5 6.5 0 0010 10z',
  sun:       'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4',
  edit:      'M4 20h4L20 8l-4-4L4 16z',
  trash:     'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  trashSlim: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  person:    'M12 11a4 4 0 100-8 4 4 0 000 8zM4.5 21a7.5 7.5 0 0115 0',
  camera:    'M3 8h3l2-3h8l2 3h3v12H3zM12 17a4 4 0 100-8 4 4 0 000 8z',
  plus:      'M12 5v14M5 12h14',
} as const

export interface NavLeaf {
  href: string
  label: string
  /** SVG path data from `ICON`. */
  d: string
  /** Sits under a section header, so it carries a 14px icon indent. */
  nested?: boolean
  /** Also treat these prefixes as "you are here" — for routes that live
   *  under a different URL than the nav entry (e.g. day-end under Cash). */
  also?: string[]
}

export interface NavSection {
  /** Uppercase section header. Absent for the leading Dashboard entry. */
  heading?: string
  items: NavLeaf[]
}

export const NAV: NavSection[] = [
  {
    items: [
      { href: '/dashboard', label: 'Dashboard', d: ICON.dashboard },
    ],
  },
  {
    heading: 'VIEW RECORDS',
    items: [
      { href: '/view-records/active', label: 'Active', d: ICON.record, nested: true, also: ['/loans'] },
      { href: '/view-records/closed', label: 'Closed', d: ICON.record, nested: true },
    ],
  },
  {
    heading: 'VIEW ACCOUNTS',
    items: [
      { href: '/view-accounts/investment', label: 'Investment', d: ICON.account, nested: true, also: ['/reports'] },
      { href: '/view-accounts/returns',    label: 'Returns',    d: ICON.account, nested: true },
      { href: '/view-accounts/interest',   label: 'Interest',   d: ICON.account, nested: true },
    ],
  },
  {
    heading: 'ACTIONS',
    items: [
      { href: '/add-record',    label: 'Add New Record', d: ICON.add },
      { href: '/remove-record', label: 'Remove Record',  d: ICON.remove },
      { href: '/cash',          label: 'Cash & Day-end', d: ICON.cash, also: ['/day-end', '/deposits'] },
    ],
  },
  {
    heading: 'SYSTEM',
    items: [
      { href: '/settings', label: 'Settings',       d: ICON.settings, also: ['/billing'] },
      { href: '/help',     label: 'Help & Support', d: ICON.help },
    ],
  },
]

/** Flat list of every destination, for title lookup and shortcuts. */
export const NAV_LEAVES: NavLeaf[] = NAV.flatMap(section => section.items)

/**
 * The page title shown at the left of the top bar.
 *
 * Sectioned entries read as "View Records · Active", the way the design writes
 * them, so the title says where you are inside the sidebar and not just which
 * table you are looking at.
 */
const TITLES: Array<[string, string]> = [
  ['/view-records/active',     'View Records · Active'],
  ['/view-records/closed',     'View Records · Closed'],
  ['/view-accounts/investment','View Accounts · Investment'],
  ['/view-accounts/returns',   'View Accounts · Returns'],
  ['/view-accounts/interest',  'View Accounts · Interest'],
  ['/help/support-tickets',    'Help & Support · Tickets'],
  ['/dashboard',               'Dashboard'],
  ['/add-record',              'Add New Record'],
  ['/remove-record',           'Remove Record'],
  ['/cash',                    'Cash & Day-end'],
  ['/day-end',                 'Cash & Day-end · Closing'],
  ['/deposits',                'Cash & Day-end · Deposits'],
  ['/loans',                   'View Records · record detail'],
  ['/reports',                 'View Accounts · Reports'],
  ['/settings',                'Settings'],
  ['/billing',                 'Settings · Plan & billing'],
  ['/help',                    'Help & Support'],
]

export function pageTitle(pathname: string): string {
  return TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? 'LoanPro'
}

/**
 * The five destinations on the phone's bottom bar.
 *
 * A bottom bar holds five comfortably and the design is desktop-only here, so
 * this is a judgement call: the two counter actions plus the three places you
 * look things up. Settings and Help stay in the header menu, as they are rarely
 * needed mid-transaction.
 */
export interface MobileNavLeaf {
  href: string
  label: string
  icon: LucideIcon
}

export const MOBILE_NAV: MobileNavLeaf[] = [
  { href: '/dashboard',             label: 'Home',     icon: LayoutDashboard },
  { href: '/view-records/active',   label: 'Active',   icon: FileText },
  { href: '/add-record',            label: 'Add',      icon: PlusCircle },
  { href: '/remove-record',         label: 'Settle',   icon: MinusCircle },
  { href: '/view-accounts/returns', label: 'Accounts', icon: Wallet },
]

/** True when `href` is the current page, or an ancestor of it. */
export function isActive(pathname: string, href: string, also?: string[]): boolean {
  const hit = (h: string) =>
    h === '/dashboard' ? pathname === '/dashboard' : pathname === h || pathname.startsWith(`${h}/`)
  return hit(href) || (also?.some(hit) ?? false)
}
