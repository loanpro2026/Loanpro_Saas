-- ============================================================
-- Migration 026 — transaction-safe loan edits, deletion and remarks
--
-- These operations previously used several browser/server round trips. In a
-- multi-device SaaS that permits lost remarks and partially updated cash/day-
-- end state. Each operation below locks the loan and commits all related rows
-- as one PostgreSQL transaction.
-- ============================================================

CREATE OR REPLACE FUNCTION update_active_loan(p_loan_id BIGINT, p_patch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant UUID;
  v_old loans%ROWTYPE;
  v_issue DATE;
  v_amount INTEGER;
  v_category TEXT;
  v_weight NUMERIC(10,3);
  v_financial_change BOOLEAN;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Loan changes must be an object' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_old FROM loans
   WHERE id = p_loan_id AND tenant_id = v_tenant AND status = 'active'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active loan not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_patch ? 'name' AND coalesce(trim(p_patch ->> 'name'), '') = '' THEN
    RAISE EXCEPTION 'Customer name is required' USING ERRCODE = '22023';
  END IF;

  v_issue := CASE WHEN p_patch ? 'issue_date'
    THEN (p_patch ->> 'issue_date')::DATE ELSE v_old.issue_date END;
  v_amount := CASE WHEN p_patch ? 'amount'
    THEN (p_patch ->> 'amount')::INTEGER ELSE v_old.amount END;
  v_category := CASE WHEN p_patch ? 'category_type'
    THEN p_patch ->> 'category_type' ELSE v_old.category_type END;
  v_weight := CASE WHEN p_patch ? 'weight'
    THEN NULLIF(p_patch ->> 'weight', '')::NUMERIC ELSE v_old.weight END;

  IF v_issue IS NULL THEN
    RAISE EXCEPTION 'Issue date is required' USING ERRCODE = '22023';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF v_category IS NULL OR v_category NOT IN ('Gold', 'Silver') THEN
    RAISE EXCEPTION 'Metal must be Gold or Silver' USING ERRCODE = '22023';
  END IF;
  IF v_weight IS NOT NULL AND v_weight < 0 THEN
    RAISE EXCEPTION 'Weight cannot be negative' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM deposits
     WHERE tenant_id = v_tenant AND loan_id = p_loan_id AND deposit_date < v_issue
  ) THEN
    RAISE EXCEPTION 'Issue date cannot be after an existing deposit' USING ERRCODE = '22023';
  END IF;

  v_financial_change := v_amount IS DISTINCT FROM v_old.amount
                     OR v_issue IS DISTINCT FROM v_old.issue_date;

  UPDATE loans SET
    name = CASE WHEN p_patch ? 'name' THEN trim(p_patch ->> 'name') ELSE name END,
    father_name = CASE WHEN p_patch ? 'father_name' THEN NULLIF(trim(p_patch ->> 'father_name'), '') ELSE father_name END,
    location = CASE WHEN p_patch ? 'location' THEN NULLIF(trim(p_patch ->> 'location'), '') ELSE location END,
    address = CASE WHEN p_patch ? 'address' THEN NULLIF(trim(p_patch ->> 'address'), '') ELSE address END,
    additional_information = CASE WHEN p_patch ? 'additional_information' THEN NULLIF(trim(p_patch ->> 'additional_information'), '') ELSE additional_information END,
    category_type = v_category,
    detailed_type = CASE WHEN p_patch ? 'detailed_type' THEN NULLIF(trim(p_patch ->> 'detailed_type'), '') ELSE detailed_type END,
    weight = v_weight,
    amount = v_amount,
    issue_date = v_issue
  WHERE id = p_loan_id AND tenant_id = v_tenant;

  -- The day-end deposit table is a denormalised working copy. Keep its loan
  -- columns aligned when the source record is corrected.
  UPDATE daily_deposit_records d SET
    loan_name = l.name,
    father_name = l.father_name,
    location = l.location,
    loan_amount = l.amount,
    detailed_type = l.detailed_type,
    weight = l.weight
  FROM loans l
  WHERE l.id = p_loan_id AND l.tenant_id = v_tenant
    AND d.loan_id = l.id AND d.tenant_id = v_tenant;

  INSERT INTO activity_log (tenant_id, type, description, color, icon)
  VALUES (v_tenant, 'loan_edited', format('Loan #%s corrected', p_loan_id), 'amber', 'pencil');

  IF v_financial_change THEN
    PERFORM recalculate_cash_summary(v_tenant, LEAST(v_old.issue_date, v_issue));
  END IF;

  RETURN jsonb_build_object('loan_id', p_loan_id, 'cash_recalculated', v_financial_change);
