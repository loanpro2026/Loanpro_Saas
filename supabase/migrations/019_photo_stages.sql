-- ============================================================
-- Migration 019 — Two photos per loan, and one camera setting
--
-- A loan now carries up to two identity photos:
--
--   pledge      taken when the loan is created — who handed the item over
--   collection  taken when the loan is closed  — who took it back
--
-- Those are frequently different people. A son redeems his mother's chain; a
-- brother collects on behalf of a sibling. Keeping only one of the two makes
-- the record useless for the dispute it was captured to settle, and disputes
-- in a pawn shop are usually about the pledge: "I never gave you that."
--
-- Until now `loan_photos.loan_id` was the PRIMARY KEY, so the table could
-- physically hold only one photo per loan and a second capture would have
-- silently overwritten the first. The key becomes (loan_id, stage).
--
-- Also replaces the identity_allow_mobile_capture boolean with an explicit
-- three-way photo_capture_mode. As booleans, 'verification on' plus 'mobile
-- capture off' described a shop that requires a photo it has no way to take —
-- a state the settings screen allowed and nothing rejected.
-- ============================================================

-- ── 1. Stage ────────────────────────────────────────────────────────────────
ALTER TABLE loan_photos
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'pledge';

ALTER TABLE loan_photos DROP CONSTRAINT IF EXISTS loan_photos_stage_check;
ALTER TABLE loan_photos
  ADD CONSTRAINT loan_photos_stage_check
  CHECK (stage IN ('pledge', 'collection'));

COMMENT ON COLUMN loan_photos.stage IS
  'pledge = captured at creation, collection = captured at closing. Existing '
  'rows default to pledge, which is what they are: every photo taken before '
  'this migration was taken when the loan was created.';


-- ── 2. Allow two rows per loan ──────────────────────────────────────────────
-- Nothing references loan_photos as a foreign-key target, so replacing the
-- primary key is safe. The composite FK to loans(id, tenant_id) from migration
-- 003 is on the other side and is untouched.
ALTER TABLE loan_photos DROP CONSTRAINT IF EXISTS loan_photos_pkey;
ALTER TABLE loan_photos
  ADD CONSTRAINT loan_photos_pkey PRIMARY KEY (loan_id, stage);

-- Reads are almost always "the photos for this loan", or "this loan's
-- collection photo" during closing.
CREATE INDEX IF NOT EXISTS idx_loan_photos_loan_stage
  ON loan_photos (tenant_id, loan_id, stage);


-- ── 3. Closure requires a COLLECTION photo ──────────────────────────────────
-- The check in migration 013 was `NOT EXISTS (... WHERE loan_id = p_loan_id)`,
-- which any photo satisfied. With two stages the pledge photo would have met
-- it on its own and no collection photo would ever have been taken — the
-- setting would have looked enforced while quietly doing nothing.
CREATE OR REPLACE FUNCTION has_photo(p_loan_id BIGINT, p_stage TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM loan_photos
     WHERE loan_id = p_loan_id
       AND (p_stage IS NULL OR stage = p_stage)
  );
$$;

GRANT EXECUTE ON FUNCTION has_photo(BIGINT, TEXT) TO authenticated;


-- ── 4. Camera mode ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION default_settings()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '{
    "theme": "light",
    "date_display_format": "dd/mm/yyyy",
    "language": "en",

    "interest_percentage": 36,
    "interest_calculation_type": "simple",
    "interest_calculation_period": "yearly",

    "identity_verification_enabled": true,
    "identity_mandatory_at_creation": true,
    "identity_mandatory_at_closure": true,
    "identity_allow_multiple_mobile_devices": false,

    "photo_capture_mode": "webcam",

    "add_record_address_field_enabled": false,
    "add_record_additional_information_field_enabled": false,

    "dashboard_division_factor": 1,
    "lock_after_minutes": 0,
    "default_category": "Gold"
  }'::jsonb;
$$;

COMMENT ON FUNCTION default_settings() IS
  'photo_capture_mode: webcam | phone | off. Defaults to webcam because it '
  'needs no pairing — a shop can capture on day one without setting up a '
  'phone. off disables identity photos entirely, for shops that only want the '
  'record fields.';

GRANT EXECUTE ON FUNCTION default_settings() TO authenticated;


-- Carry the old boolean across for any shop that already set it, so nobody
-- silently loses a preference they chose.
INSERT INTO tenant_settings (tenant_id, key, value)
SELECT s.tenant_id, 'photo_capture_mode', '"phone"'::jsonb
  FROM tenant_settings s
 WHERE s.key = 'identity_allow_mobile_capture'
   AND s.value = 'true'::jsonb
   AND NOT EXISTS (
     SELECT 1 FROM tenant_settings t
      WHERE t.tenant_id = s.tenant_id AND t.key = 'photo_capture_mode'
   );

-- The old key is left in place rather than deleted. It is harmless, and if
-- this migration has to be reasoned about later it is useful to see what the
-- shop had chosen before.
COMMENT ON TABLE tenant_settings IS
  'One row per setting per shop. identity_allow_mobile_capture is superseded '
  'by photo_capture_mode (migration 019) and is no longer read.';


-- ── 5. close_loan requires the collection photo ─────────────────────────────
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

  -- Revised in 019. The 013 version accepted ANY photo, which the pledge
  -- photo satisfied on its own -- so with two stages no collection photo
  -- would ever have been demanded and the setting would have been decorative.
  IF photo_required('closure')
     AND NOT has_photo(p_loan_id, 'collection') THEN
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

  -- Both stages are flagged: `archived` means "this photo belongs to a
  -- closed loan", not "this photo is the closing one". The pledge photo is
  -- kept, never deleted -- it is the record of who handed the item over.
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
