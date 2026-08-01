-- ============================================================
-- Migration 005 — Atomic tenant provisioning
--
-- Replaces the two-step insert in /api/auth/register, which had two faults:
--
--   1. It took `auth_id` from the request body. Anyone could POST an arbitrary
--      auth_id and provision a tenant for another user, or spam tenants for
--      accounts that do not exist.
--   2. tenant insert and user insert were separate statements with no
--      transaction. If the second failed, the database was left with an
--      ownerless tenant and a user who could never sign in.
--
-- Doing it in one SECURITY DEFINER function fixes both: identity comes from
-- auth.uid() inside the database, and the whole thing is one statement.
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
  -- Identity comes from the verified JWT, never from an argument.
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

  -- Idempotent: signing up twice returns the existing tenant rather than
  -- creating a second shop.
  SELECT tenant_id INTO v_existing FROM users WHERE auth_id = v_auth_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Take the email from auth.users, so it cannot disagree with the account.
  SELECT email INTO v_email FROM auth.users WHERE id = v_auth_id;

  INSERT INTO tenants (shop_name, owner_id, plan, plan_status, trial_ends_at)
  VALUES (trim(p_shop_name), v_auth_id, 'trial', 'active', now() + INTERVAL '14 days')
  RETURNING id INTO v_tenant_id;

  INSERT INTO users (auth_id, tenant_id, full_name, email, role)
  VALUES (v_auth_id, v_tenant_id, trim(p_full_name), coalesce(v_email, ''), 'owner');

  RETURN v_tenant_id;
END $$;

REVOKE EXECUTE ON FUNCTION provision_tenant(TEXT, TEXT) FROM public, anon;
GRANT  EXECUTE ON FUNCTION provision_tenant(TEXT, TEXT) TO authenticated;


-- ============================================================
-- Accepting a staff invitation
-- ============================================================
-- Same reasoning: joining an existing tenant is privileged, so it happens
-- inside the database against a single-use token rather than by letting a
-- client insert its own `users` row with a tenant_id of its choosing.

CREATE OR REPLACE FUNCTION accept_invitation(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_id UUID;
  v_email   TEXT;
  v_inv     user_invitations%ROWTYPE;
BEGIN
  v_auth_id := auth.uid();
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE auth_id = v_auth_id) THEN
    RAISE EXCEPTION 'This account already belongs to a shop' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_inv
    FROM user_invitations
   WHERE token = p_token
     AND accepted_at IS NULL
     AND expires_at > now()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation is invalid or has expired' USING ERRCODE = '22023';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_auth_id;

  -- The invitation is addressed to a specific person; it is not a link that
  -- lets whoever finds it into the shop.
  IF lower(coalesce(v_email, '')) <> lower(v_inv.email) THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO users (auth_id, tenant_id, full_name, email, role)
  VALUES (v_auth_id, v_inv.tenant_id, split_part(coalesce(v_email, ''), '@', 1),
          coalesce(v_email, ''), v_inv.role);

  UPDATE user_invitations SET accepted_at = now() WHERE id = v_inv.id;

  RETURN v_inv.tenant_id;
END $$;

REVOKE EXECUTE ON FUNCTION accept_invitation(TEXT) FROM public, anon;
GRANT  EXECUTE ON FUNCTION accept_invitation(TEXT) TO authenticated;


-- ============================================================
-- Block direct writes to users / tenants from the client
-- ============================================================
-- With provisioning handled by the functions above, clients have no legitimate
-- reason to INSERT into either table. 001 had no INSERT policy on `users` or
-- `tenants` — this makes that explicit and revokes the underlying grant too,
-- so the intent survives someone adding a policy later without thinking.

REVOKE INSERT, DELETE ON tenants FROM authenticated, anon;
REVOKE INSERT, DELETE ON users   FROM authenticated, anon;
