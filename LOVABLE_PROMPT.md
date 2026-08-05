# Lovable prompt — LoanPro design reference build

Lovable cannot produce Next.js, and our production app is Next.js App Router with Server Components, server actions and an offline write queue. So Lovable is **not** building the app. It is building a **static design reference** — the same screens, with mock data, in a Vite project — which we then port into the real app by hand.

Everything below the line is the prompt. Paste it into Lovable on a fresh project.

---

## What you are building

A **static, front-end-only design reference** for **LoanPro** — a SaaS used by gold- and silver-loan shops in India (pawn brokers). Shopkeepers use it at a counter, all day, with a customer standing in front of them. Money, jewellery weights and identity photos are on every screen.

Your output is a set of screens that will be **read and copied by a developer**, not deployed. The value of this project is in the markup and the Tailwind classes. Optimise for that.

**Do not build:** authentication, a database, Supabase, API calls, `fetch`, forms that submit anywhere, or real routing logic. Every screen renders from a hard-coded mock object.

**Do not connect Supabase or any backend integration**, even if prompted to. If you think a screen needs live data, use mock data instead.

---

## Non-negotiable: the token contract

The real app's theme must be reproduced **exactly**, so the class strings you write can be copied across unchanged. Put this in `src/index.css` verbatim. Do not rename, add to, or "improve" these values.

```css
@layer base {
  :root {
    --bg:        244 245 247;
    --surface:   255 255 255;
    --surface2:  248 249 251;
    --border:    229 232 238;
    --text:       27  36  55;
    --text2:      92 103 132;
    --text3:     138 147 168;

    --primary:    37  87 214;
    --primary-tint: rgba(37, 87, 214, .08);
    --primary-200: 188 206 245;
    --primary-300: 143 171 236;
    --primary-400:  92 132 226;
    --primary-700:  28  70 171;

    --gold:      161  98   7;   --gold-bg:   #faf3e0;
    --silver:     91 100 114;   --silver-bg: #eef1f5;
    --green:      10 125  84;   --green-bg:  #e8f6ef;
    --amber:     180  83   9;   --amber-bg:  #fdf1e2;
    --red:       217  45  32;   --red-bg:    #fdecec;

    --shadow:        0 1px 2px rgba(16, 24, 40, .06);
    --shadow-hover:  0 4px 14px -6px rgba(16, 24, 40, .16);
    --shadow-menu:   0 8px 24px rgba(16, 24, 40, .14);
    --shadow-modal:  0 16px 40px rgba(16, 24, 40, .20);
    --scrim:         rgba(15, 20, 30, .45);
  }

  .dark {
    color-scheme: dark;
    --bg:         20  22  25;
    --surface:    29  32  37;
    --surface2:   35  39  45;
    --border:     47  52  60;
    --text:      231 234 240;
    --text2:     154 163 181;
    --text3:     112 122 140;

    --primary:   111 151 238;
    --primary-tint: rgba(111, 151, 238, .13);
    --primary-200:  60  82 128;
    --primary-300:  78 108 168;
    --primary-400:  94 129 200;
    --primary-700: 145 176 243;

    --gold:      212 165  69;   --gold-bg:   rgba(212, 165, 69, .13);
    --silver:    154 166 184;   --silver-bg: rgba(154, 166, 184, .13);
    --green:      52 185 138;   --green-bg:  rgba(52, 185, 138, .13);
    --amber:     224 154  62;   --amber-bg:  rgba(224, 154, 62, .13);
    --red:       229 100  92;   --red-bg:    rgba(229, 100, 92, .13);

    --shadow: none;  --shadow-hover: none;
    --shadow-menu:   0 8px 24px rgba(0, 0, 0, .45);
    --shadow-modal:  0 16px 40px rgba(0, 0, 0, .55);
    --scrim:         rgba(0, 0, 0, .58);
  }
}
```

Expose them in `tailwind.config.ts` under exactly these names:

