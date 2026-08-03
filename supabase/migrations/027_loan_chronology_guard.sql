-- ============================================================
-- Migration 027 — one chronology guard for every loan write path
--
-- Server actions validate for a useful interface, but they are not a data
-- boundary: authenticated clients can invoke granted RPCs directly and old
-- devices can replay queued work later. This trigger makes the database reject
-- impossible financial history regardless of which path performed the write.
-- ============================================================

CREATE OR REPLACE FUNCTION validate_loan_chronology()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_role TEXT;
BEGIN
  IF NEW.issue_date IS NULL THEN
    RAISE EXCEPTION 'Issue date is required' USING ERRCODE = '22023';
  END IF;
  IF NEW.issue_date > v_today THEN
    RAISE EXCEPTION 'Issue date cannot be in the future' USING ERRCODE = '22023';
  END IF;
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Loan amount must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF NEW.interest IS NOT NULL AND NEW.interest < 0 THEN
    RAISE EXCEPTION 'Interest must be zero or more' USING ERRCODE = '22023';
  END IF;

  IF NEW.status = 'closed' THEN
    IF NEW.closed_date IS NULL THEN
      RAISE EXCEPTION 'Closing date is required' USING ERRCODE = '22023';
    END IF;
    IF NEW.closed_date > v_today THEN
      RAISE EXCEPTION 'Closing date cannot be in the future' USING ERRCODE = '22023';
    END IF;
    IF NEW.closed_date < NEW.issue_date THEN
      RAISE EXCEPTION 'Closing date cannot be before the issue date (%)', NEW.issue_date
        USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM closed_record_deposits
       WHERE tenant_id = NEW.tenant_id
         AND loan_id = NEW.id
         AND deposit_date > NEW.closed_date
    ) THEN
      RAISE EXCEPTION 'Closing date cannot be before an existing deposit'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Reopening rewrites historical cash. Keep the authorization at the data
  -- boundary as well as in the server action. SQL-editor/service operations
  -- intentionally bypass this authenticated-user check.
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'closed'
     AND NEW.status = 'active'
     AND auth.role() = 'authenticated' THEN
    SELECT role INTO v_role
      FROM users
     WHERE auth_id = auth.uid() AND tenant_id = NEW.tenant_id;
    IF v_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Only the shop owner can reopen a closed loan'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_loan_chronology ON loans;
CREATE TRIGGER trg_validate_loan_chronology
BEFORE INSERT OR UPDATE OF issue_date, amount, interest, closed_date, status
ON loans
FOR EACH ROW EXECUTE FUNCTION validate_loan_chronology();

REVOKE ALL ON FUNCTION validate_loan_chronology() FROM PUBLIC, anon, authenticated;

