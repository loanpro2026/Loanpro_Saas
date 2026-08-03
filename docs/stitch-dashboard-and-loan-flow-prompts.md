# LoanPro SaaS — Stitch UI prompts

Use the master prompt together with one screen prompt at a time. Generate both
desktop (1440 × 900) and mobile (390 × 844) variants. The figures below are
domain examples, not hard-coded product data.

## Master product and design prompt

```text
Design a production-grade responsive SaaS application named LoanPro for an
Indian jewellery-backed loan shop. This is an operational counter application,
not a marketing dashboard. A shop owner uses it all day to issue loans secured
by gold or silver, find customers, accept part-payment deposits, settle loans,
track the cash drawer, and reconcile the day. Accuracy, scanning speed and
confidence matter more than decorative visuals.

Visual character:
- Calm, professional, dense but breathable; comparable to a polished modern
  banking operations product.
- White or very light neutral workspace, thin cool-grey borders, subtle shadows,
  deep navy/charcoal typography, and one restrained royal-blue primary colour.
- Gold is a semantic metal colour, silver is a cool grey metal colour. Emerald
  means cash received/success. Amber means cash out/attention. Red is reserved
  for destructive or failed states.
- Avoid a giant dark-blue surface, gradients, glassmorphism, oversized cards,
  huge empty gaps, decorative illustrations, donut charts without meaning, and
  excessive rounded pills.
- Use an 8px spacing system, 12px card radius, crisp 14px body typography,
  tabular numerals for rupee values, and accessible contrast.
- Provide an equally intentional dark mode: deep neutral charcoal surfaces,
  slightly lighter nested cards, visible borders, softened semantic colours,
  and no pure-black background or neon blue.

Application shell:
- Persistent left sidebar on desktop, compact and white/light neutral, with shop
  identity at the top and user identity/sign-out at the bottom.
- Navigation order: Dashboard; View Records (Active, Closed); View Accounts
  (Investment, Returns, Interest); Add New Record; Remove Record; Settings;
  Help & Support.
- Do not add a Deposits navigation item or a direct Deposits page. A deposit is
  always recorded inside an active loan’s full detail page.
- 60px top bar. Keep the global loan search visually centred in the viewport,
  not merely after the sidebar title. Search supports loan number, customer,
  father’s name and location, with Ctrl/Cmd+K.
- Right side of top bar: recent-activity bell, settings, profile avatar. The bell
  opens an anchored recent-activity popover; it never navigates to Help.
- On mobile use a compact header and bottom navigation: Home, Active, Add,
  Settle, Accounts. Do not squeeze the desktop sidebar onto mobile.

Interaction principles:
- Never show a generic “Something went wrong.” State what action failed, which
  record or amount was affected, and confirm that committed data was unchanged.
- Toasts appear bottom-right on desktop and above bottom navigation on mobile.
  Use concise success, contextual error, warning and informational treatments.
- Every async area has its own skeleton or progress state. Do not blank the
  whole screen while one widget loads. Document generation shows named stages.
- Empty states explain why the area is empty and the next valid action.
- Search and entry fields offer inline completion from that shop’s own database;
  Tab or Right Arrow accepts the completion. Never mix data across shops.
- Keyboard navigation, visible focus, minimum 44px mobile targets, and proper
  labels are mandatory.
- Design for at least 3,000 active and 5,000 closed records. Lists and tables are
  server-filtered, paginated/virtualized, have sticky headers, and never render
  thousands of rows at once.
- Keep primary counter workflows within one viewport where practical. Use
  progressive disclosure, tabs, compact summaries, drawers or modals for small
  edits; never create long forms from oversized vertical cards.
```

## Screen 1 — Dashboard

