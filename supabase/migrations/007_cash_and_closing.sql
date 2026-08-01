-- ============================================================
-- Migration 007 — Daily cash summary + loan closing
--
-- Ports two pieces of desktop logic that must not drift:
--   • recalculateDailySummaryRange()  (mainfunctions.js:123)
--   • removeRecord()                  (mainfunctions.js:1622)
--
-- Both live in the database rather than in TypeScript. Closing a loan writes to
-- five tables and adjusts a running cash balance; doing that over six separate
-- round trips from a serverless function means a cold start or a dropped
-- connection can leave a shop's books half-updated.
-- ============================================================


-- ============================================================
-- 1. recalculate_cash_summary
-- ============================================================
-- left_cash is a running balance, so changing any one day invalidates every
-- day after it. This recomputes a contiguous range from an opening balance.
--
--   left_cash[d] = left_cash[d-1]
--                + added_cash - removed_cash
--                + deposit_credit - deposit_debit
--                - investments + returns
--
-- DELIBERATE DIFFERENCE FROM THE DESKTOP APP
-- ------------------------------------------
-- The desktop computes deposit_credit and deposit_debit from the `deposits`
-- table alone. But closing a loan DELETEs its rows from `deposits` (they are
-- copied to closed_record_deposits first). So on the desktop, closing a loan
-- retroactively removes those deposits from the deposit_credit of every past
-- day they occurred on — silently changing historical daily reports that the
-- shop may already have printed.
--
-- Here both figures come from active + archived deposits, so history stays
-- fixed once written. Expect small differences against the desktop's
-- daily_cash_summary for shops that have closed loans; the web figures are the
-- correct ones. Flag this during reconciliation rather than being surprised.

