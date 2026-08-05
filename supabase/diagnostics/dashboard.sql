-- ============================================================
-- Dashboard diagnostic
--
-- Paste the whole file into the Supabase SQL editor and run it. It changes
-- nothing: everything happens inside a transaction that ends in ROLLBACK.
--
-- Why this exists. The dashboard shows "could not be loaded" for the active
-- balance, the cash position and the safe inventory, but not for the period
-- figures or the chart. Those come from different calls, so something specific
-- is failing — and both the primary call (dashboard_snapshot) and the
-- compatibility fallback behind it are failing together, which means they
-- share a cause. Reading it out of the database beats guessing at it.
--
-- The important part is the role switch. The SQL editor runs as `postgres`,
-- which bypasses row-level security and every EXECUTE grant, so a function
-- that is broken *for your app* will often succeed when you call it by hand.
-- This impersonates the `authenticated` role with a real user's JWT claims,
-- which is what PostgREST actually does. A missing GRANT or an RLS policy
-- shows up here and nowhere else.
--
-- By default it uses the oldest account in public.users. To pin it to a
-- specific login, replace the marked line in section 1.
-- ============================================================

BEGIN;

-- ── 1. Who to impersonate ───────────────────────────────────────────────────
-- Read as postgres, before privileges are dropped: once the role is
-- `authenticated`, RLS on public.users would hide the very row we need.
CREATE TEMP TABLE _who ON COMMIT DROP AS
SELECT u.auth_id, u.tenant_id, u.email, u.role
  FROM public.users u
 -- To target one account, replace the next line with:
 --   WHERE u.email = 'you@example.com'
 ORDER BY u.created_at
 LIMIT 1;

SELECT 'impersonating' AS step, email, role, tenant_id FROM _who;


-- ── 2. Does each object exist, and can `authenticated` execute it? ──────────
-- A function that is missing entirely and a function the app has no EXECUTE
-- grant on produce very different errors, and are fixed very differently.
SELECT
  wanted.name                                       AS function,
  CASE WHEN p.oid IS NULL THEN 'MISSING'
       ELSE 'exists' END                            AS state,
  CASE WHEN p.oid IS NULL THEN '—'
       WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
       THEN 'authenticated may execute'
       ELSE 'NO EXECUTE GRANT for authenticated' END AS grants,
  COALESCE(pg_get_function_identity_arguments(p.oid), '') AS args
FROM (VALUES
  ('dashboard_snapshot'), ('dashboard_stats'), ('chart_data'),
  ('lending_metrics'), ('jewellery_stock'), ('inventory_report'),
  ('normalize_item_type'), ('get_tenant_id'), ('my_settings')
) AS wanted(name)
LEFT JOIN pg_proc p
       ON p.proname = wanted.name
      AND p.pronamespace = 'public'::regnamespace
ORDER BY 2 DESC, 1;

-- The table the cash figures come from, and whether the app can read it.
SELECT 'daily_cash_summary' AS object,
       has_table_privilege('authenticated', 'public.daily_cash_summary', 'SELECT') AS authenticated_may_select,
       (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'daily_cash_summary') AS rls_policies;


-- ── 3. Run each call the way the app runs it ────────────────────────────────
CREATE FUNCTION pg_temp.attempt(p_label TEXT, p_sql TEXT)
RETURNS TABLE (call TEXT, result TEXT)
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- Each attempt gets its own subtransaction, so one failure does not abort
  -- the rest of the run — which is the whole point of testing them together.
  BEGIN
    EXECUTE p_sql;
    RETURN QUERY SELECT p_label, 'OK'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT p_label, ('FAILED  ' || SQLSTATE || '  ' || SQLERRM)::TEXT;
  END;
END $fn$;

SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT auth_id FROM _who))::text, true);
SET LOCAL ROLE authenticated;

SELECT r.*
FROM (VALUES
  ('get_tenant_id()',        'SELECT get_tenant_id()'),
  ('dashboard_snapshot()',   'SELECT dashboard_snapshot()'),
  ('dashboard_stats(today)', 'SELECT dashboard_stats(''today'')'),
  ('chart_data(12)',         'SELECT * FROM chart_data(12)'),
  ('lending_metrics()',      'SELECT lending_metrics()'),
  ('jewellery_stock()',      'SELECT jewellery_stock()'),
  ('inventory_report()',     'SELECT * FROM inventory_report()'),
  ('my_settings()',          'SELECT my_settings()'),
  -- Exactly the column list the dashboard fallback asks PostgREST for. If one
  -- of these columns is missing or unreadable the fallback fails as a whole,
  -- which is what makes both paths go down together.
  ('daily_cash_summary select',
   'SELECT deposit_credit, deposit_debit, added_cash, removed_cash,
           investments, returns, total_cash, left_cash
      FROM daily_cash_summary LIMIT 1')
) AS t(label, sql)
CROSS JOIN LATERAL pg_temp.attempt(t.label, t.sql) AS r;

RESET ROLE;


-- ── 4. If dashboard_snapshot succeeded, is it returning real numbers? ───────
-- "Loaded successfully" and "loaded the right figure" are different questions,
-- and a dashboard of confident zeroes is worse than one that admits it failed.
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT auth_id FROM _who))::text, true);
SET LOCAL ROLE authenticated;

SELECT
  s->>'as_of'                        AS as_of,
  s->>'active_loans'                 AS active_loans,
  s->>'active_principal'             AS active_principal,
  s->'cash'->>'cash_in_hand'         AS cash_in_hand,
  s->'cash'->>'total_deposits'       AS total_deposits,
  s->'cash'->>'no_activity'          AS no_activity,
  s->'stock'->'count'->>'gold'       AS gold_items,
  s->'stock'->'count'->>'silver'     AS silver_items
FROM (SELECT dashboard_snapshot() AS s) x;

RESET ROLE;


-- ── 5. What the figures should be, read directly ────────────────────────────
-- The independent check. If section 4 disagrees with this, the function is
-- wrong rather than absent — a different and more dangerous problem.
SELECT
  (SELECT count(*)                       FROM public.loans
    WHERE tenant_id = (SELECT tenant_id FROM _who) AND status = 'active') AS active_loans,
  (SELECT COALESCE(sum(amount), 0)       FROM public.loans
    WHERE tenant_id = (SELECT tenant_id FROM _who) AND status = 'active') AS active_principal,
  (SELECT COALESCE(sum(d.amount), 0)     FROM public.deposits d
     JOIN public.loans l ON l.id = d.loan_id
    WHERE d.tenant_id = (SELECT tenant_id FROM _who) AND l.status = 'active') AS deposits_held,
  (SELECT count(*)                       FROM public.daily_cash_summary
    WHERE tenant_id = (SELECT tenant_id FROM _who)) AS cash_summary_rows;

ROLLBACK;
