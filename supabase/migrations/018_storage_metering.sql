-- ============================================================
-- Migration 018 — Storage metering
--
-- Records how much R2 space each shop is using, so plan limits can be based on
-- something real rather than a guess.
--
-- Three decisions are baked in here:
--
--   1. A closed loan's photo is kept forever and keeps counting. It is the
--      shop's evidence of who collected the item; deleting it to save a few
--      megabytes would be a poor trade the first time a dispute arises.
--
--   2. Going over the limit NEVER blocks a write. Identity photos are
--      mandatory at closing when verification is on, so refusing an upload
--      would stop a shop closing loans — you would be halting their business
--      over storage. The limit produces a warning; you follow it up yourself.
--
--   3. Usage is a running total, kept by a trigger rather than recomputed.
--      A SUM over loan_photos is exact but scans every row, which is fine at a
--      thousand photos and not at a hundred thousand.
--
-- The trigger, rather than the application, is deliberate. Photos are written
-- from three places today — the confirm route, the camera relay, and the
-- offline queue when it drains — and a fourth will be added eventually. Only
-- the database sees all of them.
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS storage_bytes BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN tenants.storage_bytes IS
  'Running total of loan_photos.byte_size for this tenant, maintained by the '
  'trg_loan_photos_storage trigger. Never write this by hand — recalculate '
  'with recalculate_storage_bytes(tenant_id) if it is ever in doubt.';


-- ============================================================
-- Keep the total in step
-- ============================================================
CREATE OR REPLACE FUNCTION loan_photos_storage_delta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE tenants
       SET storage_bytes = storage_bytes + COALESCE(NEW.byte_size, 0)
     WHERE id = NEW.tenant_id;

  ELSIF TG_OP = 'DELETE' THEN
    -- GREATEST guards against the total going negative if a byte_size was
    -- recorded wrong at some point. A stuck-at-zero total is recoverable;
    -- a negative one silently grants unlimited storage.
    UPDATE tenants
       SET storage_bytes = GREATEST(0, storage_bytes - COALESCE(OLD.byte_size, 0))
     WHERE id = OLD.tenant_id;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Re-uploading a photo for the same loan is an UPDATE, not an INSERT,
    -- because loan_id is the primary key. Without this branch a shop could
    -- replace a 200KB photo with a 5MB one and the total would never move.
    IF NEW.tenant_id = OLD.tenant_id THEN
      UPDATE tenants
         SET storage_bytes = GREATEST(
               0,
               storage_bytes - COALESCE(OLD.byte_size, 0) + COALESCE(NEW.byte_size, 0)
             )
       WHERE id = NEW.tenant_id;
    ELSE
      UPDATE tenants SET storage_bytes = GREATEST(0, storage_bytes - COALESCE(OLD.byte_size, 0))
       WHERE id = OLD.tenant_id;
      UPDATE tenants SET storage_bytes = storage_bytes + COALESCE(NEW.byte_size, 0)
       WHERE id = NEW.tenant_id;
    END IF;
  END IF;

  RETURN NULL;   -- AFTER trigger; the return value is ignored
END $$;

DROP TRIGGER IF EXISTS trg_loan_photos_storage ON loan_photos;
CREATE TRIGGER trg_loan_photos_storage
  AFTER INSERT OR UPDATE OR DELETE ON loan_photos
  FOR EACH ROW EXECUTE FUNCTION loan_photos_storage_delta();


