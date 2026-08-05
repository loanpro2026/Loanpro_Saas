-- ============================================================
-- Repair, part 2 of 2 -- run this after migration 009
--
-- Symptom this fixes: "Removals - Today" shows Rs.0 while the line under it
-- says "1 loans settled".
--
-- Cause. Migration 009 and migration 022 both define dashboard_stats().
-- 009's version has closed_count but no closed_amount; 022 added it. Applying
-- 009 therefore silently reverts dashboard_stats to the older shape, the
-- closed_amount key disappears from the JSON, and the dashboard reads a
-- missing key as zero. The count keeps working because it exists in both
-- versions -- which is precisely why the card contradicts itself.
--
-- The same applies to chart_data(), which 032 changed from SECURITY INVOKER
-- to SECURITY DEFINER.
--
-- Nothing is wrong with your data. Both figures are still in the loans table;
-- only the function reading them was rolled back a version.
--
-- Safe on live data: CREATE OR REPLACE FUNCTION and GRANT only. Nothing is
-- created, altered or written to. Safe to run more than once.
-- ============================================================


-- ===== 022_dashboard_stats.sql =====
-- ============================================================
-- Migration 022 — dashboard_stats gains the removal amount, and stops
-- double-counting one day
--
-- The desktop dashboard's four cards are Total Investment, Investment,
-- Removals and Interest (components/Card.tsx). Each shows an amount, a
-- trend against the preceding period, and a record count.
--
-- dashboard_stats() already returned three of the four. It had closed_COUNT
-- but no closed_AMOUNT, so the Removals card had a number of loans and no
-- money against it — which is the figure a shop actually wants: how much
-- principal came back this month.
--
-- ── The boundary bug ──────────────────────────────────────────────────────
--
-- The two windows were:
--
--     current   BETWEEN v_from      AND v_today
--     previous  BETWEEN v_prev_from AND v_from
--
-- BETWEEN is inclusive at both ends, so whatever happened on v_from itself was
-- counted in BOTH windows. On a quiet day that is invisible. On a busy one — a
-- shop that issued twenty loans exactly 30 days ago — it inflates the previous
-- period and the trend arrow points the wrong way. The previous window now
-- ends the day before.
-- ============================================================

CREATE OR REPLACE FUNCTION dashboard_stats(p_period TEXT DEFAULT 'month')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today     DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_from      DATE;
  v_prev_from DATE;
  v_prev_to   DATE;
BEGIN
  v_from := CASE p_period
    WHEN 'today'   THEN v_today
    WHEN 'week'    THEN v_today - 7
    WHEN 'quarter' THEN v_today - 90
    WHEN 'year'    THEN v_today - 365
    ELSE                v_today - 30
  END;

  -- Equal-length preceding window, ending the day before this one starts so
  -- the two never overlap.
  v_prev_to   := v_from - 1;
  v_prev_from := v_prev_to - (v_today - v_from);

  RETURN jsonb_build_object(
    'period', p_period,
    'from',   v_from,
    'to',     v_today,

    -- Money lent in the period.
    'issued_count',  (SELECT count(*)
                        FROM loans WHERE issue_date BETWEEN v_from AND v_today),
    'issued_amount', (SELECT COALESCE(sum(amount), 0)
                        FROM loans WHERE issue_date BETWEEN v_from AND v_today),

    -- Loans settled in the period, and the principal that came back with them.
    'closed_count',  (SELECT count(*)
                        FROM loans
                       WHERE status = 'closed' AND closed_date BETWEEN v_from AND v_today),
    'closed_amount', (SELECT COALESCE(sum(amount), 0)
                        FROM loans
                       WHERE status = 'closed' AND closed_date BETWEEN v_from AND v_today),

    -- Interest is the rupee amount written at closing, never a rate.
    'interest_earned', (SELECT COALESCE(sum(interest), 0)
                          FROM loans
                         WHERE status = 'closed' AND closed_date BETWEEN v_from AND v_today),
    'interest_count',  (SELECT count(*)
                          FROM loans
                         WHERE status = 'closed'
                           AND closed_date BETWEEN v_from AND v_today
                           AND COALESCE(interest, 0) > 0),

    'deposits_taken', (SELECT COALESCE(sum(amount), 0)
                         FROM deposits WHERE deposit_date BETWEEN v_from AND v_today),

    -- The preceding, non-overlapping window, for the trend arrows.
    'prev_issued_amount',   (SELECT COALESCE(sum(amount), 0)
                               FROM loans
                              WHERE issue_date BETWEEN v_prev_from AND v_prev_to),
    'prev_closed_amount',   (SELECT COALESCE(sum(amount), 0)
                               FROM loans
                              WHERE status = 'closed'
                                AND closed_date BETWEEN v_prev_from AND v_prev_to),
    'prev_interest_earned', (SELECT COALESCE(sum(interest), 0)
                               FROM loans
                              WHERE status = 'closed'
                                AND closed_date BETWEEN v_prev_from AND v_prev_to)
  );
END $$;

