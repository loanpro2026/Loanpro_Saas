-- ============================================================
-- Migration 003 — Security fixes
--
-- Fixes two classes of problem in 001_initial_schema.sql:
--   A. camera_sessions was readable and writable by ANY holder of the
--      public anon key, across every tenant.
--   B. tenants.owner_id / users.auth_id pointed at auth.users(id) by
--      convention only — no foreign key, so orphaned rows were possible.
-- ============================================================


-- ============================================================
-- A. camera_sessions — close the cross-tenant hole
-- ============================================================
-- The old policies were:
--     FOR SELECT USING (true)     -- any anon key holder could read every session
--     FOR UPDATE USING (true)     -- ...and overwrite any tenant's photo_url
--
-- The comment in 001 justified this as "anyone with session_key can read
-- (key is secret)". That reasoning does not hold: RLS `USING (true)` is not
-- scoped to a WHERE clause the caller supplied. A client can simply
-- `select * from camera_sessions` and enumerate every session for every shop,
-- session_key included — which then also lets them upload to those sessions.
--
-- The unauthenticated mobile flow does NOT need these policies: every mobile
-- request already goes through /api/camera, which uses the service role and
-- bypasses RLS. The only thing authenticated clients need is to watch their
-- own tenant's sessions over Realtime.

DROP POLICY IF EXISTS "camera_select_by_key"   ON camera_sessions;
DROP POLICY IF EXISTS "camera_update_by_key"   ON camera_sessions;
DROP POLICY IF EXISTS "camera_insert"          ON camera_sessions;

-- Authenticated users may read only their own tenant's sessions.
-- This is what makes the Realtime subscription work in the browser.
CREATE POLICY "camera_sessions_select_own_tenant" ON camera_sessions
  FOR SELECT
  TO authenticated
  USING (tenant_id = get_tenant_id());

-- No INSERT / UPDATE / DELETE policy is defined on purpose.
-- With RLS enabled and no permissive policy, those operations are denied for
-- `anon` and `authenticated`. Session creation and photo attachment happen
-- exclusively in /api/camera via the service role, which bypasses RLS.

-- Realtime needs the table in the publication for subscriptions to fire.
-- RLS is still enforced on Realtime payloads, so this is safe.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE camera_sessions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;  -- publication absent on some local setups
END $$;


-- ============================================================
-- A2. Harden get_tenant_id()
-- ============================================================
-- Pin search_path so the function cannot be hijacked by a caller-controlled
-- schema, and make it SECURITY DEFINER so it can read `users` regardless of
-- the caller's own RLS visibility. Without DEFINER this function is subject
-- to the users_select policy, which itself calls get_tenant_id() — a
-- circular dependency that silently returns NULL and blocks everything.

CREATE OR REPLACE FUNCTION get_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT tenant_id FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION get_tenant_id() FROM public;
GRANT  EXECUTE ON FUNCTION get_tenant_id() TO authenticated;
-- anon needs EXECUTE too. Policies inherited from 001 have no TO clause, so
-- they apply to every role including anon; without the grant an anonymous
-- query raises a permission error instead of simply returning no rows. The
-- function returns NULL for anon, so `tenant_id = NULL` denies access anyway.
GRANT  EXECUTE ON FUNCTION get_tenant_id() TO anon;


-- ============================================================
-- B. Real foreign keys to auth.users
-- ============================================================
-- Delete any rows that would violate the constraints before adding them,
-- so this migration is safe to run on a database that already has data.

