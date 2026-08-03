-- ============================================================
-- RLS regression tests
--
-- HOSTED PROJECT (what you have):
--   Paste this whole file into the Supabase SQL editor and run it.
--   The final statement is ROLLBACK, so nothing below is ever committed —
--   the fixture shops, users and loans disappear when it finishes. It is
--   safe to run against the same project you are about to put real data in,
--   and worth re-running after any change to a policy or a GRANT.
--
--   Read the NOTICE output, not just "Success". Every check prints either
--   `ok  <label>` or raises. One raise aborts the rest, so fix and re-run.
--
-- LOCAL (if you ever set up Docker):
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -f supabase/tests/rls.test.sql
--
-- These exist because the original 001 schema shipped a policy that let any
-- anon key holder read and overwrite every tenant's camera sessions. A test
-- is the only thing that stops that reappearing.
-- ============================================================

BEGIN;

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Two shops, one user each. Shop A is the "attacker", shop B the victim.

INSERT INTO auth.users (id, email, aud, role)
VALUES ('11111111-1111-1111-1111-111111111111', 'a@example.com', 'authenticated', 'authenticated'),
       ('22222222-2222-2222-2222-222222222222', 'b@example.com', 'authenticated', 'authenticated')
ON CONFLICT DO NOTHING;

INSERT INTO tenants (id, shop_name, owner_id, plan, plan_status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Shop A', '11111111-1111-1111-1111-111111111111', 'trial', 'active'),
       ('bbbbbbbb-0000-0000-0000-000000000002', 'Shop B', '22222222-2222-2222-2222-222222222222', 'pro',   'active');

INSERT INTO users (auth_id, tenant_id, full_name, email, role)
VALUES ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'User A', 'a@example.com', 'owner'),
       ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000002', 'User B', 'b@example.com', 'owner');

INSERT INTO loans (id, tenant_id, name, amount, category_type, issue_date)
VALUES (9001, 'aaaaaaaa-0000-0000-0000-000000000001', 'Customer A', 50000, 'Gold', '2026-01-10'),
       (9002, 'bbbbbbbb-0000-0000-0000-000000000002', 'Customer B', 75000, 'Gold', '2026-01-11');

INSERT INTO camera_sessions (id, tenant_id, loan_id, session_key, status)
VALUES ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
        9002, 'victim-secret-session-key', 'pending');


-- ── Helper: impersonate a signed-in user ────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.login(p_uid UUID) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('SET LOCAL role authenticated');
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', p_uid, 'role', 'authenticated')::text);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.logout() RETURNS void
LANGUAGE plpgsql AS $$ BEGIN RESET role; RESET request.jwt.claims; END $$;

CREATE OR REPLACE FUNCTION pg_temp.check(p_label TEXT, p_ok BOOLEAN) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok THEN RAISE NOTICE 'ok    %', p_label;
  ELSE         RAISE EXCEPTION 'FAIL  %', p_label;
  END IF;
END $$;


-- ============================================================
-- 1. Loans are isolated per tenant
-- ============================================================
SELECT pg_temp.login('11111111-1111-1111-1111-111111111111');

SELECT pg_temp.check('A sees only its own loan',
  (SELECT count(*) FROM loans) = 1);
SELECT pg_temp.check('A cannot see B''s loan',
  NOT EXISTS (SELECT 1 FROM loans WHERE id = 9002));


-- ============================================================
-- 2. camera_sessions — the original hole
-- ============================================================
-- Before 003 this returned B's row, session_key included, to any caller.
SELECT pg_temp.check('A cannot read B''s camera session',
  NOT EXISTS (SELECT 1 FROM camera_sessions
               WHERE id = 'cccccccc-0000-0000-0000-000000000001'));

SELECT pg_temp.check('A sees no camera sessions at all',
  (SELECT count(*) FROM camera_sessions) = 0);

