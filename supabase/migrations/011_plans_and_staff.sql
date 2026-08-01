-- ============================================================
-- Migration 011 — Plan gating and staff accounts
--
-- Feature access is decided in the database, not the client. A gate that only
-- hides a button is decoration: anyone can call the RPC directly with the
-- public anon key. These functions are what actually enforce it.
-- ============================================================


-- ============================================================
-- 1. Plan status
-- ============================================================
-- Returns the tenant's effective entitlement, with the trial resolved against
-- the clock rather than trusting `plan_status` to have been updated by a job
-- that may not have run.

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
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('plan', 'none', 'active', false);
  END IF;

  SELECT * INTO v_t FROM tenants WHERE id = v_tenant;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('plan', 'none', 'active', false);
  END IF;

  -- A trial is active until its end date regardless of what plan_status says.
  IF v_t.plan = 'trial' THEN
    v_active := v_t.trial_ends_at IS NOT NULL AND v_t.trial_ends_at > now();
    v_days := GREATEST(0, EXTRACT(DAY FROM (v_t.trial_ends_at - now()))::INTEGER);
  ELSE
    v_active := v_t.plan_status = 'active';
    v_days := NULL;
  END IF;

  RETURN jsonb_build_object(
    'plan',            v_t.plan,
    'status',          v_t.plan_status,
    'active',          v_active,
    'trial_ends_at',   v_t.trial_ends_at,
    'trial_days_left', v_days,
    'staff_limit',     CASE v_t.plan
                         WHEN 'pro'   THEN 10
                         WHEN 'basic' THEN 3
                         ELSE 2                    -- trial: owner + one helper
                       END,
    'loan_limit',      CASE v_t.plan
                         WHEN 'pro'   THEN NULL    -- unlimited
                         WHEN 'basic' THEN 5000
                         ELSE 100                  -- trial
                       END
  );
END $$;


-- ============================================================
-- 2. Enforcement
-- ============================================================
-- Called from create_loan(). Read-only checks (reports, search, looking up a
-- customer) are deliberately NOT gated: locking a shop out of their own
-- records because a card expired would be indefensible. Expiry stops them
-- adding new business, nothing more.

CREATE OR REPLACE FUNCTION assert_can_write()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan JSONB;
  v_count BIGINT;
  v_limit INTEGER;
BEGIN
  v_plan := my_plan();

  IF NOT (v_plan ->> 'active')::BOOLEAN THEN
    IF v_plan ->> 'plan' = 'trial' THEN
      RAISE EXCEPTION 'Your trial has ended. Subscribe to keep adding loans — your existing records stay available.'
        USING ERRCODE = '42501';
    ELSE
      RAISE EXCEPTION 'Your subscription is not active. Renew to keep adding loans — your existing records stay available.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_limit := NULLIF(v_plan ->> 'loan_limit', '')::INTEGER;
  IF v_limit IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM loans WHERE tenant_id = get_tenant_id();
    IF v_count >= v_limit THEN
      RAISE EXCEPTION 'This plan is limited to % loans. Upgrade to add more.', v_limit
        USING ERRCODE = '42501';
    END IF;
  END IF;
END $$;


