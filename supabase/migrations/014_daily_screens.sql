-- ============================================================
-- Migration 014 — End-of-day working screens
--
-- The desktop surfaces two working tables as screens the shop reviews before
-- closing up:
--
--   removed_records_with_deposits — loans closed today that had part-payments
--                                   against them, so the operator can check
--                                   the deposit money was properly accounted
--   daily_deposit_records         — every part-payment taken today
--
-- Both are purged nightly (migration 004). They exist because the numbers on
-- the daily cash report are totals, and a shop reconciling the drawer needs
-- the individual entries behind them.
-- ============================================================


CREATE OR REPLACE FUNCTION removed_records_report(p_date DATE DEFAULT NULL)
RETURNS TABLE (
  id BIGINT, loan_id BIGINT, name TEXT, father_name TEXT, location TEXT,
  amount INTEGER, detailed_type TEXT, weight NUMERIC,
  issue_date DATE, closed_date DATE, total_deposits INTEGER, remarks TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT r.id, r.loan_id, r.name, r.father_name, r.location,
         r.amount, r.detailed_type, r.weight,
         r.issue_date, r.closed_date, r.total_deposits, r.remarks
    FROM removed_records_with_deposits r
   WHERE r.removal_date = COALESCE(p_date, (now() AT TIME ZONE 'Asia/Kolkata')::date)
   ORDER BY r.total_deposits DESC, r.loan_id;
$$;


CREATE OR REPLACE FUNCTION daily_deposits_report(p_date DATE DEFAULT NULL)
RETURNS TABLE (
  id BIGINT, loan_id BIGINT, loan_name TEXT, father_name TEXT, location TEXT,
  loan_amount INTEGER, detailed_type TEXT, weight NUMERIC,
  deposit_amount INTEGER, deposit_date DATE
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT d.id, d.loan_id, d.loan_name, d.father_name, d.location,
         d.loan_amount, d.detailed_type, d.weight,
         d.deposit_amount, d.deposit_date
    FROM daily_deposit_records d
   WHERE d.deposit_date = COALESCE(p_date, (now() AT TIME ZONE 'Asia/Kolkata')::date)
   ORDER BY d.deposit_amount DESC, d.loan_id;
$$;


-- ============================================================
-- Manual clearing
-- ============================================================
-- The desktop lets an operator clear a day's working rows once they have
-- reconciled them, rather than waiting for the nightly purge. Ported because
-- shops use it as a "done, checked" marker.

CREATE OR REPLACE FUNCTION clear_removed_records(p_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant UUID;
  v_count  INTEGER;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  DELETE FROM removed_records_with_deposits
   WHERE tenant_id = v_tenant AND removal_date = p_date;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Only the working snapshot goes. The loans themselves, and the archived
  -- deposits the reports are built from, are untouched — the desktop behaves
  -- the same way, and an operator clicking "clear" is not asking to delete
  -- their loan book.
  RETURN v_count;
END $$;


CREATE OR REPLACE FUNCTION clear_daily_deposits(p_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant UUID;
  v_count  INTEGER;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  DELETE FROM daily_deposit_records
   WHERE tenant_id = v_tenant AND deposit_date = p_date;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END $$;


-- ============================================================
-- Editing a deposit
-- ============================================================
-- The desktop has updateDeposit; the web had a server action with no UI. This
-- keeps the daily working row in step, which a bare UPDATE would not.

CREATE OR REPLACE FUNCTION update_deposit(
  p_deposit_id BIGINT,
  p_amount     INTEGER,
  p_date       DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant UUID;
  v_old    deposits%ROWTYPE;
  v_loan   loans%ROWTYPE;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Deposit must be greater than zero' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_old FROM deposits
   WHERE id = p_deposit_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_loan FROM loans WHERE id = v_old.loan_id AND tenant_id = v_tenant;
  IF p_date < v_loan.issue_date THEN
    RAISE EXCEPTION 'Deposit date cannot be before the loan was issued (%)', v_loan.issue_date
      USING ERRCODE = '22023';
  END IF;

  UPDATE deposits SET amount = p_amount, deposit_date = p_date
   WHERE id = p_deposit_id AND tenant_id = v_tenant;

  -- Keep the day's working snapshot honest. Matched on the old values because
  -- there is no id linking the two — the desktop has the same limitation.
  UPDATE daily_deposit_records
     SET deposit_amount = p_amount, deposit_date = p_date
   WHERE tenant_id = v_tenant AND loan_id = v_old.loan_id
     AND deposit_date = v_old.deposit_date AND deposit_amount = v_old.amount;

  -- Editing can move a deposit between days, so re-chain from the earlier of
  -- the two.
  PERFORM recalculate_cash_summary(v_tenant, LEAST(v_old.deposit_date, p_date));

  RETURN jsonb_build_object('id', p_deposit_id, 'amount', p_amount, 'date', p_date);
END $$;


GRANT EXECUTE ON FUNCTION removed_records_report(DATE)           TO authenticated;
GRANT EXECUTE ON FUNCTION daily_deposits_report(DATE)            TO authenticated;
GRANT EXECUTE ON FUNCTION clear_removed_records(DATE)            TO authenticated;
GRANT EXECUTE ON FUNCTION clear_daily_deposits(DATE)             TO authenticated;
GRANT EXECUTE ON FUNCTION update_deposit(BIGINT, INTEGER, DATE)  TO authenticated;