```ts
colors: {
  ink:     { DEFAULT: 'rgb(var(--text) / <alpha-value>)',
             muted:   'rgb(var(--text2) / <alpha-value>)',
             faint:   'rgb(var(--text3) / <alpha-value>)' },
  surface: { DEFAULT: 'rgb(var(--bg) / <alpha-value>)',
             card:    'rgb(var(--surface) / <alpha-value>)',
             border:  'rgb(var(--border) / <alpha-value>)',
             muted:   'rgb(var(--surface2) / <alpha-value>)' },
  primary: { DEFAULT: 'rgb(var(--primary) / <alpha-value>)', tint: 'var(--primary-tint)' },
  gold:    { DEFAULT: 'rgb(var(--gold) / <alpha-value>)',   bg: 'var(--gold-bg)' },
  silver:  { DEFAULT: 'rgb(var(--silver) / <alpha-value>)', bg: 'var(--silver-bg)' },
  green:   { DEFAULT: 'rgb(var(--green) / <alpha-value>)',  bg: 'var(--green-bg)' },
  amber:   { DEFAULT: 'rgb(var(--amber) / <alpha-value>)',  bg: 'var(--amber-bg)' },
  red:     { DEFAULT: 'rgb(var(--red) / <alpha-value>)',    bg: 'var(--red-bg)' },
}
```

Type scale, named by pixel value — add these to `fontSize`:
`text-10` `text-10.5` `text-11` `text-11.5` `text-12` `text-12.5` `text-13` `text-13.5` `text-14.5` `text-15.5` `text-17` `text-19` `text-22`

Radii: `rounded-md` = 7px, `rounded-lg` = 8px, `rounded-xl` = 10px, `rounded-2xl` = 12px (cards).
Shadows: `shadow-card` = `var(--shadow)`, `shadow-menu`, `shadow-modal`.

Font: **IBM Plex Sans**, 400/500/600/700. Money and weights always `tabular-nums`.

### Rules that make this portable

1. **Never write a raw hex, `rgb()`, `hsl()` or an arbitrary Tailwind colour** in a component. Only the class names above. If you need a shade that doesn't exist, add a CSS variable to *both* `:root` and `.dark` and expose it in the config.
2. **Do not use shadcn/ui components in any screen.** Do not use Radix. Do not use shadcn's `--background`/`--foreground` HSL variables — they are not our theme and anything built on them will be thrown away. Build the small component set below instead, with plain Tailwind.
3. **Do not add npm packages** beyond what a Vite + React + TypeScript + Tailwind project starts with, plus `lucide-react` and `recharts`.
4. **No `class-variance-authority`, no `tailwind-variants`.** Plain conditional class strings, joined with a small `cn()` helper (`clsx` + `tailwind-merge` only).

---

## The component set — build these, with these exact APIs

We already have components with these names and props in the real app. Matching them means a screen file can be copied across almost untouched. Put them in `src/components/ui/`.

```ts
// Button.tsx
variant: 'primary' | 'secondary' | 'tinted' | 'success' | 'warn' | 'danger' | 'ghost'  // default 'primary'
size:    'mini' | 'setting' | 'sm' | 'md' | 'lg' | 'icon'                              // default 'md'
loading?: boolean
// heights: mini 30px, setting/sm 32px, md 36px, lg 38px, icon 34×34

// Input.tsx
label?, error?, helper?, optional?: boolean
fieldSize: 'mini' | 'md' | 'lg' | 'xl'   // 32 / 38 / 40 / 44px, default 'md'
// also export Textarea with label?, error?, helper?, optional?

// Select.tsx
label?, error?, placeholder?, options: { value: string; label: string }[]
fieldSize: 'mini' | 'md' | 'lg'          // default 'lg'

// Badge.tsx
variant: 'gold' | 'silver' | 'active' | 'closed' | 'warning' | 'danger' | 'info'
// plus: MetalBadge({ metal: 'Gold' | 'Silver' })
// shape: 5px radius, 2px/8px padding, 11px/700, uppercase — a rectangle, not a pill

// Modal.tsx
open, onClose, title?, subtitle?, danger?: boolean
size: 'sm' | 'md' | 'lg' | 'xl'          // 400 / 420 / 460 / 672px
// bottom sheet below sm breakpoint; Escape closes; focus trapped and restored

// EmptyState.tsx
icon?, title, description?, action?
// dashed border card with a round icon chip

// Page.tsx — exports PageHeader, Card, CardHeader, StatCard, StatStrip, StatStripCell
PageHeader   { title, subtitle?, actions? }
Card         { flush?: boolean, accent?: boolean }
CardHeader   { title, meta?, action? }
StatCard     { label, value, sub?, tone?: 'default'|'green'|'amber'|'red'|'primary', badge? }
StatStrip    { columns?: 2|3|4|5|6 }      // figures fused into one card, hairline dividers
StatStripCell{ label, value, sub?, tone?, highlight?: boolean }
```

