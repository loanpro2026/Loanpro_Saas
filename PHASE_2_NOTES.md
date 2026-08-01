# Phase 2 — Reports & Dashboard

All seven desktop report types ported, plus the dashboard. 31 July 2026.

---

## Domain conventions preserved exactly

Two quirks in the desktop code look like bugs and are not. Changing either
would make the web figures disagree with years of printed reports the shop
already has in a folder.

**1. `p##m##` item codes mean Mangal Sutra.** Shops type `p22m10`, `P18M5`,
`p24m2` as shorthand for purity and weight on a mangal sutra. The desktop
groups every one of them under a single "Mangal Sutra" row in inventory and
breakdown reports. Ported as `normalize_item_type()`, with tests for the
near-misses that must *not* match: `p22`, `m10`, `p22m`, `xp22m10`, `p22 m10`.

**2. Silver weight is shown in kilograms, gold in grams.** A shop holds a few
hundred grams of gold and tens of kilos of silver. `getJewelleryStock()`
divides silver by 1000 and gold not at all — deliberate, because 47.5kg reads
and 47500g does not.

---

## Migration 009

| Function | Replaces |
|---|---|
| `daily_report` | `getDailyReport()` |
| `investment_report` | `getInvestmentReport()` |
| `returns_report` | `getReturnsReport()` |
| `account_report` | `getAccountReport()` |
| `location_report` | `getLocationReport()` |
| `inventory_report` | `getInventoryReport()` |
| `jewellery_stock` / `jewellery_breakdown` | same names |
| `lending_metrics` | `getLendingMetrics()` |
| `dashboard_stats` | `getDashboardStats()` |
| `chart_data` | `getChartData()` |

All `SECURITY INVOKER`, so RLS scopes every one to the caller's shop without a
tenant argument to get wrong.

### Deliberate improvements over the desktop

- **`daily_report` carries the balance forward.** The desktop returns
  "No report found for 2026-03-15" when a day has no row. A shop that did not
  trade still has cash in the drawer, so the report now shows the last known
  balance and flags `no_activity`.
- **`account_report` omits empty days.** The desktop fills the range with zero
  rows and then filters them back out — a no-op. Omitting them outright makes
  the chart readable; a floor of zeros for every Sunday hides real movement.
- **`location_report` adds a share column.** Concentration is the thing that
  matters: a lender with 70% of their capital in one village is exposed if
  that area has a bad season. The UI warns above 40%.
- **`returns_report` includes `deposits_collected` and `days_held`**, which the
  desktop computes in the renderer.

---

## Bug found: the dashboard used UTC for "today"

```js
const today = new Date().toISOString().split('T')[0]   // UTC
```

After 18:30 UTC — 
midnight IST — this returns tomorrow's date. A shop
open in the evening would have seen an empty dashboard: no deposits, no cash
row, zeros across the board, with their actual day's trading apparently
missing.

Same class as the migration timezone issue, different place. Every date in
migration 009 resolves through `(now() AT TIME ZONE 'Asia/Kolkata')::date`.

Worth grepping for `toISOString().split` elsewhere before launch — the pattern
is easy to reach for and wrong here every time.

---

## UI

- `/reports` — one workspace, six reports. Single page rather than six, because
  checking the day's books usually means looking at two or three in a row, and
  switching pages loses the selected date. **The nav already linked here; the
  page did not exist.**
- CSV export on every report — with a UTF-8 BOM (Excel mangles rupee signs and
  Indian names without it) and proper quoting for the commas, quotes and
  newlines that appear in real addresses and remarks.
- Dashboard rebuilt on `lending_metrics` and `jewellery_stock`: four metric
  cards with sparklines, safe contents with a gold breakdown, activity feed,
  latest loans.
- Sparklines are inline SVG, not Recharts — four render per dashboard load and
  mounting a chart library for five data points is not worth it.

---

## Verification

```
npm test
```

| Check | Result |
|---|---|
| Report logic (`reports.test.mjs`) | ✅ 47 assertions |
| Migration row mapping | ✅ 57 assertions, 4 timezones |
| Cash ledger | ✅ 16 assertions |
| `.rpc()` → granted function | ✅ 22 RPCs, 0 problems |
| TS/TSX syntax | ✅ 78 files |
| Imports resolve | ✅ 0 problems |
| SQL parses | ✅ 251 statements, 10 files |

The report tests cover the cases that would produce a plausible-looking wrong
number: which strings match the `p##m##` pattern, silver not rounding to zero
at 250g, percentage change against a zero base, CSV quoting.

**Still not run:** `next build`, `tsc --noEmit`. Unchanged from Phase 0 — npm
install exceeds the sandbox's per-command limit.

---

## Known gaps

- **No PDF export.** CSV only. The desktop uses jsPDF client-side and that code
  is portable, but a shop that prints reports for its accountant will want PDF.
- **`chart_data` and `dashboard_stats` have no UI yet** — the functions exist
  and are tested, but nothing calls them. The 12-month chart is the obvious
  next addition.
- **Reports have no pagination.** A year of loans in `location_report` is fine;
  `investment_report` for a single day is fine. `account_report` over five
  years would be a long table.
- **Historical `daily_cash_summary` rows differ from the desktop** for shops
  with closed loans — see PHASE_1_NOTES. The final balance agrees; intermediate
  `deposit_credit` does not, and ours is the correct one.
- **`/deposits` and `/cash` pages** still query tables directly rather than
  using the Phase 1 RPCs.

---

## Remaining desktop parity

| Feature | Status |
|---|---|
| Loans, deposits, cash, search | ✅ Phase 1 |
| All seven reports, dashboard | ✅ Phase 2 |
| Photo capture (browser + phone relay) | ✅ Phase 0/1 |
| Migration from desktop | ✅ tooling ready |
| Fingerprint | ❌ desktop-only by design |
| Google Drive backup | ➖ replaced by Supabase PITR |
| Support tickets | ⬜ deferred — hand-onboarding makes this low value |
| Staff accounts, settings, app lock | ⬜ Phase 4 |
| PWA offline shell | ⬜ Phase 4, and the biggest genuine regression vs desktop |

The offline question from §12 of the plan is still open and still the most
important one. The desktop works with no internet; this does not.