CREATE OR REPLACE FUNCTION recalculate_cash_summary(
  p_tenant_id UUID,
  p_from_date DATE,
  p_to_date   DATE DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cursor  DATE;
  v_end     DATE;
  v_opening NUMERIC(14,2);
  v_added   NUMERIC(14,2);
  v_removed NUMERIC(14,2);
  v_invest  NUMERIC(14,2);
  v_returns NUMERIC(14,2);
  v_dep_cr  NUMERIC(14,2);
  v_dep_db  NUMERIC(14,2);
  v_left    NUMERIC(14,2);
BEGIN
  IF p_from_date IS NULL THEN RETURN; END IF;

  -- Always run to the latest date the tenant has any activity on, otherwise
  -- the running balance is left inconsistent after the edited day.
  v_end := GREATEST(
    COALESCE(p_to_date, p_from_date),
    COALESCE((SELECT max(date)         FROM daily_cash_summary WHERE tenant_id = p_tenant_id), p_from_date),
    COALESCE((SELECT max(issue_date)   FROM loans              WHERE tenant_id = p_tenant_id), p_from_date),
    COALESCE((SELECT max(closed_date)  FROM loans              WHERE tenant_id = p_tenant_id), p_from_date),
    COALESCE((SELECT max(deposit_date) FROM deposits           WHERE tenant_id = p_tenant_id), p_from_date),
    COALESCE((SELECT max(transaction_date) FROM cash_transactions WHERE tenant_id = p_tenant_id), p_from_date)
  );

  -- Guard against a runaway loop if a bad date ever lands in the data.
  IF v_end > p_from_date + INTERVAL '20 years' THEN
    RAISE EXCEPTION 'Refusing to recalculate more than 20 years (% to %)', p_from_date, v_end;
  END IF;

  v_cursor := p_from_date;

  WHILE v_cursor <= v_end LOOP
    SELECT COALESCE(left_cash, 0) INTO v_opening
      FROM daily_cash_summary
     WHERE tenant_id = p_tenant_id AND date = v_cursor - 1;
    v_opening := COALESCE(v_opening, 0);

    SELECT COALESCE(sum(amount) FILTER (WHERE type = 'add'),    0),
           COALESCE(sum(amount) FILTER (WHERE type = 'remove'), 0)
      INTO v_added, v_removed
      FROM cash_transactions
     WHERE tenant_id = p_tenant_id AND transaction_date = v_cursor;

    -- Money lent out today.
    SELECT COALESCE(sum(amount), 0) INTO v_invest
      FROM loans
     WHERE tenant_id = p_tenant_id AND issue_date = v_cursor;

    -- Principal + interest received back on loans closed today.
    SELECT COALESCE(sum(amount + COALESCE(interest, 0)), 0) INTO v_returns
      FROM loans
     WHERE tenant_id = p_tenant_id AND status = 'closed' AND closed_date = v_cursor;

    -- Active + archived deposits — see the note above.
    WITH all_deposits AS (
      SELECT loan_id, amount, deposit_date FROM deposits
       WHERE tenant_id = p_tenant_id
      UNION ALL
      SELECT loan_id, amount, deposit_date FROM closed_record_deposits
       WHERE tenant_id = p_tenant_id
    )
    SELECT COALESCE(sum(amount) FILTER (WHERE deposit_date = v_cursor), 0)
      INTO v_dep_cr
      FROM all_deposits;

    -- Deposits already collected against loans that closed today: the shop
    -- keeps that money, so it offsets the return paid out.
    WITH all_deposits AS (
      SELECT loan_id, amount FROM deposits
       WHERE tenant_id = p_tenant_id
      UNION ALL
      SELECT loan_id, amount FROM closed_record_deposits
       WHERE tenant_id = p_tenant_id
    )
    SELECT COALESCE(sum(d.amount), 0) INTO v_dep_db
      FROM all_deposits d
      JOIN loans l ON l.id = d.loan_id AND l.tenant_id = p_tenant_id
     WHERE l.status = 'closed' AND l.closed_date = v_cursor;

    v_left := v_opening + v_added - v_removed + v_dep_cr - v_dep_db - v_invest + v_returns;

    INSERT INTO daily_cash_summary (
      tenant_id, date, total_cash, added_cash, removed_cash,
      deposit_credit, deposit_debit, investments, returns, left_cash
    )
    VALUES (
      p_tenant_id, v_cursor, v_opening, v_added, v_removed,
      v_dep_cr, v_dep_db, v_invest, v_returns, v_left
    )
    ON CONFLICT (tenant_id, date) DO UPDATE SET
      total_cash     = EXCLUDED.total_cash,
      added_cash     = EXCLUDED.added_cash,
      removed_cash   = EXCLUDED.removed_cash,
      deposit_credit = EXCLUDED.deposit_credit,
      deposit_debit  = EXCLUDED.deposit_debit,
      investments    = EXCLUDED.investments,
      returns        = EXCLUDED.returns,
      left_cash      = EXCLUDED.left_cash,
      updated_at     = now();

    v_cursor := v_cursor + 1;
  END LOOP;
END $$;


-- ============================================================
-- 2. close_loan
-- ============================================================
-- Mirrors removeRecord(). Order matters: deposits are archived before they are
-- deleted, and the cash summary is recalculated last, once every input to it
-- has settled.

CREATE OR REPLACE FUNCTION close_loan(
  p_loan_id     BIGINT,
  p_interest    INTEGER,
  p_closed_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant      UUID;
  v_loan        loans%ROWTYPE;
  v_closed      DATE;
  v_deposits    NUMERIC(14,2) := 0;
  v_dep_count   INTEGER := 0;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- FOR UPDATE: two staff members closing the same loan at once would
  -- otherwise both add its return to the day's cash.
  SELECT * INTO v_loan FROM loans
   WHERE id = p_loan_id AND tenant_id = v_tenant
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_loan.status = 'closed' THEN
    RAISE EXCEPTION 'Loan % is already closed', p_loan_id USING ERRCODE = '23505';
  END IF;

  -- Default to today in IST, not UTC: after 18:30 UTC a shop in India is
  -- already on the next calendar day, and the closure must land on the day the
  -- customer actually collected their jewellery.
  v_closed := COALESCE(p_closed_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);

  IF v_closed < v_loan.issue_date THEN
    RAISE EXCEPTION 'Closing date cannot be before the issue date (%)', v_loan.issue_date
      USING ERRCODE = '22023';
  END IF;

  -- Preserve deposit history before the active rows are removed.
  INSERT INTO closed_record_deposits
    (tenant_id, loan_id, original_deposit_id, amount, deposit_date, archived_at)
  SELECT tenant_id, loan_id, id, amount, deposit_date, now()
    FROM deposits
   WHERE tenant_id = v_tenant AND loan_id = p_loan_id
  ON CONFLICT (tenant_id, loan_id, original_deposit_id) DO NOTHING;

  SELECT COALESCE(sum(amount), 0), count(*) INTO v_deposits, v_dep_count
    FROM deposits WHERE tenant_id = v_tenant AND loan_id = p_loan_id;

  -- Snapshot for the end-of-day removal report.
  IF v_deposits > 0 THEN
    INSERT INTO removed_records_with_deposits (
      tenant_id, loan_id, name, father_name, location, address, amount,
      detailed_type, weight, issue_date, closed_date, closed_timestamp,
      additional_information, total_deposits, removal_date, remarks
    ) VALUES (
      v_tenant, p_loan_id, v_loan.name, v_loan.father_name, v_loan.location,
      v_loan.address, v_loan.amount, v_loan.detailed_type, v_loan.weight,
      v_loan.issue_date, v_closed, now(), v_loan.additional_information,
      v_deposits::integer, v_closed, v_loan.remarks
    );
  END IF;

  DELETE FROM deposits WHERE tenant_id = v_tenant AND loan_id = p_loan_id;

  -- The photo stays in R2; flagging it keeps closed-record screens working
  -- while marking it for long-term retention. (The desktop moves the file to
  -- a folder on disk — on object storage that distinction is meaningless.)
  UPDATE loan_photos
     SET archived = true, archived_at = now()
   WHERE tenant_id = v_tenant AND loan_id = p_loan_id;

  UPDATE loans
     SET status = 'closed',
         closed_date = v_closed,
         closed_timestamp = now(),
         interest = COALESCE(p_interest, interest)
   WHERE id = p_loan_id AND tenant_id = v_tenant;

  INSERT INTO activity_log (tenant_id, type, description, amount, color, icon)
  VALUES (v_tenant, 'loan_closed',
          format('Loan #%s closed — %s', p_loan_id, v_loan.name),
          v_loan.amount + COALESCE(p_interest, 0), 'slate', 'archive');

  -- Both dates: the issue date contributes investments, the closing date
  -- contributes returns, and everything after either must be re-chained.
  PERFORM recalculate_cash_summary(v_tenant, LEAST(v_loan.issue_date, v_closed));

  RETURN jsonb_build_object(
    'loan_id',         p_loan_id,
    'closed_date',     v_closed,
    'interest',        COALESCE(p_interest, 0),
    'total_return',    v_loan.amount + COALESCE(p_interest, 0),
    'deposits_count',  v_dep_count,
    'deposits_amount', v_deposits
  );
END $$;


-- ============================================================
-- 3. reopen_loan — undo a mistaken closure
-- ============================================================
-- The desktop has no equivalent. Closing the wrong record is an easy slip at a
-- busy counter, and without this the only remedy is editing the database by
-- hand. Deposits are restored from the archive with their original ids.

CREATE OR REPLACE FUNCTION reopen_loan(p_loan_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant UUID;
  v_loan   loans%ROWTYPE;
  v_old_closed DATE;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_loan FROM loans
   WHERE id = p_loan_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_loan.status <> 'closed' THEN
    RAISE EXCEPTION 'Loan % is not closed', p_loan_id USING ERRCODE = '22023';
  END IF;

  v_old_closed := v_loan.closed_date;

  INSERT INTO deposits (id, tenant_id, loan_id, amount, deposit_date)
  SELECT original_deposit_id, tenant_id, loan_id, amount, deposit_date
    FROM closed_record_deposits
   WHERE tenant_id = v_tenant AND loan_id = p_loan_id
     AND original_deposit_id IS NOT NULL
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM closed_record_deposits WHERE tenant_id = v_tenant AND loan_id = p_loan_id;
  DELETE FROM removed_records_with_deposits WHERE tenant_id = v_tenant AND loan_id = p_loan_id;

  UPDATE loan_photos SET archived = false, archived_at = NULL
   WHERE tenant_id = v_tenant AND loan_id = p_loan_id;

  UPDATE loans
     SET status = 'active', closed_date = NULL, closed_timestamp = NULL
   WHERE id = p_loan_id AND tenant_id = v_tenant;

  INSERT INTO activity_log (tenant_id, type, description, color, icon)
  VALUES (v_tenant, 'loan_reopened',
          format('Loan #%s reopened — %s', p_loan_id, v_loan.name), 'amber', 'rotate-ccw');

  PERFORM recalculate_cash_summary(v_tenant, LEAST(v_loan.issue_date, COALESCE(v_old_closed, v_loan.issue_date)));

  RETURN jsonb_build_object('loan_id', p_loan_id, 'status', 'active');
END $$;


-- ============================================================
-- 4. record_cash_transaction
-- ============================================================
CREATE OR REPLACE FUNCTION record_cash_transaction(
  p_type   TEXT,
  p_amount NUMERIC,
  p_reason TEXT,
  p_date   DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant UUID;
  v_date   DATE;
  v_id     BIGINT;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_type NOT IN ('add', 'remove') THEN
    RAISE EXCEPTION 'Type must be add or remove' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;

  v_date := COALESCE(p_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);

  INSERT INTO cash_transactions (tenant_id, transaction_date, type, amount, reason)
  VALUES (v_tenant, v_date, p_type, p_amount, trim(p_reason))
  RETURNING id INTO v_id;

  INSERT INTO activity_log (tenant_id, type, description, amount, color, icon)
  VALUES (v_tenant,
          CASE WHEN p_type = 'add' THEN 'cash_added' ELSE 'cash_removed' END,
          trim(p_reason), p_amount,
          CASE WHEN p_type = 'add' THEN 'emerald' ELSE 'red' END,
          CASE WHEN p_type = 'add' THEN 'plus-circle' ELSE 'minus-circle' END);

  PERFORM recalculate_cash_summary(v_tenant, v_date);

  RETURN jsonb_build_object('id', v_id, 'date', v_date);
END $$;


-- ============================================================
-- 5. Deposit helpers — each one moves the cash balance
-- ============================================================
CREATE OR REPLACE FUNCTION add_deposit(
  p_loan_id BIGINT,
  p_amount  INTEGER,
  p_date    DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant UUID;
  v_loan   loans%ROWTYPE;
  v_date   DATE;
  v_id     BIGINT;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Deposit must be greater than zero' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_loan FROM loans WHERE id = p_loan_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_loan.status = 'closed' THEN
    RAISE EXCEPTION 'Cannot add a deposit to a closed loan' USING ERRCODE = '22023';
  END IF;

  v_date := COALESCE(p_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  IF v_date < v_loan.issue_date THEN
    RAISE EXCEPTION 'Deposit date cannot be before the loan was issued (%)', v_loan.issue_date
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO deposits (tenant_id, loan_id, amount, deposit_date)
  VALUES (v_tenant, p_loan_id, p_amount, v_date)
  RETURNING id INTO v_id;

  INSERT INTO daily_deposit_records (
    tenant_id, loan_id, loan_name, father_name, location,
    loan_amount, detailed_type, weight, deposit_amount, deposit_date
  ) VALUES (
    v_tenant, p_loan_id, v_loan.name, v_loan.father_name, v_loan.location,
    v_loan.amount, v_loan.detailed_type, v_loan.weight, p_amount, v_date
  );

  INSERT INTO activity_log (tenant_id, type, description, amount, color, icon)
  VALUES (v_tenant, 'deposit_added',
          format('Deposit on loan #%s — %s', p_loan_id, v_loan.name),
          p_amount, 'emerald', 'arrow-down-circle');

  PERFORM recalculate_cash_summary(v_tenant, v_date);

  RETURN jsonb_build_object('id', v_id, 'date', v_date);
END $$;


CREATE OR REPLACE FUNCTION delete_deposit(p_deposit_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant UUID;
  v_dep    deposits%ROWTYPE;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_dep FROM deposits WHERE id = p_deposit_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM deposits WHERE id = p_deposit_id AND tenant_id = v_tenant;
  DELETE FROM daily_deposit_records
   WHERE tenant_id = v_tenant AND loan_id = v_dep.loan_id
     AND deposit_date = v_dep.deposit_date AND deposit_amount = v_dep.amount;

  PERFORM recalculate_cash_summary(v_tenant, v_dep.deposit_date);

  RETURN jsonb_build_object('deleted', p_deposit_id);
END $$;


-- ============================================================
-- 6. create_loan
-- ============================================================
-- A new loan is money leaving the drawer, so it is that day's `investments`
-- and every later day's running balance shifts. Inserting straight into
-- `loans` from the client — which is what the scaffold's new-loan page did —
-- leaves daily_cash_summary silently stale until something else recalculates.

CREATE OR REPLACE FUNCTION create_loan(p_loan JSONB)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant     UUID;
  v_id         BIGINT;
  v_issue_date DATE;
  v_amount     INTEGER;
  v_name       TEXT;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  v_name       := NULLIF(trim(p_loan ->> 'name'), '');
  v_amount     := (p_loan ->> 'amount')::INTEGER;
  v_issue_date := COALESCE((p_loan ->> 'issue_date')::DATE,
                           (now() AT TIME ZONE 'Asia/Kolkata')::date);

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Customer name is required' USING ERRCODE = '22023';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Loan amount must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF v_issue_date > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'Issue date cannot be in the future' USING ERRCODE = '22023';
  END IF;

  INSERT INTO loans (
    tenant_id, name, father_name, location, address, additional_information,
    category_type, detailed_type, weight, amount, interest, remarks,
    issue_date, active_timestamp, status
  ) VALUES (
    v_tenant,
    v_name,
    NULLIF(trim(p_loan ->> 'father_name'), ''),
    NULLIF(trim(p_loan ->> 'location'), ''),
    NULLIF(trim(p_loan ->> 'address'), ''),
    NULLIF(trim(p_loan ->> 'additional_information'), ''),
    CASE WHEN p_loan ->> 'category_type' = 'Silver' THEN 'Silver' ELSE 'Gold' END,
    NULLIF(trim(p_loan ->> 'detailed_type'), ''),
    (p_loan ->> 'weight')::NUMERIC,
    v_amount,
    (p_loan ->> 'interest')::INTEGER,
    NULLIF(trim(p_loan ->> 'remarks'), ''),
    v_issue_date,
    now(),
    'active'
  )
  RETURNING id INTO v_id;

  INSERT INTO activity_log (tenant_id, type, description, amount, color, icon)
  VALUES (v_tenant, 'loan_created',
          format('Loan #%s created — %s', v_id, v_name),
          v_amount, 'primary', 'file-plus');

  PERFORM recalculate_cash_summary(v_tenant, v_issue_date);

  RETURN v_id;
END $$;


-- ============================================================
-- 7. recalculate_my_cash_summary — the only recalculation a client may trigger
-- ============================================================
-- recalculate_cash_summary() takes a tenant id, so exposing it directly would
-- let any signed-in user force writes into another shop's daily_cash_summary.
-- The values are derived, so it could not corrupt them — but it is still a
-- cross-tenant write and a cheap way to burn someone else's database time.
--
-- This wrapper takes no tenant argument and reads it from the session instead.
-- Edits that shift a date (moving a deposit, correcting an issue date) call it
-- with the earlier of the two dates.

CREATE OR REPLACE FUNCTION recalculate_my_cash_summary(p_from_date DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  PERFORM recalculate_cash_summary(v_tenant, p_from_date);
END $$;


-- ============================================================
-- Grants — all of these are called by signed-in users
-- ============================================================
REVOKE EXECUTE ON FUNCTION recalculate_cash_summary(UUID, DATE, DATE) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION recalculate_my_cash_summary(DATE) TO authenticated;

GRANT EXECUTE ON FUNCTION create_loan(JSONB)                                 TO authenticated;
GRANT EXECUTE ON FUNCTION close_loan(BIGINT, INTEGER, DATE)                  TO authenticated;
GRANT EXECUTE ON FUNCTION reopen_loan(BIGINT)                                TO authenticated;
GRANT EXECUTE ON FUNCTION record_cash_transaction(TEXT, NUMERIC, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION add_deposit(BIGINT, INTEGER, DATE)                 TO authenticated;
GRANT EXECUTE ON FUNCTION delete_deposit(BIGINT)                             TO authenticated;
