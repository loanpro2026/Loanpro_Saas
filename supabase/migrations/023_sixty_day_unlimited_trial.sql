-- ============================================================
-- Migration 023 — 60-day, unlimited-record trial
--
-- Product decision: a new shop should be able to evaluate the complete loan
-- workflow without entering payment details or hitting an artificial record
-- cap. Billing can stop new lending after the trial, but it must never block
-- access to existing records, deposits, closures, reports, or exports.
-- ============================================================

-- Existing trial tenants receive the same 60-day window measured from their
-- original creation date. A manually granted longer trial is never shortened.
UPDATE tenants
   SET trial_ends_at = GREATEST(
         COALESCE(trial_ends_at, created_at),
         created_at + INTERVAL '60 days'
       ),
       updated_at = now()
 WHERE plan = 'trial';


-- Keep provisioning atomic while changing the default trial duration.
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
  VALUES (trim(p_shop_name), v_auth_id, 'trial', 'active', now() + INTERVAL '60 days')
  RETURNING id INTO v_tenant_id;

  INSERT INTO users (auth_id, tenant_id, full_name, email, role)
  VALUES (v_auth_id, v_tenant_id, trim(p_full_name), coalesce(v_email, ''), 'owner');

  PERFORM seed_default_settings(v_tenant_id);

  RETURN v_tenant_id;
END $$;

REVOKE EXECUTE ON FUNCTION provision_tenant(TEXT, TEXT) FROM public, anon;
GRANT  EXECUTE ON FUNCTION provision_tenant(TEXT, TEXT) TO authenticated;


-- Preserve every field introduced by migration 018, changing only the trial
-- loan limit. Storage metering remains advisory and will be revisited with the
-- final pricing model.
CREATE OR REPLACE FUNCTION my_plan()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant UUID;
  v_t      tenants%ROWTYPE;
  v_active BOOLEAN;
  v_days   INTEGER;
  v_limit  BIGINT;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('plan', 'none', 'active', false);
  END IF;

  SELECT * INTO v_t FROM tenants WHERE id = v_tenant;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('plan', 'none', 'active', false);
  END IF;

  IF v_t.plan = 'trial' THEN
    v_active := v_t.trial_ends_at IS NOT NULL AND v_t.trial_ends_at > now();
    v_days := GREATEST(0, EXTRACT(DAY FROM (v_t.trial_ends_at - now()))::INTEGER);
  ELSE
    v_active := v_t.plan_status = 'active';
    v_days := NULL;
  END IF;

  v_limit := plan_storage_limit(v_t.plan);

  RETURN jsonb_build_object(
    'plan',            v_t.plan,
    'status',          v_t.plan_status,
    'active',          v_active,
    'trial_ends_at',   v_t.trial_ends_at,
    'trial_days_left', v_days,
    'staff_limit',     CASE v_t.plan
                         WHEN 'pro'   THEN 10
                         WHEN 'basic' THEN 3
                         ELSE 2
                       END,
    'loan_limit',      CASE v_t.plan
                         WHEN 'basic' THEN 5000
                         ELSE NULL
                       END,
    'storage_bytes',   v_t.storage_bytes,
    'storage_limit',   v_limit,
    'storage_pct',     CASE WHEN v_limit > 0
                         THEN ROUND((v_t.storage_bytes::NUMERIC / v_limit) * 100, 1)
                         ELSE 0 END,
    'storage_over',    v_t.storage_bytes > v_limit
  );
END $$;

GRANT EXECUTE ON FUNCTION my_plan() TO authenticated;