-- ============================================================
-- Repair
-- ============================================================
-- Running totals drift — a restore from backup, a bulk migration that bypassed
-- the trigger, a bug. This is the authority to fall back on.
-- The output columns are named t_id / bytes_before / bytes_after rather than
-- the obvious tenant_id / old_bytes / new_bytes. A RETURNS TABLE column is a
-- variable in scope throughout the body, so calling one `tenant_id` would
-- shadow loan_photos.tenant_id and tenants.tenant_id inside the query below —
-- Postgres then raises "column reference is ambiguous" at runtime, from a
-- function that looks perfectly correct on the page.
CREATE OR REPLACE FUNCTION recalculate_storage_bytes(p_tenant UUID DEFAULT NULL)
RETURNS TABLE (t_id UUID, bytes_before BIGINT, bytes_after BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH actual AS (
    SELECT t.id,
           t.storage_bytes AS b_before,
           -- The ::BIGINT is required, not tidiness. SUM() over a bigint
           -- returns NUMERIC in Postgres — it has to, because a sum can
           -- overflow its input type — so without the cast this function
           -- fails at runtime with "Returned type numeric does not match
           -- expected type bigint in column 3".
           COALESCE((SELECT SUM(COALESCE(p.byte_size, 0))
                       FROM loan_photos p
                      WHERE p.tenant_id = t.id), 0)::BIGINT AS b_after
      FROM tenants t
     WHERE p_tenant IS NULL OR t.id = p_tenant
  ),
  upd AS (
    UPDATE tenants t
       SET storage_bytes = a.b_after
      FROM actual a
     WHERE t.id = a.id AND t.storage_bytes IS DISTINCT FROM a.b_after
     RETURNING t.id
  )
  SELECT a.id, a.b_before, a.b_after FROM actual a
   WHERE a.b_before IS DISTINCT FROM a.b_after;
END $$;

-- Backfill whatever already exists.
SELECT * FROM recalculate_storage_bytes();


-- ============================================================
-- Plan limits
-- ============================================================
-- PROVISIONAL NUMBERS. Do not treat these as pricing.
--
-- A compressed photo off compressImage() — 1600px long edge, quality 0.8 — is
-- roughly 200-350KB, so:
--
--     250 MB  ~=   800-1,200 photos
--       2 GB  ~= 6,000-10,000 photos
--      10 GB  ~= 30,000-50,000 photos
--
-- Set against the existing loan_limit (100 trial / 5,000 basic / unlimited pro)
-- these are deliberately loose: no shop should hit the storage cap before the
-- loan cap. Revisit once two or three migrated shops have run for a month and
-- you can see a real footprint instead of this arithmetic.
--
-- Worth knowing: Cloudflare R2's free tier is 10 GB TOTAL across your whole
-- account, not per shop. Three or four active shops will pass it. That is a
-- bill to expect, not a bug.
CREATE OR REPLACE FUNCTION plan_storage_limit(p_plan TEXT)
RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_plan
           WHEN 'pro'   THEN 10::BIGINT * 1024 * 1024 * 1024
           WHEN 'basic' THEN  2::BIGINT * 1024 * 1024 * 1024
           ELSE             250::BIGINT * 1024 * 1024
         END;
$$;


-- ============================================================
-- Expose usage through my_plan()
-- ============================================================
-- Extends the 011 version; every field it returned is preserved.
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
                         WHEN 'pro'   THEN NULL
                         WHEN 'basic' THEN 5000
                         ELSE 100
                       END,
    'storage_bytes',   v_t.storage_bytes,
    'storage_limit',   v_limit,
    'storage_pct',     CASE WHEN v_limit > 0
                         THEN ROUND((v_t.storage_bytes::NUMERIC / v_limit) * 100, 1)
                         ELSE 0 END,
    -- Advisory only. Nothing in the write path reads this — see the note at the
    -- top about never blocking a close.
    'storage_over',    v_t.storage_bytes > v_limit
  );
END $$;


GRANT EXECUTE ON FUNCTION plan_storage_limit(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION recalculate_storage_bytes(UUID) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION loan_photos_storage_delta() FROM public, anon, authenticated;

-- Belt and braces. Migration 003 already narrowed writes on this table to
-- GRANT UPDATE (shop_name, updated_at), so a new column is not writable by
-- default — but that is easy to widen later without noticing what it exposes.
-- Letting a client set storage_bytes would let a shop zero its own usage,
-- which is the storage equivalent of the plan-escalation hole 003 closed.
REVOKE UPDATE (storage_bytes) ON tenants FROM authenticated;
