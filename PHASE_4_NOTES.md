# Phase 4 — Platform

App-shell caching, plan gating, staff accounts, settings. 31 July 2026.

This completes the build. What remains is your machine, your credentials, and a
real database.

---

## 1. Offline is now actually offline

Phase 3 cached the *data*; a hard reload with no connection still failed. The
service worker now precaches the shell, and there is a real fallback page.

**`public/sw.js` rewritten.** The old version's navigation handler was:

```js
fetch(request).catch(() => caches.match(request))
```

For a page never visited while online, `caches.match` resolves to `undefined`
and the browser shows its own error screen. Now: network with a 3-second
timeout → cache → `/offline`. Three seconds because a shop on a bad connection
should not stare at a white screen for thirty.

Also fixed there: only GET is cached (a cached POST would mean replaying a
write), `/api/*` always goes to the network (a cached `/api/photos/:id` would
hand back an expired presigned URL), and error responses are never cached.

**`/offline` is a working page, not an apology.** It searches the cached loans
and shows the pending queue — because the counter task that matters when the
internet is down is *"customer is standing here with ticket #4471"*, and that is
answerable entirely from IndexedDB.

**The service worker now registers in `OfflineProvider`, not the push hook.**
Previously, declining the notification permission prompt silently cost you all
offline caching.

---

## 2. Plan gating — and what it must never block

Enforced in Postgres. A gate that only hides a button is decoration; anyone can
call the RPC with the public anon key.

**What an expired plan blocks:** creating new loans. That is all.

**What keeps working:** recording deposits on existing loans, closing loans,
search, reports, export.

This is deliberate and worth stating plainly. Refusing to record a repayment a
customer has physically handed over — because a card expired — would corrupt
the shop's books over a billing problem. Locking someone out of records they
entered themselves would be worse. Expiry stops *new business*, nothing else.
The error message says so: *"your existing records stay available."*

`my_plan()` resolves a trial against the clock rather than trusting
`plan_status`, so a trial that ended is inactive even if no job has updated the
column yet.

| | Trial | Basic | Pro |
|---|---|---|---|
| People | 2 | 3 | 10 |
| Loans | 100 | 5,000 | unlimited |

---

## 3. Staff accounts

`invite_staff` / `revoke_staff` / `accept_invitation`, all with the rules in the
database:

- Only owners invite or remove
- **Seats count members *plus* outstanding invitations** — otherwise an owner
  could issue twenty invitations on a two-seat plan and have them all accepted
- A shop must always keep at least one owner
- You cannot remove yourself
- **An invitation only opens for the email it was sent to.** A forwarded link
  does not let whoever finds it into a shop's loan book.

Staff can add loans, record deposits, close loans, view reports. Owners can also
reopen, delete, invite, and change the plan.

**Invitations show a link rather than claiming to send an email.** No
transactional email is configured, and a UI that says "invitation sent" when
nothing was sent is worse than one that hands the owner a link to pass on.

---

## 4. Settings

Shop name, your name, people, and defaults for new loans (interest rate, metal).
Plus a screen-lock timeout replacing the desktop's app lock — useful on a
counter machine customers can see.

Setting keys are whitelisted server-side so the table does not become an untyped
dumping ground.

---

## Verification

```
npm test
```

| Check | Result |
|---|---|
| Plan gating (`plans.test.mjs`) | ✅ 40 assertions |
| Offline queue | ✅ 37 |
| Report logic | ✅ 47 |
| Migration mapping | ✅ 57, across 3 timezones |
| Cash ledger | ✅ 16 |
| `.rpc()` → granted function | ✅ 32 RPCs |
| TS/TSX syntax | ✅ 89 files |
| Imports resolve | ✅ 0 problems |
| `sw.js` parses | ✅ |
| SQL parses | ✅ 278 statements, 12 files |

**~197 assertions.** The plan tests assert the ungated operations explicitly,
and I verified the claim directly rather than trusting the test: `assert_can_write()`
has exactly one call site, inside `create_loan`.

---

## The one thing still not done

**`next build` and `tsc --noEmit` have never run.** `npm install` exceeds the
sandbox's per-command limit, so across every phase this has stayed open. It is
the largest untested surface in the project.

```bash
cd loanpro_saas
rm -rf node_modules package-lock.json
npm install
npx tsc --noEmit     # expect errors until db:types is regenerated
npm run build
```

Everything I *could* verify without it, I did — syntax, imports, RPC-to-grant
resolution, SQL parsing, and the business logic. But type errors across module
boundaries and Next-specific build issues will only show up there.

---

## Recommended order from here

1. **`npm install` && `npm run build`.** Fix whatever falls out.
2. **Create the Supabase project**, apply migrations 001–011, enable `pg_cron`,
   go straight to Pro (free projects pause after a week idle).
3. **`npm run db:types`** — `Database` is currently `any`, so no Supabase query
   is type-checked. This turns a renamed column from a runtime bug into a
   compile error.
4. **Run `supabase/tests/rls.test.sql`** against the live database.
5. **Create the R2 bucket**, confirm a presigned PUT/GET round-trip.
6. **Dry-run the migration** against an anonymised copy of a real customer
   database. This is where reality will disagree with assumptions.
7. **Migrate yourself first**, as customer zero. Then one real customer.

---

## Known gaps, honestly

- **Photos cannot be captured offline.** Queuing blobs in IndexedDB is possible
  but was not worth it before shell caching existed.
- **No PDF export.** CSV only. The desktop's jsPDF code is portable.
- **No transactional email** — invitations are links you pass on.
- **Billing checkout is not wired.** `tenants.plan` is set by hand in the
  Supabase dashboard, which is correct while you are onboarding a handful of
  users personally.
- **Support tickets not ported.** Low value while you are hand-onboarding.
- **Fingerprint remains desktop-only** and always will on the web. Tell users
  before they migrate, not after.
- **`daily_cash_summary` will differ from the desktop** on intermediate days for
  shops with closed loans (PHASE_1_NOTES §deliberate difference). The final
  balance agrees; ours is the correct one.

---

## The pattern worth remembering

The same bug — `new Date().toISOString()` for "today", which is UTC and returns
tomorrow for a shop in India after 18:30 — appeared in **five independent
places** written at different times: the migration script, the dashboard, the
cash page, the deposits page, and the new-loan form.

There is now one `todayIST()` in `lib/utils`. Before this codebase grows, add a
lint rule banning bare `toISOString().split('T')[0]`. It will happen again
otherwise.