-- ...and cannot hijack one by writing to it.
DO $$
BEGIN
  UPDATE camera_sessions
     SET status = 'captured', r2_key = 'aaaaaaaa-0000-0000-0000-000000000001/stolen.jpg'
   WHERE session_key = 'victim-secret-session-key';
  IF FOUND THEN
    RAISE EXCEPTION 'FAIL  A was able to overwrite B''s camera session';
  END IF;
  RAISE NOTICE 'ok    A cannot overwrite B''s camera session';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok    A cannot overwrite B''s camera session (denied)';
END $$;


-- ============================================================
-- 3. Plan escalation
-- ============================================================
-- tenants_update lets an owner rename their shop. It must not let them
-- upgrade their own plan.
DO $$
BEGIN
  UPDATE tenants SET plan = 'pro', plan_status = 'active'
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'FAIL  A granted itself the pro plan';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok    A cannot change its own plan';
END $$;

-- The legitimate case still works.
UPDATE tenants SET shop_name = 'Shop A Renamed'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check('A can still rename its own shop',
  (SELECT shop_name FROM tenants WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001')
   = 'Shop A Renamed');


-- ============================================================
-- 4. Role escalation
-- ============================================================
DO $$
BEGIN
  UPDATE users SET role = 'owner'
   WHERE auth_id = '11111111-1111-1111-1111-111111111111';
  RAISE EXCEPTION 'FAIL  A could write its own role';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok    A cannot change its own role';
END $$;


-- ============================================================
-- 5. Cross-tenant writes
-- ============================================================
DO $$
BEGIN
  INSERT INTO loans (tenant_id, name, amount, category_type, issue_date)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'Planted', 1, 'Gold', '2026-01-01');
  RAISE EXCEPTION 'FAIL  A inserted a loan into B''s tenant';
EXCEPTION
  WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'ok    A cannot insert into B''s tenant';
END $$;

-- A photo must not be attachable to another tenant's loan, even with A's own
-- tenant_id on the row — this is what the composite FK from 003 prevents.
DO $$
BEGIN
  INSERT INTO loan_photos (loan_id, tenant_id, r2_key)
  VALUES (9002, 'aaaaaaaa-0000-0000-0000-000000000001', 'a/stolen.jpg');
  RAISE EXCEPTION 'FAIL  A attached a photo to B''s loan';
EXCEPTION
  WHEN insufficient_privilege OR foreign_key_violation OR check_violation THEN
    RAISE NOTICE 'ok    A cannot attach a photo to B''s loan';
END $$;


-- ============================================================
-- 6. Subscriptions are not client-writable
-- ============================================================
DO $$
BEGIN
  INSERT INTO subscriptions (tenant_id, plan, amount, status)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'pro', 0, 'active');
  RAISE EXCEPTION 'FAIL  A created itself a free subscription';
EXCEPTION
  WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'ok    A cannot write subscriptions';
END $$;


-- ============================================================
-- 7. Loan mutations only pass through transactional functions
-- ============================================================
SELECT pg_temp.login('11111111-1111-1111-1111-111111111111');

DO $$
BEGIN
  UPDATE loans SET amount = 1 WHERE id = 9001;
  RAISE EXCEPTION 'FAIL  authenticated caller directly updated a loan';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok    direct loan updates are denied';
END $$;

SELECT update_active_loan(9001, '{"name":"Customer A Corrected","category_type":"Silver","amount":51000}'::jsonb);
SELECT pg_temp.check('transactional active-loan correction works',
  (SELECT name = 'Customer A Corrected' AND category_type = 'Silver' AND amount = 51000
     FROM loans WHERE id = 9001));

DO $$
BEGIN
  PERFORM update_active_loan(9001, '{"issue_date":"2099-01-01"}'::jsonb);
  RAISE EXCEPTION 'FAIL  future issue date was accepted';
EXCEPTION
  WHEN invalid_parameter_value THEN
    RAISE NOTICE 'ok    future issue date is rejected at the data boundary';
END $$;