```text
Create the LoanPro operational dashboard using the master system.

Goal: within five seconds the shop owner can answer: How much principal is
currently outstanding? How much cash is physically expected in the drawer?
What moved today? How much gold and silver is in the safe? What needs attention?

Desktop composition, designed for 1440 × 900:
1. Compact page header with “Good morning, Akshat”, a one-line live portfolio
   summary such as “128 active loans · ₹24,80,000 outstanding”, and a primary
   “Add New Record” button. Do not repeat the word Dashboard in a huge heading.
2. Period control aligned with the overview title: Today, Week, Month, Quarter,
   Year. It changes period-flow figures but never changes live balances.
3. First row of four equal metric cards:
   - Active investment: sum of principal of all currently active loans, with
     active-loan count. This is a live balance and ignores the period selector.
   - Investment: principal issued during selected period, with new-loan count.
   - Removals: principal returned from loans settled in selected period, with
     settlement count.
   - Interest: rupee interest charged on settlements in selected period, with
     collection count. Interest is an amount, never a percentage rate.
   Use small semantic icons, strong tabular values and subtle comparison text.
   Do not display a trend percentage when the preceding period is zero.
4. A compact full-width “Today’s cash position” reconciliation card. The right
   side of its header strongly shows Cash in hand; also show Opening balance.
   Below, use a 2×3 or 3×2 compact movement grid:
   positive cash movements: Cash added, Deposits received, Loan returns;
   negative cash movements: Cash removed, New investments, Deposits adjusted.
   Make the signs and colours explicit without relying only on colour.
   Definitions:
   - Deposits received / deposit credit = customer part-payments accepted today,
     cash moving into the drawer.
   - Deposits adjusted / deposit debit = earlier deposits offset against loans
     settled today, removed from the active deposit balance.
   - Cash in hand is a running balance carried from the latest closing day even
     when today has no activity.
5. Main insight area, two-column ratio approximately 2:1:
   - Left: a meaningful Invested vs Returned monthly trend, accessible legend,
     restrained line/area chart, and useful tooltip. Interest may be a secondary
     series, not visually equal to principal.
   - Right: “In the safe” with total pledged value plus two clearly separate
     Gold and Silver blocks. Each block shows principal value, physical weight
     (gold in grams, silver in kilograms), and item/loan count. Add a compact
     value-composition bar. Keep both metals visible when either is zero.
6. Lower compact modules: Latest active loans with loan number/name/date/metal/
   amount; Top locations by active principal; Quick actions containing Find a
   record, Cash, and End of day; Quick reports; Recent activity. These may fall
   below the first viewport, but the first four sections must not require
   scrolling at 1440 × 900.

Critical data rules:
- Never derive active investment from records issued in the selected period.
  It is the sum of all active principal.
- Never show zero merely because one widget request failed. Show a skeleton
  while loading and an inline “Active balance could not be loaded; other figures
  remain available” state on failure.
- Use examples that prove the distinctions: active investment ₹24,80,000;
  today investment ₹1,50,000; removals ₹82,000; interest ₹4,100; opening cash
  ₹3,20,000; deposits received ₹18,000; deposits adjusted ₹7,500; cash in hand
  ₹2,94,600; gold 1,842.5 g / ₹19,60,000 / 94 items; silver 12.480 kg /
  ₹5,20,000 / 34 items.

Bell popover:
- Anchored below the bell, 340–380px wide, heading “Recent activity” and subtitle
  “Committed changes in your shop”. Show the latest six committed events with
  semantic icon, exact description, optional amount and relative time.
- Include skeleton, no-activity and connection-error states. Do not imply unread
  counts unless the product has persisted read state.

Mobile dashboard:
- Keep greeting and Add action compact.
- Period selector horizontally scrolls or uses a compact segmented control.
- Metric cards use a 2-column grid; cash in hand spans both columns.
- Cash movements use two columns; gold and silver remain side-by-side where
  readable, otherwise stack.
- Charts become a compact trend summary with optional expand action. Prioritize
  live balances, today cash, and latest loans above analytics.

Generate these states: populated light mode, widget-loading state, contextual
error state, true empty/new-workspace state, populated dark mode, and mobile.
```

## Screen 2 — Remove Record search

