-- ============================================================
-- Migration 024 — recoverable multi-device access
--
-- Login devices are deliberately separate from paired camera phones. A login
-- device represents one Supabase Auth session. There is no hardware binding,
-- browser fingerprint, MAC address, or machine serial number.
-- ============================================================

CREATE TABLE access_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_session_id UUID NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  user_agent      TEXT,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT access_devices_name_length CHECK (char_length(display_name) BETWEEN 1 AND 80)
);

CREATE INDEX access_devices_user_active_idx
  ON access_devices (user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE access_devices ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_app_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM users WHERE auth_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION get_app_user_id() FROM public, anon;
GRANT EXECUTE ON FUNCTION get_app_user_id() TO authenticated;

CREATE POLICY access_devices_select_own ON access_devices
  FOR SELECT TO authenticated
  USING (user_id = get_app_user_id() AND tenant_id = get_tenant_id());

-- Writes go through the functions below so callers cannot register a made-up
-- session or reactivate a session that the owner deliberately revoked.
REVOKE INSERT, UPDATE, DELETE ON access_devices FROM authenticated, anon;
GRANT SELECT ON access_devices TO authenticated;


-- Intentionally unlimited during testing. Later pricing work only needs to
-- redefine this function; registration and enforcement do not have to change.
CREATE OR REPLACE FUNCTION access_device_limit(p_plan TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULL::INTEGER;
$$;

REVOKE EXECUTE ON FUNCTION access_device_limit(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION access_device_limit(TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION register_access_session(
  p_session_id UUID,
  p_display_name TEXT,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claimed_session UUID;
  v_user users%ROWTYPE;
  v_existing access_devices%ROWTYPE;
  v_plan TEXT;
  v_limit INTEGER;
  v_active_count INTEGER;
  v_name TEXT;
BEGIN
  v_claimed_session := NULLIF(auth.jwt() ->> 'session_id', '')::UUID;
  IF auth.uid() IS NULL OR v_claimed_session IS NULL OR v_claimed_session <> p_session_id THEN
    RAISE EXCEPTION 'Session identity does not match' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_user FROM users WHERE auth_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'unprovisioned');
  END IF;

  SELECT * INTO v_existing
    FROM access_devices
   WHERE auth_session_id = p_session_id
     AND user_id = v_user.id;

  IF FOUND THEN
    IF v_existing.revoked_at IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'revoked', 'device_id', v_existing.id);
    END IF;

    -- Avoid a write on every request while keeping "last active" useful.
    IF v_existing.last_seen_at < now() - INTERVAL '10 minutes' THEN
      UPDATE access_devices
         SET last_seen_at = now(),
             user_agent = left(NULLIF(trim(p_user_agent), ''), 500),
             updated_at = now()
       WHERE id = v_existing.id;
    END IF;

    RETURN jsonb_build_object('status', 'active', 'device_id', v_existing.id, 'is_new', false);
  END IF;

  SELECT plan INTO v_plan FROM tenants WHERE id = v_user.tenant_id;
  v_limit := access_device_limit(v_plan);

  IF v_limit IS NOT NULL THEN
    SELECT count(*) INTO v_active_count
      FROM access_devices
     WHERE user_id = v_user.id AND revoked_at IS NULL;

    IF v_active_count >= v_limit THEN
      RETURN jsonb_build_object('status', 'limit_reached', 'limit', v_limit);
    END IF;
  END IF;

  v_name := left(COALESCE(NULLIF(trim(p_display_name), ''), 'Browser'), 80);
  INSERT INTO access_devices (
    tenant_id, user_id, auth_session_id, display_name, user_agent
  ) VALUES (
    v_user.tenant_id, v_user.id, p_session_id, v_name,
    left(NULLIF(trim(p_user_agent), ''), 500)
  )
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object('status', 'active', 'device_id', v_existing.id, 'is_new', true);
END $$;


CREATE OR REPLACE FUNCTION my_access_devices()
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  user_agent TEXT,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  is_current BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT d.id, d.display_name, d.user_agent, d.first_seen_at, d.last_seen_at,
         d.revoked_at,
         d.auth_session_id::TEXT = (auth.jwt() ->> 'session_id') AS is_current
    FROM access_devices d
   WHERE d.user_id = get_app_user_id()
   ORDER BY d.revoked_at NULLS FIRST, d.last_seen_at DESC;
$$;


CREATE OR REPLACE FUNCTION assert_device_management_session()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM access_devices
     WHERE user_id = get_app_user_id()
       AND auth_session_id::TEXT = (auth.jwt() ->> 'session_id')
       AND revoked_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This device was signed out' USING ERRCODE = '42501';
  END IF;
END $$;


CREATE OR REPLACE FUNCTION rename_access_device(p_device_id UUID, p_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name TEXT;
BEGIN
  PERFORM assert_device_management_session();
  v_name := left(trim(p_name), 80);
  IF v_name = '' THEN
    RAISE EXCEPTION 'Device name is required' USING ERRCODE = '22023';
  END IF;

  UPDATE access_devices
     SET display_name = v_name, updated_at = now()
   WHERE id = p_device_id AND user_id = get_app_user_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device not found' USING ERRCODE = 'P0002';
  END IF;
END $$;


CREATE OR REPLACE FUNCTION revoke_access_device(p_device_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current BOOLEAN;
BEGIN
  PERFORM assert_device_management_session();
  UPDATE access_devices
     SET revoked_at = COALESCE(revoked_at, now()), updated_at = now()
   WHERE id = p_device_id AND user_id = get_app_user_id()
  RETURNING auth_session_id::TEXT = (auth.jwt() ->> 'session_id') INTO v_current;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_current;
END $$;


CREATE OR REPLACE FUNCTION revoke_other_access_devices()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM assert_device_management_session();
  UPDATE access_devices
     SET revoked_at = COALESCE(revoked_at, now()), updated_at = now()
   WHERE user_id = get_app_user_id()
     AND auth_session_id::TEXT <> (auth.jwt() ->> 'session_id')
     AND revoked_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;


CREATE OR REPLACE FUNCTION revoke_all_access_devices()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM assert_device_management_session();
  UPDATE access_devices
     SET revoked_at = COALESCE(revoked_at, now()), updated_at = now()
   WHERE user_id = get_app_user_id() AND revoked_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION register_access_session(UUID, TEXT, TEXT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION my_access_devices() FROM public, anon;
REVOKE EXECUTE ON FUNCTION assert_device_management_session() FROM public, anon;
REVOKE EXECUTE ON FUNCTION rename_access_device(UUID, TEXT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION revoke_access_device(UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION revoke_other_access_devices() FROM public, anon;
REVOKE EXECUTE ON FUNCTION revoke_all_access_devices() FROM public, anon;

GRANT EXECUTE ON FUNCTION register_access_session(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION my_access_devices() TO authenticated;
GRANT EXECUTE ON FUNCTION assert_device_management_session() TO authenticated;
GRANT EXECUTE ON FUNCTION rename_access_device(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_access_device(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_other_access_devices() TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_all_access_devices() TO authenticated;
