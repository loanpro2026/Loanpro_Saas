# Migration scripts

Moving one shop from the desktop app's MySQL into Supabase. You run these by
hand, one customer at a time, with them on a call.

## Before you start

During rehearsal, the customer can keep using the desktop app because the
source is read-only. During the final cutover, close the desktop app before the
final copy and do not enter anything else there unless the migration is rolled
back completely.

Do it as a **freeze window**: migrate after close of business, verify that
evening, they start on the web the next morning. No delta import, no
dual-entry period. That fits a shop's rhythm; a mid-day cutover does not.

## Setup

```bash
cd loanpro_saas
npm install
cp .env.example .env.local     # fill in Supabase + R2 credentials
```

The scripts read `.env.local` automatically via `--env-file`.

**Two ways to reach the customer's data:**

1. **Their machine.** Screen-share, run the script there. Their MySQL is on
   `localhost:3307`, database `loan_management`.
2. **A copy (safer).** Ask them for a `.loanprobackup`, restore it into a
   throwaway local MySQL, point the script at that. You never touch their
   production machine.

## 1. Create the account

The customer signs up on the web app first — this creates the `tenants` row.
Take the tenant UUID from the Supabase dashboard (`tenants` table).

The script refuses to run against a tenant that does not exist, and warns
before merging into one that already has loans.

## 2. Dry run

Reads only. Writes nothing, anywhere.

```bash
npm run migrate:tenant -- --tenant <uuid> --dry-run \
  --archive-dir "C:\Users\<them>\AppData\Roaming\LoanPro\closed-record-images"
```

Read the output carefully:

- **Row counts** per entity, and the outstanding total. The customer should
  recognise these numbers.
- **Data quality warnings.** Loans with no `issue_date` or no customer name
  will be skipped — they cannot be represented downstream.
- **A timezone check** on a real record, showing the stored IST value and the
  UTC it becomes. These must describe the same moment. If not, stop.
- **Photo counts**, split between inline (active loans, stored in MySQL) and
  archived (closed loans, files on disk).
- **Fingerprint templates**, which are *not* migrated.

> Say the fingerprint thing out loud, before cutover. The web app cannot reach
> the SecuGen scanner, so capture and 1:N search stay desktop-only. A shop that
> relies on it will consider a silent removal a regression, and they'd be right.

## 3. Execute

```bash
npm run migrate:tenant -- --tenant <uuid> --execute \
  --archive-dir "...\LoanPro\closed-record-images"
```

Order: loans → deposits → closed deposits → cash → activity → app state →
photos → sequence reset.

Anything skipped lands in `migration-issues-<tenant>.csv`.

## 4. Reconcile — do this with the customer watching

```bash
npm run migrate:reconcile -- --tenant <uuid>
```

Prints desktop and web totals side by side. Exits 1 on any mismatch.

The point isn't that the script says OK. It's that the owner sees their own
outstanding total, loan count and cash position match numbers they already
know. That's what makes someone comfortable switching; a green tick from a tool
they've never seen doesn't.

## Options

| Flag | Purpose |
|---|---|
| `--tenant <uuid>` | Target tenant. Required. |
| `--dry-run` / `--execute` | Exactly one is required. |
| `--archive-dir <path>` | Closed-record photo folder. Without it those photos are skipped. |
| `--skip-photos` | Rows only — useful for a fast rehearsal. |
| `--batch <n>` | Insert batch size, default 500. |
| `--mysql-host/-port/-user/-password/-database` | Source connection. |
| `--tolerance <n>` | (reconcile) allowed difference on money totals. Default 0. |

## Staging performance audit

After importing the copied customer database and reconciling its totals, run
the same bounded query shapes used by the web record lists and detail pages:

```bash
npm run staging:audit -- --tenant <uuid>
```

The audit is read-only. It runs each query three times, verifies that list
queries never return more than one 50-row page, and fails when any query takes
more than 1,500 ms. On a slow or distant development connection, change only
the reporting threshold with `--budget-ms <n>`; do not increase page sizes.

## Testing the mapping

```bash
npm run migrate:test
```

57 assertions over the row mapping: ID preservation, DECIMAL-as-string parsing,
NULL and MySQL zero dates, empty-string-to-NULL, malformed JSON, unknown enum
values, and the IST→UTC conversion.

Run it under several timezones — the result must not depend on the machine:

```bash
TZ=UTC npm run migrate:test
TZ=Asia/Kolkata npm run migrate:test
TZ=America/Los_Angeles npm run migrate:test
```

## Things that will bite you

**Timezone.** The desktop writes naive local time. `2026-03-01 00:00:00` means
midnight IST, which is `2026-02-28T18:30:00Z` — the *previous day*. Read as UTC
instead, every record shifts 5.5 hours and evening entries land on the wrong
day, quietly corrupting every daily report. The connection uses
`dateStrings: true` and applies the offset explicitly, so the result doesn't
depend on where the script runs.

**Loan numbers.** IDs are preserved exactly. Shops write them on the paper
tickets tied to the gold in the safe. If loan #4471 becomes #1, they cannot
find the customer's jewellery. `reconcile` checks min and max loan id for this
reason.

**Sequence reset.** Inserting explicit IDs doesn't advance a `BIGSERIAL`
sequence. Without `reset_sequences_for_tenant()` (migration 006), the first new
loan the shop creates tries id 1 and fails on a duplicate key — on day one.

**`cash_transactions` has no primary key** in MySQL, so there's no ID to
deduplicate on. The script refuses to import if the tenant already has rows.
Re-running after a partial failure needs those rows cleared first.

**Closed-record photos live outside MySQL**, under
`%APPDATA%\LoanPro\closed-record-images`. Without `--archive-dir` they're
silently absent — the dry run warns about this, so read it.

## Re-running

Safe. Loans, deposits and activity use preserved primary keys with
`ignoreDuplicates`, so a second run inserts only what's missing. The exception
is `cash_transactions`, above.