GRANT EXECUTE ON FUNCTION dashboard_stats(TEXT) TO authenticated;

COMMENT ON FUNCTION dashboard_stats(TEXT) IS
  'Figures behind the dashboard cards. p_period: today | week | month | '
  'quarter | year. The prev_* values cover an equal-length window ending the '
  'day before this one begins, so no day is counted twice.';

-- ===== 032_dashboard_core_fixes.sql =====
-- ============================================================
-- Migration 032 - authoritative dashboard deposits, chart and safe groups
-- ============================================================

CREATE OR REPLACE FUNCTION dashboard_snapshot()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant          UUID;
  v_today           DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_today_row       daily_cash_summary%ROWTYPE;
  v_cash_in_hand    NUMERIC(14,2) := 0;
  v_opening         NUMERIC(14,2) := 0;
  v_total_deposits  BIGINT := 0;
  v_received_today  BIGINT := 0;
  v_adjusted_today  BIGINT := 0;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_today_row
    FROM daily_cash_summary
   WHERE tenant_id = v_tenant AND date = v_today;

  SELECT COALESCE(left_cash, 0) INTO v_cash_in_hand
    FROM daily_cash_summary
   WHERE tenant_id = v_tenant AND date <= v_today
   ORDER BY date DESC
   LIMIT 1;
  v_cash_in_hand := COALESCE(v_cash_in_hand, 0);
  v_opening := CASE WHEN v_today_row.date IS NULL
    THEN v_cash_in_hand ELSE COALESCE(v_today_row.total_cash, 0) END;

  -- Deposits currently held against active loans. Closing a loan archives and
  -- removes these rows, so this is the live account balance, matching desktop.
  SELECT COALESCE(sum(d.amount), 0)::BIGINT INTO v_total_deposits
    FROM deposits d
    JOIN loans l ON l.id = d.loan_id AND l.tenant_id = v_tenant
   WHERE d.tenant_id = v_tenant AND l.status = 'active';

  -- A deposit received today may already have moved to the closed archive if
  -- its loan was also settled today. Read both ledgers exactly once.
  WITH all_deposits AS (
    SELECT loan_id, amount, deposit_date FROM deposits WHERE tenant_id = v_tenant
    UNION ALL
    SELECT loan_id, amount, deposit_date FROM closed_record_deposits WHERE tenant_id = v_tenant
  )
  SELECT COALESCE(sum(amount), 0)::BIGINT INTO v_received_today
    FROM all_deposits WHERE deposit_date = v_today;

  -- Deposits adjusted today are the deposits that offset loans settled today,
  -- regardless of the earlier date on which those deposits were collected.
  WITH all_deposits AS (
    SELECT loan_id, amount FROM deposits WHERE tenant_id = v_tenant
    UNION ALL
    SELECT loan_id, amount FROM closed_record_deposits WHERE tenant_id = v_tenant
  )
  SELECT COALESCE(sum(d.amount), 0)::BIGINT INTO v_adjusted_today
    FROM all_deposits d
    JOIN loans l ON l.id = d.loan_id AND l.tenant_id = v_tenant
   WHERE l.status = 'closed' AND l.closed_date = v_today;

  RETURN jsonb_build_object(
    'as_of', v_today,
    'active_loans', (SELECT count(*) FROM loans WHERE tenant_id = v_tenant AND status = 'active'),
    'active_principal', (SELECT COALESCE(sum(amount), 0) FROM loans WHERE tenant_id = v_tenant AND status = 'active'),
    'cash', jsonb_build_object(
      'opening_balance', v_opening,
      'cash_in_hand', v_cash_in_hand,
      'added_cash', COALESCE(v_today_row.added_cash, 0),
      'removed_cash', COALESCE(v_today_row.removed_cash, 0),
      'deposit_credit', v_received_today,
      'deposit_debit', v_adjusted_today,
      'total_deposits', v_total_deposits,
      'investments', COALESCE(v_today_row.investments, 0),
      'returns', COALESCE(v_today_row.returns, 0),
      'no_activity', v_today_row.date IS NULL
    ),
    'stock', jsonb_build_object(
      'cost', jsonb_build_object(
        'gold', COALESCE((SELECT sum(amount) FROM loans WHERE tenant_id = v_tenant AND status = 'active' AND category_type = 'Gold'), 0),
        'silver', COALESCE((SELECT sum(amount) FROM loans WHERE tenant_id = v_tenant AND status = 'active' AND category_type = 'Silver'), 0)
      ),
      'weight', jsonb_build_object(
        'gold', round(COALESCE((SELECT sum(weight) FROM loans WHERE tenant_id = v_tenant AND status = 'active' AND category_type = 'Gold'), 0), 3),
        'gold_unit', 'g',
        'silver', round(COALESCE((SELECT sum(weight) FROM loans WHERE tenant_id = v_tenant AND status = 'active' AND category_type = 'Silver'), 0) / 1000, 3),
        'silver_unit', 'kg'
      ),
      'count', jsonb_build_object(
        'gold', (SELECT count(*) FROM loans WHERE tenant_id = v_tenant AND status = 'active' AND category_type = 'Gold'),
        'silver', (SELECT count(*) FROM loans WHERE tenant_id = v_tenant AND status = 'active' AND category_type = 'Silver')
      ),
      'groups', jsonb_build_object(
        'gold', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('type', item_type, 'amount', total_amount, 'count', item_count) ORDER BY total_amount DESC)
            FROM (
              SELECT normalize_item_type(detailed_type)::TEXT AS item_type,
                     sum(amount)::BIGINT AS total_amount, count(*)::BIGINT AS item_count
                FROM loans
               WHERE tenant_id = v_tenant AND status = 'active' AND category_type = 'Gold'
               GROUP BY 1
            ) grouped
        ), '[]'::jsonb),
        'silver', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('type', item_type, 'amount', total_amount, 'count', item_count) ORDER BY total_amount DESC)
            FROM (
              SELECT normalize_item_type(detailed_type)::TEXT AS item_type,
                     sum(amount)::BIGINT AS total_amount, count(*)::BIGINT AS item_count
                FROM loans
               WHERE tenant_id = v_tenant AND status = 'active' AND category_type = 'Silver'
               GROUP BY 1
            ) grouped
        ), '[]'::jsonb)
      )
    )
  );
