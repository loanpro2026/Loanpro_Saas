-- ============================================================
-- Migration 012 — Settings parity with the desktop app
--
-- Two things here:
--   A. The full general-settings set, with the desktop's defaults, so a
--      migrated shop behaves identically on day one.
--   B. A correction to how interest is modelled. See below — this one matters.
-- ============================================================


-- ============================================================
-- A. CORRECTION: what `loans.interest` actually is
-- ============================================================
-- The web app was treating `loans.interest` as a per-loan percentage rate and
-- displaying it as "24%". That is wrong.
--
-- In the desktop app (mainfunctions.js removeRecord, Removerecord.tsx):
--   • `loans.interest` holds the interest AMOUNT in rupees, written once when
--     the loan is closed. It is NULL while a loan is active.
--   • Reports rely on this: `SUM(amount + interest)` is the total returned.
--   • The RATE is a single shop-wide setting (`interestPercentage`, default
--     36% PER YEAR) applied to every loan, not stored per loan at all.
--
-- Treating an annual 36% as a monthly rate overstates interest twelvefold —
-- a ₹45,000 loan held six months would settle at ₹27,000 interest instead of
-- ₹2,250. Nothing would have crashed; the shop would simply have overcharged
-- every customer.
--
-- The column stays exactly as it is (the migration script depends on that).
-- What changes is the comment, the settings that drive the calculation, and
-- the UI that reads it.

COMMENT ON COLUMN loans.interest IS
  'Interest AMOUNT in rupees, set when the loan is closed. NULL while active. '
  'The rate lives in tenant_settings.interest_percentage (annual).';


-- ============================================================
-- B. Default settings, matching the desktop
-- ============================================================
-- Seeded per tenant on provisioning so a fresh shop behaves like a fresh
-- desktop install. Keys are snake_case here; the desktop used camelCase in a
-- JSON file.
--
-- Deliberately NOT ported:
--   fingerprint*            — hardware-bound, desktop only
--   googleDrive*            — replaced by user-initiated export
--   identityStoreImageInDatabase — photos are in R2 now, always
--   webcamSettingsEnabled, identityFallbackToLaptopWebcam,
--   identityForceWebcamOnly, identityPreferMobileOverWebcam
--                           — desktop webcam plumbing; the browser picks a
--                             camera itself
--   autoBackup*             — no local filesystem to back up to

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
    "identity_allow_mobile_capture": false,
    "identity_allow_multiple_mobile_devices": false,

    "add_record_address_field_enabled": false,
    "add_record_additional_information_field_enabled": false,

    "dashboard_division_factor": 1,
    "lock_after_minutes": 0,
    "default_category": "Gold"
  }'::jsonb;
$$;


