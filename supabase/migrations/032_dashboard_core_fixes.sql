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
