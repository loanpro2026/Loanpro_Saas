# Phase 6 — Desktop parity

Scope narrowed to "match the Electron app". This phase closes the functional
gaps and fixes one thing I had genuinely wrong. 31 July 2026.

---

## The interest model was wrong, and it would have overcharged everyone

Worth reading even if you skip the rest.

**What the desktop actually does** (`mainfunctions.js` removeRecord,
`Removerecord.tsx` lines 195–213):

- `loans.interest` is the interest **amount in rupees**, written once when a
  loan is closed. `NULL` while active. Reports depend on it:
  `SUM(amount + interest)` is the total returned.
- The **rate** is a single shop-wide setting — `interestPercentage`, default
  **36% per year** — applied to every loan. It is not stored per loan at all.
- Formula: `years = days / 365`, then `P × rate × years` for simple, or
  `P × (1 + rate/n)^(n × years) − P` for compound.

**What I had built:** `loans.interest` treated as a per-loan *monthly
percentage*, displayed as "24%", with an interest field on the new-loan form
that the desktop does not have.

| ₹45,000 held six months | |
|---|---|
| My code | ₹98,280 |
| Correct | ₹8,078 |
| **Error** | **12.2× — ₹90,202 on a single loan** |

Nothing would have crashed. Every customer would simply have been overcharged,
and you'd have found out when one of them argued.

**Fixed:** `calculate_interest()` in migration 012, transcribed from the
desktop. Interest field removed from both forms and from the editable
whitelist — it's written only by `close_loan()`. Loans list and detail show the
amount; active loans show "₹8,078 if closed today".

`365`, not `365.25`, deliberately. A shop reconciling a migrated loan against
their old printout needs the *same number* more than they need astronomical
accuracy.

**33 assertions** compare our output against the transcribed desktop formula
across principals, durations, and every simple/compound/period combination.

---

## Settings — all of them now, and they enforce

Migration 012 seeds the desktop's full general-settings set with the desktop's
own defaults, so a migrated shop behaves identically on day one.

Ported: identity verification (master switch + mandatory at creation +
mandatory at closure + mobile capture + multiple devices), interest rate/type/
period, optional address and notes fields, date format, default metal, theme,
dashboard divisor.

Not ported, and why: fingerprint (hardware), Google Drive keys (replaced by
export), `identityStoreImageInDatabase` (photos are in R2 now), the webcam
preference cluster (the browser picks a camera itself), `autoBackup*` (no local
filesystem).

**They actually take effect.** The address and notes fields disappear from the
new-loan form when off — both default to **off**, as on the desktop, so a
migrated shop doesn't suddenly see fields it had hidden.

### One deliberate difference on "photo mandatory"

The desktop captures and saves in one screen, so it can simply refuse. On the
web the photo is a separate upload that can fail *after* the loan row is
written, or be queued offline.

- **At closure — enforced, server-side.** Nothing is lost by refusing: the
  jewellery stays in the safe and the customer comes back. That is the entire
  point of the control.
- **At creation — the UI blocks, the database records.** `create_loan` accepts
  a `has_photo` flag and sets `photo_required_missing`. Refusing outright would
  mean a customer's gold taken in with *no record of it at all* when an upload
  fails. A trigger clears the flag the moment a photo lands, including a queued
  offline capture that syncs hours later, and `loans_missing_photo()` surfaces
  the gaps.

---

## Data export

`GET /api/export` streams a ZIP: every table as JSON, photos named by loan
number, a manifest, and a README explaining what the money fields mean and how
to read the timestamps.

Streamed rather than buffered — a shop with 5,000 loans and 1,200 photos
shouldn't need the whole archive in memory on a Vercel function before the
download starts.

Supabase PITR covers disaster recovery. This covers something different: a
shop being able to take their own records out whenever they want, without
asking. They have that today.

---

## Missing screens, built

- **`/day-end`** — the desktop's removed-records and daily-deposit screens,
  shown together because they're read together. Their sum is what should be in
  the drawer above the opening balance. Printable, with a "mark checked" action
  that clears only the working list (the modal says so explicitly — an operator
  clicking Clear is not asking to delete their loan book).
- **Edit deposit** — the server action existed since Phase 1 with no way to
  reach it. Now goes through `update_deposit()`, which also fixes the day's
  working row and re-chains the cash summary from whichever date is earlier,
  since an edit can move a deposit between days.

Added to the sidebar, **not** the mobile bottom bar — six tabs is cramped on a
handset and end-of-day reconciliation happens at the counter machine.

---

## Verification

```
npm test
```

| Check | Result |
|---|---|
| Interest vs desktop formula | ✅ 33 comparisons + 20 assertions |
| Offline queue + photos | ✅ 50 |
| Report logic | ✅ 47 |
| Migration mapping | ✅ 57, 3 timezones |
| Plan gating | ✅ 40 |
| Cash ledger | ✅ 16 |
| Guards | ✅ 3, proven to fire |
| TS/TSX syntax | ✅ 101 files |
| Imports resolve | ✅ 0 problems |
| `.rpc()` → granted function | ✅ 0 problems |
| SQL parses | ✅ 317 statements, 15 files |

**~265 assertions.**

---

## New dependencies

`jspdf`, `jspdf-autotable`, `archiver` (+ `@types/archiver`).

---

## Remaining

- **Marketing site** — next, and the last item on your list.
- **Support tickets and Help/documentation** — the desktop has both. Low value
  while you're hand-onboarding a handful of shops, but they are parity gaps.
- **`next build` / `tsc --noEmit`** — still yours to run.

---

## One thing to check when you first run this

Migration 012 backfills settings for existing tenants and 013 adds
`photo_required_missing` to `loans`. Both are safe to re-run, but **apply
012–014 in order** — 013 redefines `create_loan` and `close_loan`, and 014
depends on tables from 004.

And when you migrate a real shop: **ask what interest rate they use.** The
default is 36% per year. If their desktop was set to something else, set it in
Settings before they close their first loan on the web, or the first settlement
will be wrong.
