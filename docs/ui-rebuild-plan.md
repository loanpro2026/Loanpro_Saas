# LoanPro SaaS UI rebuild plan

## Product principle

LoanPro is counter software, not a content website. The interface must optimise
for repeated, time-sensitive tasks while a customer is waiting. Desktop screens
should be dense without feeling cramped; mobile screens should become a clear
single-column sequence with large touch targets.

The Electron app remains the functional reference, but its decorative choices
are not copied blindly. The web app uses one neutral visual system, one spacing
scale, one loading language, and one notification surface.

## Primary user flows

1. **Start the day** — sign in, see cash/exposure status, recent activity and
   actions requiring attention. The dashboard is a decision surface, not a wall
   of charts.
2. **Create a record** — date, customer, loan/item, optional photo, review and
   save. At desktop counter sizes (1280×720 and above), the normal form fits in
   the available app viewport without document scrolling. Mobile keeps the same
   order in a single scrollable column.
3. **Find a record** — global search from anywhere, or scoped active/closed
   search. Loan number wins; name, father and location complete from the shop's
   own records. Keyboard users can accept a completion with Tab or Right Arrow
   and open a result with Enter.
4. **Work on a record** — one identity header followed by balance, deposits,
   photo and remarks. Frequent actions are visible; destructive actions stay in
   a clearly labelled menu with confirmation.
5. **Settle a record** — search, verify the customer/loan, review principal,
   deposits and calculated interest, then close. It must never feel like a
   second data-entry form.
6. **Manage daily money** — cash and deposits use compact ledgers with date and
   totals always visible. Adding/removing money is a focused dialog.
7. **Review the business** — reports share one date/filter bar and render into a
   bounded workspace. Export/PDF progress stays visible until the file is ready.
8. **Configure and recover** — settings, devices, export and support are grouped
   by intent. They do not compete with counter actions in primary navigation.

## Navigation and shell

- Light mode uses a white/neutral sidebar, not a dark-blue block.
- Dark mode uses charcoal surfaces with restrained blue accents, never inverted
  hard-coded utility colours.
- Active navigation is a soft tint plus strong label/icon, not a filled pill.
- Top search remains available on every desktop page and opens with Ctrl/Cmd+K.
- Mobile uses the five high-frequency destinations in a safe-area bottom bar.
- Content width is bounded at 1600px and uses the available viewport instead of
  stacking narrow cards in the centre.

## Density and scrolling rules

- 60px application header, 40px page heading, 36–40px inputs and buttons.
- Desktop forms use grouped grids inside one workspace rather than one card per
  section.
- Page scrolling is allowed for dashboards and long reports, but creation,
  settlement and focused dialogs should fit the viewport at 1280×720 whenever
  optional content permits.
- Tables scroll inside their own bounded region on desktop; mobile records turn
  into readable rows/cards instead of forcing horizontal page scrolling.
- Sticky actions are used only when the action would otherwise leave view.

## Feedback model

- Route loading: shell-shaped skeleton matching the destination density.
- Data loading: skeleton rows or an in-place overlay that preserves layout.
- Action loading: spinner plus the exact ongoing verb on the initiating button.
- Document loading: persistent notification with the report/export name, then
  success or a recoverable failure.
- Toasts: bottom-right neutral cards with a semantic rail/icon, a short title,
  specific message and dismiss action. Mobile keeps them above bottom navigation.

## Database line completion

- Customer name, father name, location and jewellery type query tenant-scoped
  values ordered by usage.
- The strongest prefix match appears as inline ghost text.
- Tab or Right Arrow accepts the remainder; arrows navigate the full suggestion
  list; Enter selects the highlighted item.
- Empty focused fields show frequently used values, which speeds repeated entry.
- Global and record-list search derive completions from actual matching loans,
  never from a shared/global dictionary.
- Completion failures remain silent and never block typing or saving.

## Delivery sequence

1. Shared tokens, shell, navigation, controls, toast and loading primitives.
2. Add Record reference workflow and line completion.
3. Active/closed lists, filters, large-table states and loan detail.
4. Settlement, deposits, cash and day-end.
5. Dashboard and reports.
6. Settings, authentication, support and remaining secondary screens.
7. Authenticated visual QA at desktop, tablet and phone breakpoints, followed by
   accessibility, regression and production-build validation.