-- Seed a tenant with the defaults. Existing keys are left alone, so this is
-- safe to re-run and safe on a tenant that has already customised things.
CREATE OR REPLACE FUNCTION seed_default_settings(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k TEXT;
  v JSONB;
BEGIN
  FOR k, v IN SELECT * FROM jsonb_each(default_settings()) LOOP
    INSERT INTO tenant_settings (tenant_id, key, value)
    VALUES (p_tenant_id, k, v)
    ON CONFLICT (tenant_id, key) DO NOTHING;
  END LOOP;
END $$;


-- Backfill every existing tenant.
DO $$
DECLARE t UUID;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    PERFORM seed_default_settings(t);
  END LOOP;
END $$;


-- ============================================================
-- C. Read settings, with defaults filled in
-- ============================================================
-- Returns one object rather than making the client stitch rows together, and
-- guarantees every key is present so the UI never has to guess a default.

CREATE OR REPLACE FUNCTION my_settings()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT default_settings() || COALESCE(
    (SELECT jsonb_object_agg(key, value) FROM tenant_settings),
    '{}'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION default_settings()          TO authenticated;
GRANT EXECUTE ON FUNCTION my_settings()               TO authenticated;
REVOKE EXECUTE ON FUNCTION seed_default_settings(UUID) FROM public, anon, authenticated;


-- ============================================================
-- D. Interest calculation, server-side
-- ============================================================
-- Mirrors Removerecord.tsx exactly:
--
--   yearsDiff  = days / 365
--   annualRate = rate / 100
--   simple     = P * annualRate * yearsDiff
--   compound   = P * (1 + annualRate/periods)^(periods * yearsDiff) - P
--
-- 365 rather than 365.25: the desktop uses 365 and matching it matters more
-- than being astronomically correct. A shop reconciling a migrated loan
-- against their old printout must get the same number.
--
-- Exposed so the closing dialog and any report use one implementation. The
-- figure remains fully editable at closing — settlements get negotiated,
-- rounded, or waived for regulars, and the desktop allows that too.

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
  s        JSONB;
  v_days   NUMERIC;
  v_years  NUMERIC;
  v_rate   NUMERIC;
  v_type   TEXT;
  v_period TEXT;
  v_n      NUMERIC;
BEGIN
  s := my_settings();

  v_rate   := COALESCE((s ->> 'interest_percentage')::NUMERIC, 36) / 100;
  v_type   := COALESCE(s ->> 'interest_calculation_type', 'simple');
  v_period := COALESCE(s ->> 'interest_calculation_period', 'yearly');

  v_days  := GREATEST(0, COALESCE(p_as_of, (now() AT TIME ZONE 'Asia/Kolkata')::date) - p_issue_date);
  v_years := v_days / 365.0;

  IF v_type = 'compound' THEN
    v_n := CASE v_period
             WHEN 'quarterly'   THEN 4
             WHEN 'half-yearly' THEN 2
             ELSE 1
           END;
    RETURN round(p_principal * (power(1 + (v_rate / v_n), v_n * v_years) - 1));
  END IF;

  RETURN round(p_principal * v_rate * v_years);
END $$;

GRANT EXECUTE ON FUNCTION calculate_interest(NUMERIC, DATE, DATE) TO authenticated;


-- ============================================================
-- E. Include the suggested interest in loan_detail
-- ============================================================
-- Saves the closing dialog a second round trip, and means the figure the shop
-- sees comes from the same code path a report would use.

CREATE OR REPLACE FUNCTION loan_detail(p_loan_id BIGINT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'loan', to_jsonb(l),
    'deposits', COALESCE((
      SELECT jsonb_agg(to_jsonb(d) ORDER BY d.deposit_date DESC, d.id DESC)
        FROM deposits d WHERE d.loan_id = l.id
    ), '[]'::jsonb),
    'archived_deposits', COALESCE((
      SELECT jsonb_agg(to_jsonb(cd) ORDER BY cd.deposit_date DESC, cd.id DESC)
        FROM closed_record_deposits cd WHERE cd.loan_id = l.id
    ), '[]'::jsonb),
    'photo', (SELECT to_jsonb(p) FROM loan_photos p WHERE p.loan_id = l.id),
    'total_deposits', COALESCE(
      (SELECT sum(amount) FROM deposits WHERE loan_id = l.id),
      (SELECT sum(amount) FROM closed_record_deposits WHERE loan_id = l.id),
      0),
    'days_held', (COALESCE(l.closed_date, (now() AT TIME ZONE 'Asia/Kolkata')::date) - l.issue_date),
    -- Interest already charged if closed; otherwise what it would be today.
    'suggested_interest', CASE
      WHEN l.status = 'closed' THEN COALESCE(l.interest, 0)::NUMERIC
      ELSE calculate_interest(l.amount, l.issue_date)
    END
  )
  FROM loans l
  WHERE l.id = p_loan_id;
$$;

GRANT EXECUTE ON FUNCTION loan_detail(BIGINT) TO authenticated;


-- ============================================================
-- F. Seed settings for new tenants
-- ============================================================
CREATE OR REPLACE FUNCTION provision_tenant(
  p_shop_name TEXT,
  p_full_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_id   UUID;
  v_email     TEXT;
  v_tenant_id UUID;
  v_existing  UUID;
BEGIN
  v_auth_id := auth.uid();
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF coalesce(trim(p_shop_name), '') = '' THEN
    RAISE EXCEPTION 'Shop name is required' USING ERRCODE = '22023';
  END IF;
  IF coalesce(trim(p_full_name), '') = '' THEN
    RAISE EXCEPTION 'Your name is required' USING ERRCODE = '22023';
  END IF;

  SELECT tenant_id INTO v_existing FROM users WHERE auth_id = v_auth_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_auth_id;

  INSERT INTO tenants (shop_name, owner_id, plan, plan_status, trial_ends_at)
  VALUES (trim(p_shop_name), v_auth_id, 'trial', 'active', now() + INTERVAL '14 days')
  RETURNING id INTO v_tenant_id;

  INSERT INTO users (auth_id, tenant_id, full_name, email, role)
  VALUES (v_auth_id, v_tenant_id, trim(p_full_name), coalesce(v_email, ''), 'owner');

  -- New in 012: a fresh shop starts with the same defaults a fresh desktop
  -- install would have.
  PERFORM seed_default_settings(v_tenant_id);

  RETURN v_tenant_id;
END $$;

REVOKE EXECUTE ON FUNCTION provision_tenant(TEXT, TEXT) FROM public, anon;
GRANT  EXECUTE ON FUNCTION provision_tenant(TEXT, TEXT) TO authenticated;
