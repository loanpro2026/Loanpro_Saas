-- ============================================================
-- Migration 031 - required application settings and photo source policy
-- ============================================================

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
    "photo_capture_mode": "local",

    "add_record_address_field_enabled": false,
    "add_record_additional_information_field_enabled": false,

    "dashboard_division_factor": 1,
    "lock_after_minutes": 0,
    "lock_on_startup": false,
    "default_category": "Silver"
  }'::jsonb;
$$;

GRANT EXECUTE ON FUNCTION default_settings() TO authenticated;

-- Preserve the behaviour tenants had before source selection became explicit:
-- automatic/phone used the paired phone on desktop, while webcam was local.
UPDATE tenant_settings
   SET value = '"mobile"'::jsonb, updated_at = now()
 WHERE key = 'photo_capture_mode'
   AND value IN ('"automatic"'::jsonb, '"phone"'::jsonb);

UPDATE tenant_settings
   SET value = '"local"'::jsonb, updated_at = now()
 WHERE key = 'photo_capture_mode'
   AND value = '"webcam"'::jsonb;

-- The old `off` source value becomes the unambiguous master switch.
UPDATE tenant_settings
   SET value = 'false'::jsonb, updated_at = now()
 WHERE key = 'identity_verification_enabled'
   AND tenant_id IN (
     SELECT tenant_id FROM tenant_settings
      WHERE key = 'photo_capture_mode' AND value = '"off"'::jsonb
   );

UPDATE tenant_settings
   SET value = '"local"'::jsonb, updated_at = now()
 WHERE key = 'photo_capture_mode' AND value = '"off"'::jsonb;

DO $$
DECLARE t UUID;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    PERFORM seed_default_settings(t);
  END LOOP;
END $$;

-- The master switch alone controls whether photo requirements are active.
CREATE OR REPLACE FUNCTION photo_required(p_stage TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH settings AS (SELECT my_settings() AS value)
  SELECT COALESCE((value ->> 'identity_verification_enabled')::BOOLEAN, true)
     AND COALESCE((value ->> (
           CASE p_stage
             WHEN 'closure' THEN 'identity_mandatory_at_closure'
             ELSE                'identity_mandatory_at_creation'
           END))::BOOLEAN, true)
    FROM settings;
$$;

GRANT EXECUTE ON FUNCTION photo_required(TEXT) TO authenticated;

-- Monthly compounding is now an explicit option alongside quarterly,
-- half-yearly and yearly. Simple interest ignores this period setting.
CREATE OR REPLACE FUNCTION calculate_interest(
  p_principal   NUMERIC,
  p_issue_date  DATE,
  p_as_of       DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  s JSONB;
  v_days NUMERIC;
  v_years NUMERIC;
  v_rate NUMERIC;
  v_type TEXT;
  v_period TEXT;
  v_n NUMERIC;
BEGIN
  s := my_settings();
  v_rate := COALESCE((s ->> 'interest_percentage')::NUMERIC, 36) / 100;
  v_type := COALESCE(s ->> 'interest_calculation_type', 'simple');
  v_period := COALESCE(s ->> 'interest_calculation_period', 'yearly');
  v_days := GREATEST(0, COALESCE(p_as_of, (now() AT TIME ZONE 'Asia/Kolkata')::date) - p_issue_date);
  v_years := v_days / 365.0;

  IF v_type = 'compound' THEN
    v_n := CASE v_period
             WHEN 'monthly'     THEN 12
             WHEN 'quarterly'   THEN 4
             WHEN 'half-yearly' THEN 2
             ELSE 1
           END;
    RETURN round(p_principal * (power(1 + (v_rate / v_n), v_n * v_years) - 1));
  END IF;

  RETURN round(p_principal * v_rate * v_years);
END $$;

GRANT EXECUTE ON FUNCTION calculate_interest(NUMERIC, DATE, DATE) TO authenticated;

-- Close the financial record using the existing transactional function, then
-- retain exactly one identity source according to the closure-photo policy.
-- The removed R2 key is returned for cleanup after the database commit.
CREATE OR REPLACE FUNCTION close_loan_with_photo_policy(
  p_loan_id BIGINT,
  p_interest INTEGER,
  p_closed_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
  v_retired_key TEXT;
  v_requires_collection BOOLEAN;
BEGIN
  v_requires_collection := photo_required('closure');
  v_result := close_loan(p_loan_id, p_interest, p_closed_date);

  IF v_requires_collection THEN
    DELETE FROM loan_photos
     WHERE tenant_id = get_tenant_id() AND loan_id = p_loan_id AND stage = 'pledge'
     RETURNING r2_key INTO v_retired_key;
  ELSE
    DELETE FROM loan_photos
     WHERE tenant_id = get_tenant_id() AND loan_id = p_loan_id AND stage = 'collection'
     RETURNING r2_key INTO v_retired_key;
  END IF;

  RETURN v_result || jsonb_build_object('retired_photo_key', v_retired_key);
END $$;

GRANT EXECUTE ON FUNCTION close_loan_with_photo_policy(BIGINT, INTEGER, DATE) TO authenticated;

-- If a closure photo replaced the pledge photo, reopening promotes that sole
-- source back to the active loan's pledge slot.
CREATE OR REPLACE FUNCTION reopen_loan_with_photo_policy(p_loan_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := reopen_loan(p_loan_id);

  IF NOT has_photo(p_loan_id, 'pledge') AND has_photo(p_loan_id, 'collection') THEN
    UPDATE loan_photos
       SET stage = 'pledge', archived = false, archived_at = NULL
     WHERE tenant_id = get_tenant_id() AND loan_id = p_loan_id AND stage = 'collection';
  END IF;

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION reopen_loan_with_photo_policy(BIGINT) TO authenticated;