```text
Create the Remove Record entry screen using the LoanPro master system. This is
not a split-view master/detail page. Its single job is to find one active loan,
then navigate to that loan’s full-page detail and settlement workspace.

Initial state:
- Page heading “Remove Record” and subtitle “Find an active loan to add a
  deposit or settle it.”
- A prominent, focused search field supporting loan number, customer name,
  father’s name and location. Provide tenant-owned inline completion; Tab or
  Right Arrow accepts it. Include keyboard result navigation.
- Compact filter row: search field selector if useful, issue date, amount range,
  metal, location and sort. Keep advanced filters collapsed on mobile.
- Do not automatically load or display all active loans. Before a meaningful
  search, show a purposeful empty state: search icon, “Search for an active
  record”, and a short explanation. This prevents accidental selection and an
  unnecessary large query.

Results state:
- Server-filtered list/table with loan number, customer and father’s name,
  location, issue date/age, metal/item, weight, principal, deposit total and
  outstanding principal. Use sticky headings on desktop and compact result cards
  on mobile.
- Show result count and active filters. Paginate or virtualize; never cap silently.
- Clicking anywhere on a result navigates to `/loans/{id}?from=remove-record`
  and opens the complete page. Do not render details beside the results.
- Results have loading skeleton rows, precise no-match copy preserving filters,
  offline cached-results notice, and a retryable query-error state.

Do not include a “Deposits” destination. Adding a deposit begins only after the
user deliberately opens an active loan.
```

## Screen 3 — Full loan detail and settlement workspace

```text
Create a full-page active-loan detail screen opened from Remove Record or Active
Records. It must comfortably handle customer identity, financial history,
collateral, photos, notes, deposits and settlement without becoming a long
unstructured page.

Desktop structure:
- Sticky compact page header with Back to results, loan #, customer name,
  father’s name, location, Active badge, Edit menu, and a visually clear but not
  oversized “Settle loan” primary action.
- Directly below, a financial summary strip: Original principal, Deposits paid,
  Outstanding principal, Suggested interest if closed today, Total due today,
  and days held. Outstanding principal = original principal minus deposits;
  interest is separate until settlement.
- Main body uses a 2:1 layout and compact section navigation/tabs to prevent a
  very long page. Suggested tabs or anchored sections: Overview, Deposits,
  Photos & identity, Remarks, Activity.
- Overview shows customer/contact/address information and collateral details:
  Gold/Silver, item type, weight, issue date, optional additional information.
- A persistent right rail on desktop shows the most decision-critical identity
  and settlement context: pledge photo, collection photo status, verification,
  and current total due. On mobile it becomes normal sections, not a squeezed rail.

Deposits:
- Deposit section shows total deposited, percent of principal repaid, outstanding
  amount, and a chronological table of amount/date/entry status.
- “Add deposit” opens a focused small modal with amount and date, clear effect on
  outstanding principal, Save and Cancel. After saving, update the summary and
  history without navigating away.
- Allow edit/delete only where business permissions allow. Confirm that changing
  historical amount/date recalculates the cash book. A closed loan’s archived
  deposits are read-only.
- Offline deposit capture can be queued; explicitly show “Saved on this device —
  will sync when online” and a pending-sync badge. Never close a loan offline.

Settlement interaction:
- Clicking Settle loan opens a deliberate settlement panel/modal, not an inline
  form always occupying the page.
- Show principal, deposits already paid, outstanding principal, editable rupee
  interest (not a rate), closure date, and a prominent exact “Customer pays now”
  total. Explain the formula in one line.
- Show pledge and collection photo readiness. If a collection photo is required
  and absent, block settlement with a precise action to capture it.
- Final confirmation names the loan number, customer, total received, and states
  that the loan will move to Closed Records while its deposit/cash history is
  preserved. Use “Settle and close loan”; do not use ambiguous “Submit”.
- During commit, lock duplicate actions and show “Settling loan #4471 and
  updating cash history…”. Success toast includes record number and amount.
  Failure says the loan remains active and cash history is unchanged.

Photos and devices:
- On a phone, use direct camera capture. On desktop, provide the existing remote
  phone/Google Cloud Run capture hand-off. Do not redesign facial/fingerprint
  recognition in this screen; leave it as a future carefully planned capability.

Generate populated active-loan desktop and mobile screens, add-deposit modal,
settlement modal, photo-required blocker, loading skeleton, offline queued
deposit state, and a read-only closed-loan variant.
```

## Acceptance checklist for Stitch output

- Dashboard search is centred; bell opens activity and does not open Help.
- Active investment, cash in hand, deposit credit/debit, gold and silver are
  visible without inventing a direct Deposits page.
- Remove Record starts empty and searches active records only.
- A result opens a complete page, never a side-by-side detail pane.
- Deposit and settlement happen inside the full loan page.
- Critical desktop dashboard information fits at 1440 × 900; mobile is genuinely
  rearranged, not scaled down.
- Every screen includes loading, empty, error and dark-mode decisions.