Also define these reusable classes in `index.css` (`@layer components`), since the real app uses them: `.card`, `.card-flush`, `.card-title`, `.page-title`, `.page-subtitle`, `.section-kicker`, `.btn-*`, `.input`, `.input-lg`, `.input-xl`, `.input-mini`, `.input-money`, `.textarea`, `.select`, `.select-mini`, `.label`, `.badge-*`, `.grid-head`, `.grid-row`, `.grid-foot`, `.stat-card`, `.menu-panel`, `.menu-item`, `.modal-scrim`, `.modal-panel`, `.modal-actions`, `.note-green`, `.note-amber`, `.note-blue`, `.toggle`, `.skeleton`, `.empty-state`.

---

## Project structure

```
src/
  index.css                 tokens + component classes (above)
  mock/data.ts              ALL fake data, one file, exported as named consts
  components/ui/*           the component set above
  components/layout/        Sidebar, TopBar, BottomNav, NotificationMenu
  screens/                  one file per screen, default-exported, NO data fetching
  App.tsx                   a plain screen switcher for previewing (see below)
```

`App.tsx` is a **preview harness**, not an app. A left rail listing every screen, plus two toggles pinned somewhere obvious:

- **Theme:** light / dark
- **State:** populated / loading / empty / error / offline

Every screen must accept `state` as a prop and render correctly in all five. This is the point of the exercise — states are where the current app is weakest, and I need to see them, not be told they exist.

No React Router. No TanStack Router. No TanStack Query. Screen switching is `useState`.

---

## The screens

The real app has these. Build each one. The content listed is what the screen shows — keep the information architecture, improve the execution.

**App shell** (wraps every app screen)
Sidebar 232px: shop name + plan, nav in four labelled sections — Dashboard / VIEW RECORDS (Active, Closed) / VIEW ACCOUNTS (Investment, Returns, Interest) / ACTIONS (Add New Record, Remove Record, Cash & Day-end) / SYSTEM (Settings, Help & Support) — and the signed-in owner pinned to the bottom with a sign-out control. Top bar 60px: page title left, search centred with a `Ctrl K` hint, then theme toggle, activity bell, settings, avatar. Phone: sidebar hidden, bottom nav of five.

**Dashboard** — greeting; period switch (Today/Week/Month/Quarter/Year); four figures (Active investment with a LIVE pill, Investment, Removals, Interest); "Current financial position" card with cash in hand plus add/remove cash buttons and three deposit figures; "Invested vs returned · last 12 months" line chart; "In the safe" gold vs silver split; latest active loans list; quick actions; top locations by active principal.

**Active Records / Closed Records** — toolbar (search field selector, search box, search button, metal filter, sort); table of Amount, Customer, Father's name, Location, Issued (or Closed), Metal, Type, Weight, row actions (edit, delete); footer with a count and a numbered pager.

**Loan detail** — two modes. *Read-only* (arrived from records): back, customer avatar, name, status badge, address line, Edit and Delete. *Settlement workspace* (arrived from Remove Record): the same, but Add deposit and Settle loan instead, plus a "Customer pays if settled today" card. Both show a four-cell strip (Loan amount, Deposits paid, Interest, Days held with a date range), a Collateral card, a Deposits table, a Remarks log, and an "Identity on file" panel with the pledge photo and the collection photo.

**Add New Record** — see the frozen field list below.

**Remove Record** — the only route to settling a loan. Header with Active loans / Settled today counters. A prominent 44px search bar with a "search by" selector, search and clear. Four narrowing filters (metal, amount band, duration held, sort). Nothing listed until a search runs — design that empty state properly, it is the default view. Results table: Amount (with outstanding beneath), Customer (with S/o), Location, Issued, Metal, Type & weight, Days held.

**Cash & Day-end** — date and last-closed line; add/remove cash buttons; three figures (Opening balance, Net movement today, Cash in hand); today's cash ledger (Time, Entry, In, Out, Balance); an end-of-day panel with the expected closing and a link to review and close; previous closings.

**View Accounts — Investment / Returns / Interest** — date range and export; three summary figures; a by-day bar chart; a table with a period total.

**Settings** — four sections (Business, Preferences, Security, Data) as settings rows: a title and description on the left, the control on the right. Covers interest rate, language, theme, identity-photo requirement, capture device and pairing, backup, export, import, shop name, shortcuts, plan and billing, staff, screen lock.

