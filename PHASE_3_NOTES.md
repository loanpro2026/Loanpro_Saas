# Phase 3 — Offline Operation

The desktop app works with no internet. The web app now mostly does too.
31 July 2026.

---

## Why this was the priority

Every other Phase 4 item — staff accounts, settings, billing UI — is a
convenience. **Offline is the one place where the web version is genuinely
worse than what your users have today.** A shop with a dropped connection
cannot serve the customer standing at the counter, and that is not something a
feature flag fixes later.

You have not yet answered how reliable your shops' connectivity is, so this
assumes the worst case.

---

## What works with no internet

| Task | Offline | Notes |
|---|---|---|
| Look up a loan by ticket number | ✅ | The critical counter task |
| Search by name, father's name, place | ✅ | From the cached snapshot |
| Record a deposit | ✅ queued | Syncs on reconnect |
| Add a loan | ✅ queued | |
| Record cash in/out | ✅ queued | |
| Close a loan | ❌ | Settles money against a live balance — see below |
| Reports | ❌ | Computed server-side |
| Photos | ❌ | R2 needs a connection |

**Closing a loan stays online-only, deliberately.** It writes to five tables
and settles a figure against a running cash balance. Queuing that means
computing a settlement from possibly-stale data and hoping it still holds an
hour later. Getting it wrong means the shop hands back jewellery having
collected the wrong amount, and only finds out at reconciliation.

---

## Exactly-once, or the whole thing is worse than useless

A queued write can be sent twice — the response is lost, the tab reloads
mid-sync, two tabs are open, the phone flips between wifi and mobile data.
Without a guard the shop records a ₹5,000 deposit twice and their books stop
matching the drawer.

So every queued write carries a client-generated UUID, and the database refuses
to act on the same one twice (`create_loan_idem`, `add_deposit_idem`,
`record_cash_idem` in migration 010, with partial unique indexes behind them).
The client can retry as often as it likes; the effect happens once.

A replay returns **success**, not an error — otherwise the queue retries
forever on a write that already landed.

### Other rules the queue follows

- **Order is preserved.** Oldest first, one at a time. Cash is a running
  balance; posting a 3pm withdrawal before a 10am deposit briefly shows a
  negative balance and an activity log that reads backwards.
- **Transient failures stop the queue** rather than skipping ahead. If the
  network dropped again, hammering the rest burns battery and breaks order.
- **Permanent failures are dropped and surfaced.** A deposit against a loan
  someone closed on another device will never succeed. It is reported to the
  user — a payment the customer actually handed over must not vanish quietly.
- **Retry ceiling of 8**, so nothing retries forever.

---

## What the shop sees

Never "saved" when it means "queued". A banner under the top bar shows
connection state and pending count, opening to a list of exactly what is
waiting, when it was entered, and any error. Search results from the cache say
so, including the caveat that they are active loans only and may be stale.

The banner is deliberately not alarming. A shop with patchy internet will see
it often, and a red flashing warning every twenty minutes teaches people to
ignore warnings.

---

## Storage

IndexedDB, not localStorage. The queue holds money movements and must survive a
tab crash, a reload and a flat battery. localStorage is synchronous,
size-capped, and cleared more eagerly by mobile browsers under memory pressure.

The cache is capped at 2,000 active loans. A device holding a shop's entire
seven-year history is slow to sync and a privacy problem if the phone is lost.
`clearAll()` runs on sign-out.

---

## A fourth timezone bug, found by grepping

After fixing this class of bug in the migration script and again in the
dashboard, I grepped for the pattern and found three more:

```js
new Date().toISOString().split('T')[0]   // UTC — wrong for a shop in India
```

In `/cash`, `/deposits`, and the new-loan form's default issue date. Between
18:30 and 24:00 UTC each of these returns *tomorrow*, so an evening entry gets
filed against the wrong day and disappears from that day's report.

There is now one `todayIST()` in `lib/utils`, used everywhere, with a comment
explaining why. The remaining `new Date().toISOString()` calls are timestamps
(`last_seen_at`, `captured_at`) where UTC is correct.

**This bug appeared in four independent places written at different times.**
Worth a lint rule before the codebase grows.

---

## Also fixed

- **Loans list had a hard cap of 200 rows** with no indication the rest existed.
  A migrated shop with 3,000 loans would silently see a fraction. Now paginated
  at 50 with a total count.
- **Cash and deposit entry inserted directly into tables**, leaving
  `daily_cash_summary` stale. Both now go through the Phase 1 RPCs.

---

## Verification

```
npm test
```

| Check | Result |
|---|---|
| Offline queue (`offline.test.mjs`) | ✅ 37 assertions |
| Report logic | ✅ 47 |
| Migration mapping | ✅ 57, across 4 timezones |
| Cash ledger | ✅ 16 |
| `.rpc()` → granted function | ✅ 26 RPCs |
| TS/TSX syntax | ✅ 82 files |
| Imports resolve | ✅ 0 problems |
| SQL parses | ✅ 265 statements, 11 files |

The offline tests model the failure modes directly: a replayed write posting
once, two identical deposits with different keys posting twice, ordering held
across a mid-queue network drop, a permanent error dropped without stalling the
queue behind it.

**Still not run:** `next build`, `tsc --noEmit`. Unchanged since Phase 0 — npm
install exceeds the sandbox's per-command limit. This remains the single
biggest untested surface.

---

## Known gaps

- **The service worker does not yet cache the app shell.** IndexedDB holds the
  data, but a hard reload with no connection still fails to load the page.
  `public/sw.js` needs the Next.js build assets precached — the last piece of
  making this genuinely usable offline.
- **No conflict detection.** If a loan is closed on another device while a
  deposit for it sits queued, the deposit is dropped with an error. Correct, but
  the shop has to re-enter it deliberately.
- **The cached snapshot has no age limit.** A device offline for a week
  searches week-old data. It says it is cached, but not how stale.
- **Photos cannot be queued.** A capture with no connection is lost. Queuing
  blobs in IndexedDB is possible but was not worth it before the shell caching.

---

## Still open

The question from §12 of the plan, now asked four times: **how reliable is
connectivity at your shops?** This phase assumes it is bad. If it is actually
fine, the service-worker shell caching is lower priority than staff accounts
and settings. If it is bad, shell caching is the next thing to build and
photos-offline after that.