END $$;


-- Replace the earlier closed-record correction so every field shown by the
-- form is actually persisted, optional values can be cleared, and owner-only
-- enforcement exists at the database boundary.
CREATE OR REPLACE FUNCTION update_closed_record(p_loan_id BIGINT, p_patch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant UUID;
  v_role TEXT;
  v_old loans%ROWTYPE;
  v_issue DATE;
  v_closed DATE;
  v_amount INTEGER;
  v_interest INTEGER;
  v_category TEXT;
  v_weight NUMERIC(10,3);
  v_from DATE;
BEGIN
  v_tenant := get_tenant_id();
  SELECT role INTO v_role FROM users WHERE auth_id = auth.uid() AND tenant_id = v_tenant;
  IF v_tenant IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the shop owner can correct a settled loan' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Loan changes must be an object' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_old FROM loans
   WHERE id = p_loan_id AND tenant_id = v_tenant AND status = 'closed'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Closed record not found' USING ERRCODE = 'P0002'; END IF;

  IF p_patch ? 'name' AND coalesce(trim(p_patch ->> 'name'), '') = '' THEN
    RAISE EXCEPTION 'Customer name is required' USING ERRCODE = '22023';
  END IF;
  v_issue := CASE WHEN p_patch ? 'issue_date' THEN (p_patch ->> 'issue_date')::DATE ELSE v_old.issue_date END;
  v_closed := CASE WHEN p_patch ? 'closed_date' THEN (p_patch ->> 'closed_date')::DATE ELSE v_old.closed_date END;
  v_amount := CASE WHEN p_patch ? 'amount' THEN (p_patch ->> 'amount')::INTEGER ELSE v_old.amount END;
  v_interest := CASE WHEN p_patch ? 'interest' THEN COALESCE((p_patch ->> 'interest')::INTEGER, 0) ELSE COALESCE(v_old.interest, 0) END;
  v_category := CASE WHEN p_patch ? 'category_type' THEN p_patch ->> 'category_type' ELSE v_old.category_type END;
  v_weight := CASE WHEN p_patch ? 'weight' THEN NULLIF(p_patch ->> 'weight', '')::NUMERIC ELSE v_old.weight END;

  IF v_issue IS NULL THEN RAISE EXCEPTION 'Issue date is required' USING ERRCODE = '22023'; END IF;
  IF v_closed IS NULL THEN RAISE EXCEPTION 'Closing date is required' USING ERRCODE = '22023'; END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = '22023'; END IF;
  IF v_interest IS NULL OR v_interest < 0 THEN RAISE EXCEPTION 'Interest cannot be negative' USING ERRCODE = '22023'; END IF;
  IF v_category IS NULL OR v_category NOT IN ('Gold', 'Silver') THEN RAISE EXCEPTION 'Metal must be Gold or Silver' USING ERRCODE = '22023'; END IF;
  IF v_weight IS NOT NULL AND v_weight < 0 THEN RAISE EXCEPTION 'Weight cannot be negative' USING ERRCODE = '22023'; END IF;
  IF v_closed < v_issue THEN RAISE EXCEPTION 'Closing date cannot be before the issue date' USING ERRCODE = '22023'; END IF;
  IF EXISTS (
    SELECT 1 FROM closed_record_deposits
     WHERE tenant_id = v_tenant AND loan_id = p_loan_id AND deposit_date < v_issue
  ) THEN
    RAISE EXCEPTION 'Issue date cannot be after an existing deposit' USING ERRCODE = '22023';
  END IF;

  UPDATE loans SET
    name = CASE WHEN p_patch ? 'name' THEN trim(p_patch ->> 'name') ELSE name END,
    father_name = CASE WHEN p_patch ? 'father_name' THEN NULLIF(trim(p_patch ->> 'father_name'), '') ELSE father_name END,
    location = CASE WHEN p_patch ? 'location' THEN NULLIF(trim(p_patch ->> 'location'), '') ELSE location END,
    address = CASE WHEN p_patch ? 'address' THEN NULLIF(trim(p_patch ->> 'address'), '') ELSE address END,
    additional_information = CASE WHEN p_patch ? 'additional_information' THEN NULLIF(trim(p_patch ->> 'additional_information'), '') ELSE additional_information END,
    category_type = v_category,
    detailed_type = CASE WHEN p_patch ? 'detailed_type' THEN NULLIF(trim(p_patch ->> 'detailed_type'), '') ELSE detailed_type END,
    weight = v_weight,
    amount = v_amount,
    interest = v_interest,
    issue_date = v_issue,
    closed_date = v_closed
  WHERE id = p_loan_id AND tenant_id = v_tenant;

  UPDATE removed_records_with_deposits r SET
    name = l.name,
    father_name = l.father_name,
    location = l.location,
    address = l.address,
    amount = l.amount,
    detailed_type = l.detailed_type,
    weight = l.weight,
    issue_date = l.issue_date,
    closed_date = l.closed_date,
    additional_information = l.additional_information
  FROM loans l
  WHERE l.id = p_loan_id AND l.tenant_id = v_tenant
    AND r.loan_id = l.id AND r.tenant_id = v_tenant;

  INSERT INTO activity_log (tenant_id, type, description, color, icon)
  VALUES (v_tenant, 'closed_record_edited',
          format('Closed loan #%s corrected', p_loan_id), 'amber', 'pencil');

  v_from := LEAST(v_old.issue_date, v_old.closed_date, v_issue, v_closed);
  PERFORM recalculate_cash_summary(v_tenant, v_from);
  RETURN jsonb_build_object('loan_id', p_loan_id, 'recalculated_from', v_from);
END $$;


CREATE OR REPLACE FUNCTION delete_loan(p_loan_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant UUID;
  v_role TEXT;
  v_loan loans%ROWTYPE;
  v_from DATE;
  v_photo_keys JSONB;
BEGIN
  v_tenant := get_tenant_id();
  SELECT role INTO v_role FROM users WHERE auth_id = auth.uid() AND tenant_id = v_tenant;
  IF v_tenant IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the shop owner can delete a loan' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_loan FROM loans
   WHERE id = p_loan_id AND tenant_id = v_tenant
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT LEAST(
    v_loan.issue_date,
    COALESCE(v_loan.closed_date, v_loan.issue_date),
    COALESCE((SELECT min(deposit_date) FROM deposits WHERE tenant_id = v_tenant AND loan_id = p_loan_id), v_loan.issue_date),
    COALESCE((SELECT min(deposit_date) FROM closed_record_deposits WHERE tenant_id = v_tenant AND loan_id = p_loan_id), v_loan.issue_date)
  ) INTO v_from;

  SELECT COALESCE(jsonb_agg(r2_key) FILTER (WHERE r2_key IS NOT NULL), '[]'::jsonb)
    INTO v_photo_keys
    FROM loan_photos WHERE tenant_id = v_tenant AND loan_id = p_loan_id;

  -- These two working tables deliberately have no loan FK because operators
  -- clear them by day. Remove their denormalised rows explicitly.
  DELETE FROM daily_deposit_records WHERE tenant_id = v_tenant AND loan_id = p_loan_id;
  DELETE FROM removed_records_with_deposits WHERE tenant_id = v_tenant AND loan_id = p_loan_id;
  DELETE FROM loans WHERE tenant_id = v_tenant AND id = p_loan_id;

  INSERT INTO activity_log (tenant_id, type, description, color, icon)
  VALUES (v_tenant, 'loan_deleted',
          format('Loan #%s deleted — %s', p_loan_id, v_loan.name), 'red', 'trash-2');

  PERFORM recalculate_cash_summary(v_tenant, v_from);
  RETURN jsonb_build_object('loan_id', p_loan_id, 'photo_keys', v_photo_keys, 'recalculated_from', v_from);
END $$;


CREATE OR REPLACE FUNCTION append_loan_remark(p_loan_id BIGINT, p_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant UUID;
  v_remarks TEXT;
  v_body TEXT;
  v_entry TEXT;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  v_body := trim(p_text);
  IF v_body = '' THEN RAISE EXCEPTION 'Remark cannot be empty' USING ERRCODE = '22023'; END IF;
  IF length(v_body) > 2000 THEN RAISE EXCEPTION 'Remark is too long' USING ERRCODE = '22023'; END IF;

  SELECT remarks INTO v_remarks FROM loans
   WHERE id = p_loan_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan not found' USING ERRCODE = 'P0002'; END IF;

  v_entry := format('[%s] %s',
    to_char(now() AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM'), v_body);
  UPDATE loans SET remarks = concat_ws(E'\n', NULLIF(v_remarks, ''), v_entry)
   WHERE id = p_loan_id AND tenant_id = v_tenant;

  RETURN jsonb_build_object('entry', v_entry);
END $$;


CREATE OR REPLACE FUNCTION delete_loan_remark(p_loan_id BIGINT, p_index INTEGER, p_expected TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant UUID;
  v_remarks TEXT;
  v_count INTEGER;
  v_next TEXT;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT remarks INTO v_remarks FROM loans
   WHERE id = p_loan_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan not found' USING ERRCODE = 'P0002'; END IF;
  IF v_remarks IS NULL OR v_remarks = '' THEN RAISE EXCEPTION 'No remarks to remove' USING ERRCODE = 'P0002'; END IF;

  v_count := cardinality(string_to_array(v_remarks, E'\n'));
  IF p_index < 0 OR p_index >= v_count THEN
    RAISE EXCEPTION 'That remark no longer exists' USING ERRCODE = 'P0002';
  END IF;
  IF (string_to_array(v_remarks, E'\n'))[p_index + 1] IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'Remarks changed on another device. Refresh and try again.' USING ERRCODE = '40001';
  END IF;

  SELECT string_agg(line, E'\n' ORDER BY ordinal)
    INTO v_next
    FROM unnest(string_to_array(v_remarks, E'\n')) WITH ORDINALITY AS item(line, ordinal)
   WHERE ordinal <> p_index + 1;

  UPDATE loans SET remarks = NULLIF(v_next, '')
   WHERE id = p_loan_id AND tenant_id = v_tenant;
END $$;


REVOKE INSERT, UPDATE, DELETE ON loans FROM authenticated, anon;
GRANT SELECT ON loans TO authenticated;

REVOKE EXECUTE ON FUNCTION update_active_loan(BIGINT, JSONB) FROM public, anon;
REVOKE EXECUTE ON FUNCTION delete_loan(BIGINT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION append_loan_remark(BIGINT, TEXT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION delete_loan_remark(BIGINT, INTEGER, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION update_active_loan(BIGINT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_loan(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION append_loan_remark(BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_loan_remark(BIGINT, INTEGER, TEXT) TO authenticated;
