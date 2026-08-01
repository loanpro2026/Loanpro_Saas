-- ============================================================
-- Migration 013 — Enforce the identity-verification settings
--
-- The desktop treats "photo mandatory at creation / at closure" as a hard
-- rule: Addrecord and Removerecord refuse to proceed without one when the
-- setting is on. Shops use it as a compliance control — proof of who handed
-- over the jewellery.
--
-- Enforcing it only in the browser would make it decoration. These checks are
-- in the database, where a direct RPC call cannot skip them.
-- ============================================================


-- ============================================================
-- 1. Helper: is a photo required, and is one present?
-- ============================================================
-- `identity_verification_enabled` is the master switch. The desktop computes
-- `captureFeatureEnabled = identityEnabled && webcamSettingsEnabled` and
-- gates everything on it, so the mandatory flags mean nothing when the whole
-- feature is off. Same logic here.

CREATE OR REPLACE FUNCTION photo_required(p_stage TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((my_settings() ->> 'identity_verification_enabled')::BOOLEAN, true)
     AND COALESCE((my_settings() ->> (
           CASE p_stage
             WHEN 'closure' THEN 'identity_mandatory_at_closure'
             ELSE                'identity_mandatory_at_creation'
           END))::BOOLEAN, true);
$$;

GRANT EXECUTE ON FUNCTION photo_required(TEXT) TO authenticated;


-- ============================================================
-- 2. Creation: allow the loan, flag the missing photo
-- ============================================================
-- A deliberate difference from a naive reading of the setting.
--
-- On the desktop, capture and save happen in one screen — the operator cannot
-- get to "save" without the photo. On the web the photo is a separate upload
-- that can fail after the loan row is written, or be queued offline. Refusing
-- to create the loan would mean a customer standing at the counter with their
-- gold already handed over and no record of it.
--
-- So `create_loan` accepts a `photo_pending` flag: the loan is created, and
-- the requirement is recorded rather than enforced by refusal. The UI blocks
-- the normal path; this stops the record being lost when something goes wrong.

ALTER TABLE loans ADD COLUMN IF NOT EXISTS photo_required_missing BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN loans.photo_required_missing IS
  'True when the shop requires an identity photo and one was not captured. '
  'Surfaced in the UI so it can be chased, not enforced by refusing the loan.';

CREATE INDEX IF NOT EXISTS idx_loans_photo_missing
  ON loans (tenant_id) WHERE photo_required_missing;


-- Clear the flag automatically once a photo lands — including a queued
-- offline capture that syncs hours later.
CREATE OR REPLACE FUNCTION clear_photo_missing_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE loans SET photo_required_missing = false
   WHERE id = NEW.loan_id AND photo_required_missing;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_clear_photo_missing ON loan_photos;
CREATE TRIGGER trg_clear_photo_missing
  AFTER INSERT OR UPDATE ON loan_photos
  FOR EACH ROW EXECUTE FUNCTION clear_photo_missing_flag();


-- ============================================================
-- 3. Closure: this one IS enforced
-- ============================================================
-- Closing is different from creation. Nothing is lost by refusing — the
-- customer's jewellery stays in the safe and they come back, which is exactly
-- what a shop using this control wants. It is the whole point of the setting:
-- do not hand gold back to someone you have not identified.

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
  v_tenant    UUID;
  v_loan      loans%ROWTYPE;
  v_closed    DATE;
  v_deposits  NUMERIC(14,2) := 0;
  v_dep_count INTEGER := 0;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_loan FROM loans
   WHERE id = p_loan_id AND tenant_id = v_tenant
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_loan.status = 'closed' THEN
    RAISE EXCEPTION 'Loan % is already closed', p_loan_id USING ERRCODE = '23505';
  END IF;

  -- New in 013.
  IF photo_required('closure')
     AND NOT EXISTS (SELECT 1 FROM loan_photos WHERE loan_id = p_loan_id) THEN
    RAISE EXCEPTION
      'This shop requires a customer photo before a loan can be closed. Capture one, or turn the requirement off in Settings.'
      USING ERRCODE = '42501';
  END IF;

  v_closed := COALESCE(p_closed_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);

  IF v_closed < v_loan.issue_date THEN
    RAISE EXCEPTION 'Closing date cannot be before the issue date (%)', v_loan.issue_date
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO closed_record_deposits
    (tenant_id, loan_id, original_deposit_id, amount, deposit_date, archived_at)
  SELECT tenant_id, loan_id, id, amount, deposit_date, now()
    FROM deposits
   WHERE tenant_id = v_tenant AND loan_id = p_loan_id
  ON CONFLICT (tenant_id, loan_id, original_deposit_id) DO NOTHING;

  SELECT COALESCE(sum(amount), 0), count(*) INTO v_deposits, v_dep_count
    FROM deposits WHERE tenant_id = v_tenant AND loan_id = p_loan_id;

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

GRANT EXECUTE ON FUNCTION close_loan(BIGINT, INTEGER, DATE) TO authenticated;


-- ============================================================
-- 4. create_loan records the flag
-- ============================================================
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
  v_missing    BOOLEAN;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM assert_can_write();

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

  -- The caller says whether it has a photo to attach. The trigger on
  -- loan_photos clears this the moment one arrives, including a queued
  -- offline capture that syncs later.
  v_missing := photo_required('creation')
               AND NOT COALESCE((p_loan ->> 'has_photo')::BOOLEAN, false);

  INSERT INTO loans (
    tenant_id, name, father_name, location, address, additional_information,
    category_type, detailed_type, weight, amount, interest, remarks,
    issue_date, active_timestamp, status, photo_required_missing
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
    NULL,                     -- interest is written only at closing
    NULLIF(trim(p_loan ->> 'remarks'), ''),
    v_issue_date,
    now(),
    'active',
    v_missing
  )
  RETURNING id INTO v_id;

  INSERT INTO activity_log (tenant_id, type, description, amount, color, icon)
  VALUES (v_tenant, 'loan_created',
          format('Loan #%s created — %s', v_id, v_name),
          v_amount, 'primary', 'file-plus');

  PERFORM recalculate_cash_summary(v_tenant, v_issue_date);

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION create_loan(JSONB) TO authenticated;


-- ============================================================
-- 5. Surface loans still missing a required photo
-- ============================================================
-- So a shop can chase them at the end of the day rather than discovering the
-- gap when a customer turns up to collect and closing is blocked.

CREATE OR REPLACE FUNCTION loans_missing_photo()
RETURNS TABLE (
  id BIGINT, name TEXT, father_name TEXT, location TEXT,
  amount INTEGER, issue_date DATE
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT l.id, l.name, l.father_name, l.location, l.amount, l.issue_date
    FROM loans l
   WHERE l.status = 'active'
     AND l.photo_required_missing
     AND NOT EXISTS (SELECT 1 FROM loan_photos p WHERE p.loan_id = l.id)
   ORDER BY l.issue_date DESC, l.id DESC;
$$;

GRANT EXECUTE ON FUNCTION loans_missing_photo() TO authenticated;