SELECT add_deposit(9001, 1000, '2026-01-12');
DO $$
BEGIN
  UPDATE deposits SET amount = 999999 WHERE loan_id = 9001;
  RAISE EXCEPTION 'FAIL  authenticated caller directly changed a deposit';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok    direct deposit mutations are denied';
END $$;

DO $$
BEGIN
  INSERT INTO cash_transactions (tenant_id, type, amount, reason, transaction_date)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'add', 999999, 'bypass', '2026-01-12');
  RAISE EXCEPTION 'FAIL  authenticated caller directly inserted cash';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok    direct cash mutations are denied';
END $$;

DO $$
BEGIN
  INSERT INTO api_rate_limits (scope, identity_hash, request_count)
  VALUES ('bypass', repeat('a', 64), 1);
  RAISE EXCEPTION 'FAIL  authenticated caller wrote the API limiter table';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok    API limiter state is service-role only';
END $$;

DO $$
BEGIN
  PERFORM consume_api_rate_limit('bypass', repeat('a', 64), 1, 60);
  RAISE EXCEPTION 'FAIL  authenticated caller invoked the limiter function';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok    limiter function is service-role only';
END $$;

DO $$
BEGIN
  PERFORM tenant_totals('bbbbbbbb-0000-0000-0000-000000000002');
  RAISE EXCEPTION 'FAIL  authenticated caller read another tenant migration totals';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok    migration reconciliation is service-role only';
END $$;

DO $$
BEGIN
  PERFORM close_loan(9001, 0, '2026-01-11');
  RAISE EXCEPTION 'FAIL  loan closed before an existing deposit';
EXCEPTION
  WHEN invalid_parameter_value THEN
    RAISE NOTICE 'ok    closing before an existing deposit is rejected';
END $$;
SELECT pg_temp.check('failed close leaves loan and deposit intact',
  (SELECT status = 'active' FROM loans WHERE id = 9001)
  AND EXISTS (SELECT 1 FROM deposits WHERE loan_id = 9001 AND amount = 1000));

DO $$
BEGIN
  PERFORM close_loan(9001, -1, '2026-01-12');
  RAISE EXCEPTION 'FAIL  negative settlement interest was accepted';
EXCEPTION
  WHEN invalid_parameter_value THEN
    RAISE NOTICE 'ok    negative settlement interest is rejected';
END $$;

SELECT append_loan_remark(9001, 'first note');
SELECT append_loan_remark(9001, 'second note');
DO $$
BEGIN
  PERFORM delete_loan_remark(9001, 0, '[stale] wrong note');
  RAISE EXCEPTION 'FAIL  stale remark deletion was accepted';
EXCEPTION
  WHEN serialization_failure THEN
    RAISE NOTICE 'ok    stale remark deletion fails safely';
END $$;
SELECT pg_temp.check('stale delete preserved both remarks',
  (SELECT cardinality(string_to_array(remarks, E'\n')) = 2 FROM loans WHERE id = 9001));

DO $$
BEGIN
  DELETE FROM loans WHERE id = 9001;
  RAISE EXCEPTION 'FAIL  authenticated caller directly deleted a loan';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok    direct loan deletes are denied';
END $$;

SELECT delete_loan(9001);
SELECT pg_temp.check('transactional owner deletion works',
  NOT EXISTS (SELECT 1 FROM loans WHERE id = 9001));


-- ============================================================
-- 8. Anonymous callers see nothing
-- ============================================================
SELECT pg_temp.logout();
SET LOCAL role anon;

SELECT pg_temp.check('anon sees no loans',           (SELECT count(*) FROM loans) = 0);
SELECT pg_temp.check('anon sees no camera sessions', (SELECT count(*) FROM camera_sessions) = 0);
SELECT pg_temp.check('anon sees no tenants',         (SELECT count(*) FROM tenants) = 0);

RESET role;

DO $$ BEGIN RAISE NOTICE E'\n=== All RLS tests passed ==='; END $$;

ROLLBACK;