DELETE FROM users
 WHERE auth_id IS NOT NULL
   AND auth_id NOT IN (SELECT id FROM auth.users);

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_auth_id_fkey;
ALTER TABLE users
  ADD  CONSTRAINT users_auth_id_fkey
  FOREIGN KEY (auth_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_owner_id_fkey;
ALTER TABLE tenants
  ADD  CONSTRAINT tenants_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
-- RESTRICT, not CASCADE: deleting an auth user must not silently destroy a
-- shop's entire loan book. Reassign ownership first, deliberately.


-- ============================================================
-- C. Composite tenant integrity
-- ============================================================
-- Child rows carry their own tenant_id (needed for RLS without a join).
-- Nothing currently forces that tenant_id to match the parent loan's, so an
-- application bug could attach a photo or deposit to another tenant's loan
-- while still passing every RLS check. These composite FKs make that
-- impossible at the database level.

ALTER TABLE loans
  DROP CONSTRAINT IF EXISTS loans_id_tenant_uniq;
ALTER TABLE loans
  ADD  CONSTRAINT loans_id_tenant_uniq UNIQUE (id, tenant_id);

ALTER TABLE deposits
  DROP CONSTRAINT IF EXISTS deposits_loan_id_fkey;
ALTER TABLE deposits
  DROP CONSTRAINT IF EXISTS deposits_tenant_match;
ALTER TABLE deposits
  ADD  CONSTRAINT deposits_tenant_match
  FOREIGN KEY (loan_id, tenant_id) REFERENCES loans(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE loan_photos
  DROP CONSTRAINT IF EXISTS loan_photos_loan_id_fkey;
ALTER TABLE loan_photos
  DROP CONSTRAINT IF EXISTS loan_photos_tenant_match;
ALTER TABLE loan_photos
  ADD  CONSTRAINT loan_photos_tenant_match
  FOREIGN KEY (loan_id, tenant_id) REFERENCES loans(id, tenant_id) ON DELETE CASCADE;


-- ============================================================
-- D. Tighten the remaining FOR ALL policies
-- ============================================================
-- `FOR ALL USING (x)` applies `x` as the USING clause but leaves WITH CHECK
-- defaulting to the same expression, which is correct here — but being
-- explicit avoids surprises if these are ever edited.

DROP POLICY IF EXISTS "cash_summary_all" ON daily_cash_summary;
CREATE POLICY "cash_summary_all" ON daily_cash_summary
  FOR ALL TO authenticated
  USING      (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS "cash_tx_all" ON cash_transactions;
CREATE POLICY "cash_tx_all" ON cash_transactions
  FOR ALL TO authenticated
  USING      (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS "activity_log_all" ON activity_log;
CREATE POLICY "activity_log_all" ON activity_log
  FOR ALL TO authenticated
  USING      (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

-- Loans/deposits/photos had UPDATE policies with no WITH CHECK, which allowed
-- a row to be updated *out* of the tenant (set tenant_id = someone else's).
DROP POLICY IF EXISTS "loans_update" ON loans;
CREATE POLICY "loans_update" ON loans
  FOR UPDATE TO authenticated
  USING      (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS "deposits_update" ON deposits;
CREATE POLICY "deposits_update" ON deposits
  FOR UPDATE TO authenticated
  USING      (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS "loan_photos_update" ON loan_photos;
CREATE POLICY "loan_photos_update" ON loan_photos
  FOR UPDATE TO authenticated
  USING      (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS "tenants_update" ON tenants;
CREATE POLICY "tenants_update" ON tenants
  FOR UPDATE TO authenticated
  USING      (id = get_tenant_id())
  WITH CHECK (id = get_tenant_id());

-- Subscriptions must never be writable by the client — plan and status are
-- money. Only the Razorpay webhook (service role) may write them.
DROP POLICY IF EXISTS "subscriptions_insert" ON subscriptions;


-- ============================================================
-- E. Stop users granting themselves a paid plan
-- ============================================================
-- `tenants_update` lets an owner edit their own tenant row, which is correct
-- for shop_name — but that row also holds `plan`, `plan_status` and
-- `trial_ends_at`. RLS is row-level only; it cannot stop a permitted UPDATE
-- from touching a particular column. Without this, any logged-in user could
--     update tenants set plan = 'pro', trial_ends_at = '2099-01-01'
-- and unlock every paid feature for free.
--
-- Column-level privileges are the fix. Revoke UPDATE on the whole table, then
-- grant it back only for the columns a shop owner is allowed to change.

REVOKE UPDATE ON tenants FROM authenticated;
GRANT  UPDATE (shop_name, updated_at) ON tenants TO authenticated;

-- Same reasoning for users: a staff member must not promote themselves to
-- owner, or move themselves into another tenant.
REVOKE UPDATE ON users FROM authenticated;
GRANT  UPDATE (full_name, updated_at) ON users TO authenticated;
