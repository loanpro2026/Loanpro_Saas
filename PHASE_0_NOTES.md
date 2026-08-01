# Phase 0 — Foundations

Completed 31 July 2026. Everything here is code and SQL; the manual steps at the
bottom need your credentials and cannot be done for you.

---

## What changed

### 1. Build was broken — fixed

`package.json` pinned `next: ^9.3.3`. Next 9 predates the App Router and React
19 by five major versions, so nothing in `app/` could ever have compiled.

- `next` → `^15.3.2` (matches the already-correct `eslint-config-next@15.3.2`)
- Dropped `next-pwa` (unmaintained, no App Router support). The hand-written
  `public/sw.js` already does caching, Web Push and background sync, so
  `next.config.ts` no longer wraps the config in a PWA plugin.
- Dropped `jszip` — it existed only for the ZIP-upload migration flow that is
  no longer part of the plan.
- Added `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` for R2.
- Added `mysql2` and `tsx` as devDependencies for the migration script.

**Also missing:** `types/supabase.ts` did not exist, though
`lib/supabase/{client,server}.ts` both import `Database` from it. Added as a
placeholder typed `any`. **Regenerate it with `npm run db:types` before Phase 1**
— until then none of the Supabase queries are type-checked.

### 2. Security fixes — `003_security_fixes.sql`

Four separate problems, in rough order of severity.

**a. `camera_sessions` was world-readable and world-writable.**

```sql
CREATE POLICY "camera_select_by_key" ON camera_sessions FOR SELECT USING (true);
CREATE POLICY "camera_update_by_key" ON camera_sessions FOR UPDATE USING (true);
```

The comment in `001` justified this as "anyone with session_key can read (key is
secret)". That reasoning doesn't hold. `USING (true)` isn't scoped to a key the
caller supplied — any holder of the **public anon key** could run
`select * from camera_sessions` and page through every shop's sessions,
`session_key` included, then use those keys to upload arbitrary images into
other shops' loans.

Now: authenticated users can `SELECT` their own tenant's sessions (needed for
the Realtime subscription), and there is no INSERT/UPDATE/DELETE policy at all.
Nothing breaks, because every mobile-side write already goes through
`/api/camera` using the service role, which bypasses RLS.

**b. Any logged-in user could give themselves a paid plan.**

`tenants_update` correctly let an owner edit their own tenant row — but that row
also holds `plan`, `plan_status` and `trial_ends_at`. RLS is row-level; it can't
stop a permitted UPDATE from touching a particular column. So:

```sql
update tenants set plan = 'pro', trial_ends_at = '2099-01-01';
```

...would have unlocked every paid feature. Fixed with column-level grants:
`UPDATE` is revoked on the table and granted back only on `shop_name`. The same
treatment applies to `users` (a staff member could otherwise promote themselves
to `owner`).

**c. `UPDATE` policies had no `WITH CHECK`.**

`USING` governs which rows you may update; `WITH CHECK` governs what they may
become. Without it, a row could be updated *out* of its tenant — set
`tenant_id` to someone else's and the row silently moves. Added to every UPDATE
policy.

