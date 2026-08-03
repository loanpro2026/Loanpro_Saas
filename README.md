# LoanPro Web

Gold and silver loan management for Indian pawn shops. The web version of the
Electron desktop app, built to be **functionally identical** so existing
customers can migrate their data across.

Self-contained: its own Supabase project, its own auth, its own marketing site.
It shares no code and no infrastructure with `loanpro_web` or the desktop app.

---

## Status

**Build and regression suite verified locally on 3 August 2026.**

The production Next.js build, application checks, migration checks, generated
database types, and dependency audit are enforced in CI. Live Supabase, R2,
email-confirmation, and browser workflow validation still require staging.

| | |
|---|---|
| Migrations | 26 sequential files — all parse as real PostgreSQL |
| App code | Type-checked by the production build; imports checked independently |
| Tests | Financial, migration, offline, plan, service-worker and parity checks |
| Desktop parity | 167/167 endpoints accounted for |

---

## Getting it running

```bash
npm install
python -m pip install -r scripts/requirements.txt
npm test
npm run check:sql
npm run build
```

Then, in order:

1. **Supabase project.** Go straight to Pro — free projects pause after a week
   idle. Apply migrations `001`–`029` in order.
2. **Enable `pg_cron` and `pg_trgm`** in Database → Extensions. Migration 004
   only prints a notice if `pg_cron` is missing, so the nightly purge silently
   never runs. `pg_trgm` fails loudly in 008.
3. **`npm run db:types`** against the linked staging project after migrations.
   For offline generation, use `npm run db:types:sql`.
4. **Run `supabase/tests/rls.test.sql`.** If it fails, one shop can read
   another's records. Stop and fix.
5. **Cloudflare R2 bucket** `loanpro-photos`, private, no public domain.
   Verify a presigned PUT/GET round-trip.
6. **Supabase Auth URLs.** Set the production Site URL and allow
   `https://yourdomain.com/api/auth/callback`. Email confirmation and password
   recovery both return through this callback.
7. **Vercel.** `NEXT_PUBLIC_APP_URL` must be the real domain. Keep
   `BILLING_MODE=disabled` and `STAFF_ACCESS_ENABLED=false` during testing.
8. **Fill in real details** on `/about` and `/terms`. The business address and
   jurisdiction are placeholders and Razorpay will check them.

---

## Architecture in one paragraph

Next.js App Router on Vercel, Supabase Postgres with row-level security for
data, Supabase Auth for identity, Cloudflare R2 for customer photos. **Every
multi-table write is a Postgres function**, not a sequence of client calls —
closing a loan touches five tables and shifts a running cash balance, and doing
that over several round trips from a serverless function means a cold start can
leave a shop's books half-updated.

RLS is the security boundary. Server actions validate input and produce
readable errors; they are not what stops a shop reading another shop's data.

---

## Layout

```
app/
  (marketing)/     public site — landing, pricing, policies, support
  (auth)/          login, register
  (app)/           the product, behind auth
  api/             photos (R2 presigning), camera relay, data export
components/        by feature — loans, reports, offline, settings, help
lib/               utils, settings, R2, offline queue, PDF
scripts/           migration CLI, tests, repository checks
supabase/
  migrations/      001–029, applied in order
  tests/           RLS regression tests
```

### Reading order for the migrations

| | |
|---|---|
| 001–002 | Original scaffold — schema, RLS, paired devices |
| 003 | **Security fixes.** Read this one |
| 004 | Tables the scaffold was missing |
| 005 | Atomic tenant provisioning |
| 006 | Migration helpers |
| 007 | Cash summary + loan closing |
| 008 | Search, autosuggest |
| 009 | The seven reports |
| 010 | Offline idempotency |
| 011 | Plans and staff |
| 012 | **Settings parity + the interest correction.** Read this one |
| 013 | Identity enforcement |
| 014 | End-of-day screens |
| 015 | Marketing enquiries |
| 016 | Closed-record editing, support tickets |
| 017–022 | Constraints, photo metering/stages, loan detail and dashboard |
| 023 | 60-day unlimited trial |
| 024 | Per-session access devices and revocation |
| 025 | Automatic mobile/desktop photo capture selection |
| 026 | Transaction-safe edits, deletion and multi-device remarks |
| 027 | Database-wide loan chronology and owner-only reopen guard |
| 028 | Financial write hardening and large-book query indexes |
| 029 | Distributed API abuse protection without retaining raw IP addresses |

---