-- Wire the check into loan creation. Deposits and closures are NOT gated:
-- refusing to record a repayment on an existing loan would corrupt the shop's
-- books over a billing problem.
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
-- 3. Staff invitations
-- ============================================================
CREATE OR REPLACE FUNCTION invite_staff(p_email TEXT, p_role TEXT DEFAULT 'staff')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant  UUID;
  v_me      users%ROWTYPE;
  v_plan    JSONB;
  v_seats   INTEGER;
  v_used    BIGINT;
  v_token   TEXT;
  v_id      UUID;
  v_email   TEXT;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_me FROM users WHERE auth_id = auth.uid();
  IF v_me.role <> 'owner' THEN
    RAISE EXCEPTION 'Only the shop owner can invite staff' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('owner', 'staff') THEN
    RAISE EXCEPTION 'Role must be owner or staff' USING ERRCODE = '22023';
  END IF;

  v_email := lower(trim(p_email));
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'That does not look like an email address' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE tenant_id = v_tenant AND lower(email) = v_email) THEN
    RAISE EXCEPTION 'That person already has access' USING ERRCODE = '23505';
  END IF;

  -- Count seats as members plus outstanding invitations, or a shop could issue
  -- twenty invitations on a two-seat plan and let them all be accepted.
  v_plan := my_plan();
  v_seats := (v_plan ->> 'staff_limit')::INTEGER;

  SELECT (SELECT count(*) FROM users WHERE tenant_id = v_tenant)
       + (SELECT count(*) FROM user_invitations
           WHERE tenant_id = v_tenant AND accepted_at IS NULL AND expires_at > now())
    INTO v_used;

  IF v_used >= v_seats THEN
    RAISE EXCEPTION 'This plan allows % people. Upgrade to add more.', v_seats
      USING ERRCODE = '42501';
  END IF;

  -- Replace any expired invitation for the same address rather than colliding
  -- with the unique constraint.
  DELETE FROM user_invitations
   WHERE tenant_id = v_tenant AND lower(email) = v_email AND accepted_at IS NULL;

  INSERT INTO user_invitations (tenant_id, email, role, invited_by)
  VALUES (v_tenant, v_email, p_role, v_me.id)
  RETURNING id, token INTO v_id, v_token;

  RETURN jsonb_build_object('id', v_id, 'token', v_token, 'email', v_email);
END $$;


CREATE OR REPLACE FUNCTION revoke_staff(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant UUID;
  v_me     users%ROWTYPE;
  v_target users%ROWTYPE;
BEGIN
  v_tenant := get_tenant_id();
  SELECT * INTO v_me FROM users WHERE auth_id = auth.uid();

  IF v_me.role <> 'owner' THEN
    RAISE EXCEPTION 'Only the shop owner can remove people' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target FROM users WHERE id = p_user_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That person is not in this shop' USING ERRCODE = 'P0002';
  END IF;

  IF v_target.id = v_me.id THEN
    RAISE EXCEPTION 'You cannot remove yourself' USING ERRCODE = '22023';
  END IF;

  -- A shop with no owner cannot be administered at all.
  IF v_target.role = 'owner'
     AND (SELECT count(*) FROM users WHERE tenant_id = v_tenant AND role = 'owner') <= 1 THEN
    RAISE EXCEPTION 'A shop must have at least one owner' USING ERRCODE = '22023';
  END IF;

  DELETE FROM users WHERE id = p_user_id AND tenant_id = v_tenant;
END $$;


-- ============================================================
-- 4. Settings
-- ============================================================
CREATE OR REPLACE FUNCTION set_setting(p_key TEXT, p_value JSONB)
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
  IF length(p_key) > 64 THEN
    RAISE EXCEPTION 'Setting key is too long' USING ERRCODE = '22023';
  END IF;

  INSERT INTO tenant_settings (tenant_id, key, value)
  VALUES (v_tenant, p_key, p_value)
  ON CONFLICT (tenant_id, key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();
END $$;


CREATE OR REPLACE FUNCTION shop_members()
RETURNS TABLE (
  id UUID, full_name TEXT, email TEXT, role TEXT,
  created_at TIMESTAMPTZ, is_me BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.full_name, u.email, u.role, u.created_at,
         u.auth_id = auth.uid()
    FROM users u
   ORDER BY (u.role = 'owner') DESC, u.created_at;
$$;


-- ============================================================
-- Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION my_plan()                        TO authenticated;
GRANT EXECUTE ON FUNCTION invite_staff(TEXT, TEXT)         TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_staff(UUID)               TO authenticated;
GRANT EXECUTE ON FUNCTION set_setting(TEXT, JSONB)         TO authenticated;
GRANT EXECUTE ON FUNCTION shop_members()                   TO authenticated;
REVOKE EXECUTE ON FUNCTION assert_can_write()              FROM public, anon, authenticated;
