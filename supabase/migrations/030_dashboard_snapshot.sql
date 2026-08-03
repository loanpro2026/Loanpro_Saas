-- ============================================================
-- Migration 030 — one authoritative dashboard snapshot
--
-- The dashboard previously assembled its headline figures from two separate
-- SECURITY INVOKER report functions. In production the ordinary loans query
-- could show a row while those aggregates returned an empty JSON object,
-- leaving Total Investment and the jewellery card at zero.
--
-- Resolve the caller's tenant once, then apply it explicitly to every
-- aggregate. Besides fixing that inconsistent state, this returns the cash
-- and deposit movements the shop needs to reconcile the drawer.
-- ============================================================

CREATE OR REPLACE FUNCTION dashboard_snapshot()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant       UUID;
  v_today        DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_today_row    daily_cash_summary%ROWTYPE;
  v_cash_in_hand NUMERIC(14,2) := 0;
  v_opening      NUMERIC(14,2) := 0;
BEGIN
  SELECT tenant_id INTO v_tenant
    FROM users
   WHERE auth_id = auth.uid();

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No tenant is attached to this account'
      USING ERRCODE = '42501';
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

  IF FOUND AND v_today_row.date IS NOT NULL THEN
    v_opening := COALESCE(v_today_row.total_cash, 0);
  ELSE
    v_opening := v_cash_in_hand;
  END IF;

  RETURN jsonb_build_object(
    'as_of', v_today,
    'active_loans', (
      SELECT count(*) FROM loans
       WHERE tenant_id = v_tenant AND status = 'active'
    ),
    'active_principal', (
      SELECT COALESCE(sum(amount), 0) FROM loans
       WHERE tenant_id = v_tenant AND status = 'active'
    ),
    'cash', jsonb_build_object(
      'opening_balance', v_opening,
      'cash_in_hand', v_cash_in_hand,
      'added_cash', COALESCE(v_today_row.added_cash, 0),
      'removed_cash', COALESCE(v_today_row.removed_cash, 0),
      'deposit_credit', COALESCE(v_today_row.deposit_credit, 0),
      'deposit_debit', COALESCE(v_today_row.deposit_debit, 0),
      'investments', COALESCE(v_today_row.investments, 0),
      'returns', COALESCE(v_today_row.returns, 0),
      'no_activity', v_today_row.date IS NULL
    ),
    'stock', jsonb_build_object(
      'cost', jsonb_build_object(
        'gold', COALESCE((SELECT sum(amount) FROM loans
                          WHERE tenant_id = v_tenant AND status = 'active'
                            AND category_type = 'Gold'), 0),
        'silver', COALESCE((SELECT sum(amount) FROM loans
                            WHERE tenant_id = v_tenant AND status = 'active'
                              AND category_type = 'Silver'), 0)
      ),
      'weight', jsonb_build_object(
        'gold', round(COALESCE((SELECT sum(weight) FROM loans
                               WHERE tenant_id = v_tenant AND status = 'active'
                                 AND category_type = 'Gold'), 0), 3),
        'gold_unit', 'g',
        'silver', round(COALESCE((SELECT sum(weight) FROM loans
                                 WHERE tenant_id = v_tenant AND status = 'active'
                                   AND category_type = 'Silver'), 0) / 1000, 3),
        'silver_unit', 'kg'
      ),
      'count', jsonb_build_object(
        'gold', (SELECT count(*) FROM loans
                  WHERE tenant_id = v_tenant AND status = 'active'
                    AND category_type = 'Gold'),
        'silver', (SELECT count(*) FROM loans
                    WHERE tenant_id = v_tenant AND status = 'active'
                      AND category_type = 'Silver')
      )
    )
  );
END $$;

REVOKE ALL ON FUNCTION dashboard_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION dashboard_snapshot() TO authenticated;

COMMENT ON FUNCTION dashboard_snapshot() IS
  'Tenant-scoped active principal, today cash movements, and live gold/silver '
  'stock for the dashboard. Cash in hand carries forward from the latest day.';