**Help & Support** — guide articles as expandable cards, and a support ticket list with a "raise a ticket" form.

**Login / Register / Forgot password / Reset password** — one centred 400px card on the app background, LP mark and brand at the top.

**Public pages — the weakest surfaces today, treat them as a priority**
Landing (`/`), About, Support (contact form), Privacy, Terms, Refunds. Same tokens as the app. Landing needs a clear hero with one call to action, an honest feature section (loan register, deposits and settlement, cash and day-end, reports, identity photos, works offline, any device), trial/pricing clarity, and a real footer. Legal pages need long-form typography: ~70-character measure, proper heading hierarchy, a table of contents on the long ones. **No invented testimonials, logos, customer counts or statistics.**

---

## Frozen: the Add New Record fields

The real form is wired to a database and a validation schema. You may restyle it completely — spacing, grouping, section headings, the photo panel, the footer, responsive behaviour, focus and error treatment — but the fields themselves are fixed. **Do not add, remove, rename, reorder into different groups, or change the type of any field.**

Personal information: **Customer name*** · **Father's name** · **Location** · **Address** · **Additional customer information**
Loan details: **Loan amount (₹)*** · **Metal*** (Gold / Silver, two buttons — not a dropdown) · **Jewellery type** · **Weight (grams)** · **Loan date*** · **Additional information**
Aside: **Customer photo** panel with a capture control.
Footer: cash-in-hand-after-this-loan line, Cancel, Create loan record.

Weight is entered in **grams for both metals** — do not "fix" this to kg for silver.

---

## Domain rules that must show up in the design

- Currency is **₹ with Indian digit grouping** — `₹24,80,000`, not `₹2,480,000`.
- Gold is weighed in **grams**, silver in **kilograms**, when *displaying* stock and collateral.
- **Interest is always a rupee amount, never a rate**, on every screen that shows it.
- Colour carries meaning: green = money arriving, amber = money leaving, red = destructive, gold/silver = the metal, primary = the action. Nothing decorative may use those colours.
- Indian names, places and amounts in the mock data (Ramesh Kumar, Sarafa Bazaar, Indore). Realistic figures — loans of ₹24,000 to ₹98,000, a book of around 128 active loans.

---

## Priorities, in order

**1 — Visual polish and density.** One spacing rhythm, one type hierarchy, optical alignment, consistent icon sizes and stroke weights, `tabular-nums` on every figure, right-aligned money columns. These are working screens on a counter machine: the first row of real data must be visible without scrolling on a 1366×768 laptop. Verify every screen in dark mode, including charts and tinted backgrounds.

**2 — States and feedback.** Every screen complete in all five states. Loading = skeletons shaped like the real layout, so nothing jumps when data arrives; never a bare full-page spinner. Empty = specific and useful, with the action that resolves it. Error = say what failed, what is unaffected, what to do next; never a raw exception. Offline = a clear banner and per-value "unavailable offline" markers, never a `0` standing in for unknown. Plus: consistent form error placement, visible focus rings, disabled and loading buttons, one confirmation pattern for every destructive action, and one toast style. Transitions 150–200ms, and respect `prefers-reduced-motion`.

**3 — Mobile and responsive.** Everything works from 360px with no horizontal scroll and no text under 12px. Tables become readable stacked cards keeping amount, customer and date — not a squeezed nine-column grid. Loan detail reflows to one column with the settlement figure and primary action reachable. Forms go single-column with a sticky action bar. Modals become bottom sheets and stay usable with the keyboard open. Tap targets ≥ 44×44px.

**4 — Public pages.** As described above.

---

## Copy and tone

Plain British English. Specific, never chirpy. No exclamation marks, no "Oops!", no "Something went wrong" without saying what and what it means for their records. An error should read like: *"Cash position could not be loaded. Loan and portfolio figures remain available and no committed data was changed."*

---

## Definition of done

- Every screen renders in all five states and both themes from `App.tsx`, with no console errors.
- No raw colour values anywhere in `src/components` or `src/screens`.
- No shadcn, no Radix, no router, no data fetching, no Supabase.
- All mock data in `src/mock/data.ts`.
- TypeScript compiles with no errors.

When you finish, list: every screen file you created, any pattern you introduced that isn't in the component set above, and anything in this brief you couldn't do.
