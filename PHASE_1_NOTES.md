# Phase 1 — Core CRUD

Loans, deposits, cash movements, search. Completed 31 July 2026.

---

## The main architectural decision

**Multi-table writes live in Postgres functions, not TypeScript.**

Closing a loan touches five tables and shifts a running cash balance:

```
archive deposits → snapshot for the removal report → delete active deposits
→ flag the photo archived → mark the loan closed → log the activity
→ re-chain every later day's cash balance
```

Doing that as six round trips from a serverless function means a cold start or
a dropped connection can leave a shop's books half-updated — deposits archived
but the loan still open, or cash counted twice. As one `close_loan()` call it
either all happens or none of it does.

The server actions in `app/(app)/loans/actions.ts` validate input, call the
function, revalidate pages, and translate Postgres errors into something a shop
owner can act on. They are a thin layer on purpose.

---

## What was built

### Migration 007 — cash and closing

| Function | Purpose |
|---|---|
| `recalculate_cash_summary` | The running-balance engine. Internal only. |
| `recalculate_my_cash_summary` | Client-safe wrapper — reads tenant from the session |
| `create_loan` | Insert + activity log + cash recalculation, atomically |
| `close_loan` | Ports `removeRecord()` from the desktop |
| `reopen_loan` | **New** — undo a mistaken closure |
| `record_cash_transaction` | Cash in/out with a reason |
| `add_deposit` / `delete_deposit` | Deposits, each adjusting the balance |

### Migration 008 — search

`search_loans`, `field_suggestions`, `loan_detail`, `distinct_locations`, plus
trigram indexes so `ILIKE '%term%'` doesn't become a sequential scan.

### Pages and components

- **`/loans/[id]`** — the detail page. It was linked from the loans list but
  **had never been written**, so every row in the table led to a 404.
- `/loans/[id]/edit`
- `LoanActions` — close / reopen / delete
- `DepositHistory` — add, delete, repayment progress
- `RemarksLog` — append-only, matching the desktop
- `LoanPhoto` — capture, replace, delete via R2
- `AutoSuggest` — field autocomplete
- `GlobalSearch` — ⌘K, wired into the top bar

---

## Bugs found and fixed in the existing scaffold

**Creating a loan never updated the cash summary.** The new-loan page inserted
straight into `loans` from the browser. A new loan is money leaving the drawer
— that day's `investments` — so every later day's balance was silently stale
until something else recalculated. Now goes through `create_loan()`.

**`useState(() => {...})` used as an effect.** The new-loan page fetched the
tenant id with `useState` instead of `useEffect`. It happens to run once as a
lazy initialiser, but it's not what the code means. Removed entirely — the RPC
reads tenant from the session.

**Loan detail page didn't exist.** Every row in the loans table linked to a 404.

**`menu-item` class didn't exist** in `globals.css`.

**`service_role` grants were missing.** `REVOKE ... FROM PUBLIC` also strips the
implicit grant `service_role` inherits, so the migration CLI would have failed
with "permission denied for function" partway through — *after* inserting rows.
Caught by the RPC checker, not by reading.

---

## A deliberate difference from the desktop

The desktop computes `deposit_credit` from the `deposits` table alone. Closing a
loan **deletes** its rows from `deposits` (they're copied to
`closed_record_deposits` first). So on the desktop, closing a loan retroactively
removes those deposits from the `deposit_credit` of every past day they occurred
on — quietly changing historical daily reports the shop may already have
printed.

Here both figures come from active **+** archived deposits, so history stays
fixed once written.

**What this means for reconciliation:** for a shop with closed loans, the web
`daily_cash_summary` rows will differ from the desktop's on intermediate days.
The web figures are the correct ones. The verified test shows the **final
balance agrees either way**, because a deposit's credit and debit disappear
together — so the number that matters most still matches.

---

## Verification

```
npm test
```

| Check | Result |
|---|---|
| Migration row mapping (`map.test.ts`) | ✅ 57 assertions, 4 timezones |
| Cash ledger arithmetic (`cash.test.mjs`) | ✅ 16 assertions |
| Every `.rpc()` resolves to a function granted to the calling role | ✅ 13 RPCs, 0 problems |
| Every `.from()` resolves to a real table | ✅ 12 tables |
| TS/TSX syntax | ✅ 67 files |
| Local imports resolve to real exports | ✅ 0 problems |
| SQL parses as PostgreSQL | ✅ 223 statements |

The cash test verifies the property that actually matters: **net gain equals
the interest charged**, and a deposit nets to zero across its lifetime.

**Still not run:** `next build` and `tsc --noEmit`. `npm install` exceeds the
sandbox's per-command limit. Run both locally — that's the one gap.

---

## Known gaps

- **Deposits list page** (`/deposits`) still queries directly rather than using
  the new RPCs. Works, but inconsistent.
- **Cash page** doesn't yet use `record_cash_transaction`.
- **`updateDeposit`** exists as an action but has no UI.
- **Reports** — all seven types are Phase 2.
- **No pagination.** The loans list caps at 200 rows. Fine for a new shop,
  not for a migrated one with 5,000 loans.
- **`daily_deposit_records` cleanup on deposit delete** matches on
  `(loan_id, date, amount)` rather than an id, so deleting one of two identical
  same-day deposits removes both snapshot rows. It's a working table purged
  nightly, so the impact is limited to that day's report.

---

## Next

Phase 2 is reports and the dashboard — seven report types, all heavy SQL that
needs porting from `mainfunctions.js` to Postgres. That is where the remaining
desktop parity work is.

Before that, worth doing: run `npm run db:types` against a real project so the
Supabase queries are actually type-checked. Right now `Database` is `any`, which
means a renamed column is a runtime bug rather than a compile error.
