-- ============================================================
-- Migration 021 — default_category is Silver, not Gold
--
-- The desktop's Add Record form initialises its metal to Silver:
--
--     const [formData, setFormData] = useState<FormData>({
--       ...
--       type: "Silver",
--     });
--
-- It is hardcoded — there is no setting behind it. The web copied the idea of
-- a preference but picked Gold as the default, which is not what any migrating
-- shop is used to.
--
-- It sounds trivial. It is not: the metal is the one field on that form a
-- shopkeeper is most likely to skip past, because it already has a value. Get
-- the default wrong and a silver-heavy shop mis-files records until somebody
-- notices, and each one has to be corrected by hand.
--
-- The setting itself is kept — shops genuinely differ, and being able to set it
-- is an improvement over hardcoding. Only the default changes, to match what
-- the desktop does today.
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

    "photo_capture_mode": "webcam",

    "add_record_address_field_enabled": false,
    "add_record_additional_information_field_enabled": false,

    "dashboard_division_factor": 1,
    "lock_after_minutes": 0,
    "default_category": "Silver"
  }'::jsonb;
$$;

GRANT EXECUTE ON FUNCTION default_settings() TO authenticated;

-- Shops that have not chosen a metal explicitly follow the default, so nothing
-- else is needed. A shop that HAS chosen one keeps its choice: this only
-- changes what happens when tenant_settings has no row for the key.
