# Phase 5 — Closing the gaps

Everything I listed as a known gap in Phases 1–4, plus a guard so the worst bug
in this project cannot come back. 31 July 2026.

---

## 1. PDF export

Shops print reports for their accountant and for their own file. CSV alone
meant opening Excel and formatting it by hand every time.

`lib/pdf.ts` produces a document rather than a screenshot of a web page: shop
name, the period covered, a summary box with the three figures a shop owner
checks first, zebra-striped table, page numbers, and a generated-on stamp
**explicitly marked IST** — a printout with a UTC timestamp would confuse
anyone comparing it against the day's till.

Two decisions worth noting:

- **jsPDF is imported dynamically.** It is ~350KB and only a fraction of
  sessions export anything. Bundling it into the main chunk would slow every
  page load for a shop on 3G to save a click for a few of them.
- **Print opens a tab rather than downloading.** On a counter machine that is
  what people actually want — Ctrl+P from the viewer, rather than digging the
  file out of Downloads. Falls back to a download if the popup is blocked.

Column definitions live in `REPORT_COLUMNS` and are shared by CSV and PDF. A
shop that exports the same report both ways and gets different columns will
reasonably assume one of them is wrong.

Wide reports (investment, returns, location) render landscape.

---

## 2. The screen lock now exists

The settings dropdown was there in Phase 4 and did nothing — a broken promise,
which is worse than an absent feature.

`lib/lock.ts` + `components/lock/ScreenLock.tsx`: a PIN pad overlay with an
idle timer.

**What this is honestly for:** a counter machine left unattended for a few
minutes with a customer on the other side of it. It is **not** a security
boundary against someone with real access to the device — the PIN is a PBKDF2
hash in localStorage, and anyone who can open devtools can clear it.

That is the right trade-off. A real lock would mean re-authenticating with
Supabase, which fails when the connection is down. Locking a shop out of their
own records because the internet dropped is worse than the problem it solves.
The session cookie remains the actual auth boundary; this is a screen cover,
and the settings page says so.

Details that matter:

- **Overlay, not a redirect** — a half-filled loan form survives being locked.
- **Lock state in localStorage**, so it applies across tabs. Someone who locks
  the screen and finds a second tab still open would consider it broken.
- **Timer *and* visibilitychange**, because mobile browsers suspend background
  timers — a phone in a pocket for an hour would otherwise come back unlocked.
- **No lockout after N wrong attempts.** This guards against a customer leaning
  over the counter, not a determined attacker, and locking the shop out of
  their own till during business hours would be the worse failure.
- PBKDF2 at 100k iterations: a 4-digit PIN has 10,000 possible values, so a
  fast hash is brute-forced instantly.

---

## 3. Twelve-month trend chart

`chart_data()` existed and was tested since Phase 2 but nothing called it.

Lent-out vs returned as bars, interest as a line **on its own axis** — interest
is roughly a twentieth of the principal figures and would otherwise be a flat
line along the baseline.

The third figure is labelled *"Capital recovered"* or *"Capital deployed"*
depending on sign, rather than framed as good/bad. Lending more than you
recover is normal for a growing book and mislabelling it as negative would be
wrong.

---

## 4. Photos can be captured offline

Previously a photo taken with no connection was simply lost.

Blobs go into IndexedDB directly — base64 would inflate a 250KB photo to 333KB
and cost a decode on every read of the queue. The capture is compressed
*before* queueing, so the queue holds ~250KB rather than 4MB.

The photo shows locally with a **"Waiting to upload"** badge, so the shop can
see the capture worked without being told it was saved when it wasn't.

Replaying a queued photo overwrites the same loan's image with identical bytes,
so it is naturally idempotent — no key needed.

**Plan errors are now permanent failures.** A shop whose trial ended would
otherwise have its queue retry every 30 seconds forever, burying the actual
message under noise.

---

## 5. A guard for the bug that keeps coming back

`new Date().toISOString().split('T')[0]` appeared in **five independent places**
written at different times. It is UTC; for a shop in India between 18:30 and
midnight it returns *tomorrow*, so an evening entry is filed against the wrong
day and vanishes from that day's report.

Two layers now:

- **`.eslintrc.json`** — AST selectors for the `.split()` and `.slice()` forms,
  with `lib/utils.ts` exempted since that is where the correct helper is
  defined. Bare `new Date().toISOString()` is still allowed, because a UTC
  *timestamp* (`captured_at`, `last_seen_at`) is correct.
- **`scripts/guard.js`** — runs without installing anything, so it works in CI,
  a git hook, and on a machine mid-`npm install`. Three guards: the UTC date,
  `getPublicUrl` (customer photos must never have a permanent public URL), and
  direct inserts into money tables (which bypass tenant stamping and the cash
  re-chain).

**I verified the guards actually fire** rather than assuming a clean run meant
they worked — wrote a probe file with all three bugs, confirmed each was caught
with exit code 1, then deleted it. A guard that has never fired is unproven.

---

## Verification

```
npm test
```

| Check | Result |
|---|---|
| Offline queue + photos | ✅ 50 assertions |
| Plan gating | ✅ 40 |
| Report logic | ✅ 47 |
| Migration mapping | ✅ 57, across 3 timezones |
| Cash ledger | ✅ 16 |
| Repository guards | ✅ 3, proven to fire |
| `.rpc()` → granted function | ✅ 0 problems |
| TS/TSX syntax | ✅ 94 files |
| Imports resolve | ✅ 0 problems |
| `sw.js` parses | ✅ |
| SQL parses | ✅ 278 statements, 12 files |

**~210 assertions.**

---

## New dependencies

`jspdf` and `jspdf-autotable` added to `package.json`. They will install with
everything else.

---

## What is genuinely left

- **`next build` / `tsc --noEmit`** — still the largest untested surface, and
  it needs your machine.
- **`npm run db:types`** — `Database` is `any`, so no Supabase query is
  type-checked. Worth doing before anything else; it turns a renamed column
  from a runtime bug into a compile error.
- **Creating a loan offline** — the queue supports it (`kind: 'loan'`) and sync
  handles it, but no UI surfaces it. A loan created offline has no id, so a
  photo cannot be attached to it until it syncs. Solvable, but it needs a
  client-side temporary id and I would rather not add that complexity before
  you know whether shops actually need it.
- **No transactional email** — staff invitations are links you pass on.
- **Billing checkout not wired** — `tenants.plan` is set by hand, which is
  correct while you onboard a handful of users personally.
- **Fingerprint stays desktop-only.** Tell users before they migrate.

---

## Suggested first session on your machine

```bash
cd loanpro_saas
rm -rf node_modules package-lock.json
npm install
npm test            # should pass — no build needed
npm run build       # the real test
```

If the build is clean, the next real milestone is a **dry run of the migration
against an anonymised copy of a customer database**. That is where reality will
disagree with my assumptions, and it costs nothing to find out — the script
writes nothing in `--dry-run`.
