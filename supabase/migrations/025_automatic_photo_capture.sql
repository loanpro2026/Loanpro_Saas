-- ============================================================
-- Migration 025 — automatic photo capture by the device in use
--
-- Mobile sessions capture directly with that phone/tablet camera. Desktop
-- sessions retain the existing paired-phone relay. The old webcam/phone choice
-- could contradict the actual device and forced owners to change a shop-wide
-- setting whenever they moved between a laptop and phone.
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

    "photo_capture_mode": "automatic",

    "add_record_address_field_enabled": false,
    "add_record_additional_information_field_enabled": false,

    "dashboard_division_factor": 1,
    "lock_after_minutes": 0,
    "default_category": "Silver"
  }'::jsonb;
$$;

GRANT EXECUTE ON FUNCTION default_settings() TO authenticated;

UPDATE tenant_settings
   SET value = '"automatic"'::jsonb,
       updated_at = now()
 WHERE key = 'photo_capture_mode'
   AND value IN ('"webcam"'::jsonb, '"phone"'::jsonb);

COMMENT ON FUNCTION default_settings() IS
  'photo_capture_mode: automatic | off. Automatic uses the current mobile '
  'camera directly and retains the desktop paired-phone relay.';

-- Keep database enforcement aligned with the UI: switching capture off also
-- switches off both mandatory-photo gates. Existing photos remain intact.
CREATE OR REPLACE FUNCTION photo_required(p_stage TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH settings AS (SELECT my_settings() AS value)
  SELECT COALESCE((value ->> 'identity_verification_enabled')::BOOLEAN, true)
     AND COALESCE(value ->> 'photo_capture_mode', 'automatic') <> 'off'
     AND COALESCE((value ->> (
           CASE p_stage
             WHEN 'closure' THEN 'identity_mandatory_at_closure'
             ELSE                'identity_mandatory_at_creation'
           END))::BOOLEAN, true)
    FROM settings;
$$;

GRANT EXECUTE ON FUNCTION photo_required(TEXT) TO authenticated;