**d. No real foreign keys.** `users.auth_id` and `tenants.owner_id` were
declared `UUID` with a comment saying they reference `auth.users(id)`, but no
constraint enforced it. Added — `CASCADE` on users, `RESTRICT` on tenants
(deleting an auth account must not silently destroy a shop's loan book).

Also added composite FKs so a child row's `tenant_id` must match its parent
loan's. Without them an application bug could attach a deposit or photo to
another tenant's loan while still passing every RLS check.

### 3. Missing tables — `004_missing_tables.sql`

The desktop app has 15 MySQL tables; `001`/`002` covered 8. Added:
`closed_record_deposits`, `removed_records_with_deposits`,
`daily_deposit_records`, `app_state`, `tenant_settings`, `user_invitations`,
`migration_jobs`.

Deliberately **not** ported: `fingerprints` / `removed_fingerprints`
(hardware-bound — see §7 of the plan) and `drive_backup_history` (replaced by
Supabase PITR).

`loan_photos` gained `r2_key`, `byte_size`, `checksum`, `mime_type`,
`archived`, `archived_at`. The `archived` flag replaces the desktop's separate
`closed_record_image_archive` table — on object storage there's no reason to
split "on disk" from "in database". `photo_url` and `storage_path` are now
nullable and should be dropped once nothing reads them.

The daily purge of the two working tables (which the desktop did with a local
scheduled task) is now `purge_daily_working_tables()` on `pg_cron`, at 00:15
IST. **You must enable `pg_cron`** — see manual steps.

### 4. Photos moved to Cloudflare R2

- `lib/r2.ts` — server-only S3-compatible client. Presigned PUT/GET, key
  helpers, and `keyBelongsToTenant()`, which every path must call. RLS protects
  Postgres rows; **nothing protects R2 objects except that check.**
- `lib/storage.ts` — rewritten for the browser. Three-step upload: ask for a
  presigned URL → `PUT` straight to R2 → confirm. The file never passes through
  a Vercel function, which avoids both the payload limit and the bandwidth bill.
- `app/api/photos/upload-url` · `confirm` · `[loanId]` — authorise, then issue a
  5-minute signed URL.
- `compressImage()` — 1600px long edge at q0.8, landing ~150–300 KB. Shops
  photograph customers in poor light on cheap phones; going much smaller loses
  detail that matters when verifying someone months later.

**The bucket stays private.** These are customer identity photos. `001` used
`getPublicUrl()`, which would have made every one of them permanently and
anonymously fetchable by anyone who learned the URL.

### 5. Registration hole — `005_tenant_provisioning.sql`

`/api/auth/register` took `auth_id` **from the request body** with no
authentication. Anyone could `POST` an arbitrary `auth_id` and provision a
tenant for another person's account, or spam tenants for accounts that don't
exist. It also did two un-transactional inserts, so a failure on the second left
an ownerless tenant and a user who could never sign in.

Replaced by `provision_tenant()`, a `SECURITY DEFINER` function that reads
`auth.uid()` internally and does both inserts in one statement. `accept_invitation()`
follows the same pattern for staff, and checks that the signed-in email matches
the invited one — an invitation is addressed to a person, not a link that admits
whoever finds it.

### 6. Dead code removed

Deleted `lib/migration/parser.ts`, `app/api/migrate/`, `app/(app)/migrate/`,
`components/migration/`, and the sidebar link. The parser targeted a JSON export
format the Electron app has never produced (it emits a `.loanprobackup` ZIP
containing a mysqldump), and the self-serve upload flow isn't how migration
works now.

---

## Verification performed

| Check | Result |
|---|---|
| All 6 migration files parse as real PostgreSQL (`pglast`) | ✅ 158 statements |
| `rls.test.sql` parses | ✅ 30 statements |
| All 51 TS/TSX files parse | ✅ 0 syntax errors |
| Every local import resolves to a real exported symbol | ✅ 0 problems |
| No leftover references to `PHOTOS_BUCKET`, `storage_path`, `getPublicUrl`, `next-pwa` | ✅ clean |

**Not yet verified:** `next build` and `tsc --noEmit`. `npm install` needs
several minutes and exceeded the sandbox's per-command limit. Run both locally —
see below.

---

## What you need to do

### 1. Install and build

```bash
cd loanpro_saas
rm -rf node_modules package-lock.json
npm install
npx tsc --noEmit          # expect some errors until db:types is regenerated
npm run build
```

### 2. Create the R2 bucket

Cloudflare Dashboard → R2 → Create bucket → `loanpro-photos`.

**Leave public access disabled. Do not attach an `r2.dev` domain.**

Then Manage API Tokens → Create API Token → *Object Read & Write*, scoped to
that bucket. Put the values in `.env.local` (keys are in `.env.example`).

Verify the round-trip before building anything on top:

```bash
npx tsx -e "
import {putObject,presignDownload} from './lib/r2';
await putObject('test/hello.jpg', Buffer.from('hi'));
console.log(await presignDownload('test/hello.jpg'));
"
```

### 3. Apply the migrations

```bash
supabase db reset          # local — applies 001 through 005
```

For the hosted project, apply `003`, `004`, `005` in order via
`supabase db push` or the SQL editor.

Then enable **pg_cron**: Dashboard → Database → Extensions → `pg_cron`. Without
it the daily purge is skipped — `004` raises a NOTICE rather than failing, so
this is easy to miss.

### 4. Run the RLS tests

```bash
psql "$(supabase status -o json | jq -r .DB_URL)" -f supabase/tests/rls.test.sql
```

Every check raises on failure; a clean run means all passed. Run this after any
change to a policy.

### 5. Regenerate database types

```bash
supabase link --project-ref <your-ref>
npm run db:types
```

This replaces the `any` placeholder and turns a whole class of bug — renamed
column, wrong enum value — into compile errors. Worth doing before Phase 1
rather than after.

### 6. Go to Supabase Pro

Free projects pause after a week idle. Do this before a real shop depends on it.

---

## Decisions worth revisiting

- **`camera_sessions` has no DELETE policy or TTL sweep.** Expired rows
  accumulate. Add a `pg_cron` job alongside the daily purge.
- **Orphaned R2 objects.** If `/api/photos/confirm` fails after upload, the
  object is deleted — but a client that uploads and never confirms leaves one
  behind. A weekly sweep comparing R2 keys against `loan_photos` would reclaim
  them. Not urgent at your volume.
- **`photo_url` / `storage_path` on `loan_photos`** are nullable leftovers.
  Drop them in a later migration once nothing reads them.