## Dependencies

**Never run `npm audit fix --force` in this repo.**

Next.js hard-pins `postcss@8.4.31` and carries `sharp` as an optional
dependency. Both have current advisories, and *no released Next version fixes
them* — the advisory covers everything from 9.3.4 to 16.3. Faced with that,
`npm audit fix --force` offers to install **next@9.3.3**, a six-major
downgrade to a version that predates the App Router entirely.

That is not a fix, and taking it has already broken this project once:
`package.json` came back pinned to `next@^9.3.3`, and the resulting error was a
React peer conflict that pointed nowhere near the real cause.

The correct fix is an override:

```json
"overrides": {
  "postcss": "^8.5.25",
  "sharp": "^0.35.3"
}
```

`npm run check:deps` fails if those disappear, if `next` drops below 15, or if
the lockfile pins an old version behind a corrected `package.json`.

**If a genuine vulnerability appears**, bump the specific package. Do not let
npm rewrite the manifest.

### Deliberately absent

`firebase-admin` was removed. It existed only to send FCM push to the *native
Android companion app*, which belongs to the desktop product — and it dragged
in `@google-cloud/storage` → `teeny-request` → `retry-request`, most of the
original vulnerability count. Web Push (VAPID) reaches Android Chrome, iOS
16.4+ as an installed PWA, and desktop Chrome, which is every browser the
phone-capture flow runs in.

---

## Things that will bite you

**The interest model.** `loans.interest` is the interest **amount in rupees**,
written when a loan closes. The **rate** is a shop-wide setting, default **36%
per year**. Treating it as a per-loan monthly rate overstates every settlement
roughly twelvefold. There are 33 assertions comparing our output to the
desktop's formula — keep them passing.

**Ask each migrated shop what rate they use** before their first closing on the
web. The default is 36%/year; if their desktop was set differently, the first
settlement will be wrong.

**Dates.** `new Date().toISOString().split('T')[0]` is UTC and returns
*tomorrow* for a shop in India between 18:30 and midnight. This bug appeared in
five independent places. Use `todayIST()` from `lib/utils`. `scripts/guard.js`
now fails the build if it comes back.

**Loan numbers.** Migration preserves them exactly, because shops write them on
the paper tickets tied to the gold in the safe.

**`daily_cash_summary` will differ from the desktop** on intermediate days for
shops with closed loans. Ours is correct — the desktop drops archived deposits
from historical `deposit_credit`. The final balance agrees either way.

---

## Checks

```bash
npm test
```

| Command | What it proves |
|---|---|
| `test:interest` | Settlements match the desktop formula exactly |
| `test:cash` | The ledger adds up; profit equals interest |
| `test:offline` | A replayed queued write posts exactly once |
| `test:reports` | Mangal Sutra grouping, silver-in-kg, CSV quoting |
| `test:plans` | An expired plan blocks new loans and nothing else |
| `test:capture-device` | Phones/tablets use direct capture; laptops retain the relay |
| `migrate:test` | Row mapping, across four timezones |
| `check:parity` | Every desktop endpoint is covered or explained |
| `check:guard` | Known bug patterns have not returned |
| `check:links` | No broken internal links |
| `check:rpc` | Every `.rpc()` resolves to a granted function |

`check:parity` reads the desktop app's `preload.js` from `../electron_app`. It
skips itself if that is not present.

---

## Migrating a customer

See `scripts/README.md`. Short version:

```bash
npm run migrate:tenant -- --tenant <uuid> --dry-run --archive-dir "...\closed-record-images"
npm run migrate:tenant -- --tenant <uuid> --execute  --archive-dir "..."
npm run migrate:reconcile -- --tenant <uuid>
```

The dry run writes nothing. Run it against an anonymised copy of a real
customer database before anything else — it is the cheapest way to find out
where reality disagrees with the assumptions in this code.

---

## Not built, deliberately

- **Fingerprint** — needs Windows-attached hardware. Desktop only, permanently.
  Tell users before they migrate.
- **Google Drive backup** — replaced by user-initiated export in Settings.
- **Razorpay checkout** — `tenants.plan` is set by hand, which is right while
  you onboard a handful of shops personally.
- **Transactional email** — staff invitations produce a link you pass on.

---

## Phase notes

`PHASE_0_NOTES.md` through `PHASE_7_NOTES.md` record what changed and why at
each stage, including the bugs found in the original scaffold. Worth reading if
something looks deliberate and you cannot tell why.