END $$;

REVOKE ALL ON FUNCTION dashboard_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION dashboard_snapshot() TO authenticated;

-- Explicit tenancy avoids depending on report-table RLS behaviour and keeps
-- the zero-activity months needed for a continuous chart.
CREATE OR REPLACE FUNCTION chart_data(p_months INTEGER DEFAULT 12)
RETURNS TABLE (month DATE, invested BIGINT, returned BIGINT, interest BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH context AS (
    SELECT get_tenant_id() AS tenant_id,
           (now() AT TIME ZONE 'Asia/Kolkata')::date AS today
  ), months AS (
    SELECT generate_series(
      date_trunc('month', context.today)::date
        - ((LEAST(GREATEST(p_months, 1), 36) - 1) || ' months')::interval,
      date_trunc('month', context.today)::date,
      '1 month'
    )::date AS m,
    context.tenant_id
    FROM context
  )
  SELECT mo.m,
         COALESCE((SELECT sum(l.amount) FROM loans l
                    WHERE l.tenant_id = mo.tenant_id
                      AND date_trunc('month', l.issue_date)::date = mo.m), 0)::BIGINT,
         COALESCE((SELECT sum(l.amount + COALESCE(l.interest, 0)) FROM loans l
                    WHERE l.tenant_id = mo.tenant_id AND l.status = 'closed'
                      AND date_trunc('month', l.closed_date)::date = mo.m), 0)::BIGINT,
         COALESCE((SELECT sum(COALESCE(l.interest, 0)) FROM loans l
                    WHERE l.tenant_id = mo.tenant_id AND l.status = 'closed'
                      AND date_trunc('month', l.closed_date)::date = mo.m), 0)::BIGINT
    FROM months mo
   WHERE mo.tenant_id IS NOT NULL
   ORDER BY mo.m;
$$;

REVOKE ALL ON FUNCTION chart_data(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION chart_data(INTEGER) TO authenticated;


-- ============================================================
-- Verify, and refuse to look successful if it is not
--
-- The whole reason this file exists is that a partly-applied repair looks
-- exactly like a finished one: no error, and a dashboard that quietly reads
-- zero. So the last thing it does is check its own work and raise if the
-- database is still in the broken state.
-- ============================================================
DO $$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_keys    TEXT[];
BEGIN
  -- Every function migration 009 is responsible for.
  SELECT array_agg(wanted.name ORDER BY wanted.name) INTO v_missing
    FROM (VALUES
      ('normalize_item_type'), ('lending_metrics'), ('jewellery_stock'),
      ('inventory_report'), ('jewellery_breakdown'), ('location_report'),
      ('daily_report'), ('account_report'), ('investment_report'),
      ('returns_report'), ('dashboard_stats'), ('chart_data'),
      ('dashboard_snapshot')
    ) AS wanted(name)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc
      WHERE proname = wanted.name AND pronamespace = 'public'::regnamespace);

  IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION
      'Repair incomplete. Still missing: %. Run repair-missing-009.sql first.',
      array_to_string(v_missing, ', ');
  END IF;

  -- dashboard_stats must be 022's version, not 009's. The difference is
  -- invisible except by its keys, and it is the difference between the
  -- Removals card showing a figure and showing zero.
  SELECT array_agg(k) INTO v_keys FROM jsonb_object_keys(dashboard_stats('today')) k;

  IF NOT (v_keys @> ARRAY['closed_amount', 'interest_count', 'prev_closed_amount']) THEN
    RAISE EXCEPTION
      'dashboard_stats is still migration 009''s version - closed_amount is absent, so Removals will read zero. Re-run this file.';
  END IF;

  RAISE NOTICE 'Repair verified: all 13 functions present, dashboard_stats has closed_amount.';
END $$;

NOTIFY pgrst, 'reload schema';
