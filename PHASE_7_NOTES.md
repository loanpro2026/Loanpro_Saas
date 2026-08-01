# Phase 7 — Marketing site

Own components, no shared code with `loanpro_web`. 31 July 2026.

This completes the build. The app is feature-complete against the Electron
app, and self-contained.

---

## Pages

| Route | Purpose |
|---|---|
| `/` | Landing — hero, trust strip, features, migration path, pricing, FAQ, CTA |
| `/about` | Who builds it. Payment gateways expect a real identity |
| `/support` | Contact form + what to expect |
| `/terms` | Terms of service |
| `/privacy` | Privacy policy |
| `/refunds` | Refund & cancellation |

The four policy pages are not optional decoration — **Razorpay will not approve
a live account without reachable terms, privacy, refund and contact pages.**

---

## What the copy does differently

Same design language as the existing site: gradient hero with radial
highlights, badge pills, bordered cards, blue-family primary. But the copy sells
a *web app*, so everything about downloads, Windows requirements and MySQL
setup is gone — those were selling points for the thing this replaces.

Three decisions worth noting:

**The hero shows a real screen's structure**, not a stock illustration — a loan
detail card with actual figures, including the ₹8,078 interest number that now
comes from the corrected calculation. What you see is what you get.

**The FAQ answers the objections a shop owner actually raises**, including the
ones where the web version is worse:

- *"What happens if the internet goes down?"* — honest about what works offline
  and what doesn't, and says plainly that closing a loan needs a connection.
- *"What about the fingerprint scanner?"* — states it stays desktop-only,
  explains why, and says the desktop app isn't going away.
- *"What if my subscription lapses?"* — "We are not going to hold your books
  hostage over a payment."

Naming the weaknesses does more for trust with this audience than avoiding
them. A shop owner who discovers the fingerprint limitation *after* migrating
will feel misled; one who read it on the pricing page will not.

**The migration section leads with "your desktop app keeps working."** That is
the actual objection — not price, not features. Losing access to their loan
book is the thing a shop is afraid of.

---

## Contact form

Enquiries go to an `enquiries` table (migration 015), not an email — nothing
lost to a spam folder, all in one place.

The reason field distinguishes *"move my records across"* from *"something is
broken"*, because those are different jobs. Someone asking about migration gets
a placeholder asking how many loans they have and when would suit.

**Rate limited to 5 per hour per IP.** A public unauthenticated write needs
some floor, and that is far above what a real person sends.

**The IP is pruned after 7 days** by a `pg_cron` job. It exists to stop someone
hammering the form; keeping it beyond that turns a support inbox into a store
of personal data with no purpose.

The table has RLS on with **no policies at all** — service role only. These
messages contain other people's contact details and belong to you, not to any
tenant.

---

## New: link checker

`scripts/links.js` walks every `page.tsx` to build the real route list, then
checks every `href="/..."` in the codebase against it. Handles route groups
correctly — `(marketing)` doesn't appear in the URL.

It immediately earned its place: the footer linked to `/about`, which did not
exist. Now in `npm test`.

**22 routes, all links resolve.**

---

## Verification

```
npm test
```

| Check | Result |
|---|---|
| Interest vs desktop | ✅ 33 comparisons + 20 assertions |
| Offline queue + photos | ✅ 50 |
| Report logic | ✅ 47 |
| Migration mapping | ✅ 57, 3 timezones |
| Plan gating | ✅ 40 |
| Cash ledger | ✅ 16 |
| Guards | ✅ 3, proven to fire |
| **Internal links** | ✅ **22 routes, 0 broken** |
| TS/TSX syntax | ✅ 112 files |
| Imports resolve | ✅ 0 problems |
| `.rpc()` → granted | ✅ 0 problems |
| SQL parses | ✅ 327 statements, 16 files |

---

## The whole thing, as it stands

**16 migrations, 112 TS/TSX files, ~265 assertions.** Feature-complete against
the Electron app except fingerprint, which cannot cross to a browser.

| | |
|---|---|
| Loans, deposits, cash, search, autosuggest | ✅ |
| All seven reports + dashboard + 12-month chart | ✅ |
| Photo capture — browser and paired phone | ✅ |
| Every applicable general setting, enforced | ✅ |
| Screen lock | ✅ |
| Data export | ✅ |
| End-of-day screens | ✅ |
| PDF + CSV export | ✅ |
| Offline operation | ✅ (beyond desktop parity) |
| Staff accounts | ✅ (beyond desktop parity) |
| Migration tooling | ✅ |
| Marketing site + policies | ✅ |
| Fingerprint | ❌ by design |
| Support ticket system | ⬜ contact form only |
| In-app help/documentation | ⬜ |

---

## Before you go live

1. **`npm install && npm run build`** — still never run. The largest untested
   surface.
2. **Apply migrations 001–015 in order.** Enable `pg_cron` and `pg_trgm`.
3. **`npm run db:types`** — `Database` is `any` today, so no Supabase query is
   type-checked.
4. **Fill in real details** on `/about` and `/terms` — the business address and
   jurisdiction are placeholders, and Razorpay will check them.
5. **Set the interest rate** for each migrated shop before their first closing.
   Default is 36%/year.
6. **Dry-run the migration** against an anonymised customer database.

---

## Left deliberately

- **Support tickets** — the contact form covers the marketing side. In-app
  ticketing is low value while you onboard a handful of shops personally.
- **In-app help** — the desktop has a documentation page. Worth porting once
  the UI stops changing.
- **Razorpay checkout** — `tenants.plan` is set by hand, which is correct while
  you are onboarding manually. The pricing page already states the plans.
