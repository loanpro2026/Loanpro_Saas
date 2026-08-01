-- ============================================================
-- Migration 017 — Enforce the values that were only ever comments
--
-- Four columns declare their permitted values in a trailing SQL comment and
-- nothing else:
--
--     role        TEXT NOT NULL DEFAULT 'owner',     -- owner | staff
--     plan        TEXT NOT NULL DEFAULT 'trial',     -- trial | basic | pro
--     plan_status TEXT NOT NULL DEFAULT 'active',    -- active | expired | cancelled
--     status      TEXT NOT NULL DEFAULT 'pending',   -- pending | active | ...
--
-- The application has always treated these as closed sets — `types/index.ts`
-- declares UserRole, PlanType, PlanStatus and SubStatus — but the database
-- would accept any string at all. `user_invitations.role` already has a CHECK,
-- so this was an inconsistency rather than a decision.
--
-- Why it matters beyond tidiness:
--
--   * `users.role` gates the owner-only actions — reopening a closed loan,
--     deleting a record, correcting a settled loan. Those read
--     `ctx.role !== 'owner'`. A row holding 'Owner' or 'admin' silently
--     becomes staff, and the shop owner quietly loses the ability to correct
--     their own books.
--
--   * `tenants.plan` drives feature gating through my_plan() and
--     assert_can_write(). A typo there either unlocks a plan nobody paid for
--     or locks out someone who did.
--
-- Neither failure announces itself. Both are the kind that surface weeks later
-- as "it used to let me do this".
--
-- Safety: these are plain CHECK constraints, so Postgres validates existing
-- rows as it adds them. On a database with real data a bad row makes the ALTER
-- fail rather than silently truncating anything — the SELECTs below let you see
-- what is there first.
-- ============================================================

-- Look before you leap. On a fresh project these all return zero rows.
DO $$
DECLARE
  bad INT;
BEGIN
  SELECT count(*) INTO bad FROM users WHERE role NOT IN ('owner', 'staff');
  IF bad > 0 THEN
    RAISE EXCEPTION 'users: % row(s) have a role outside (owner, staff). Fix them before running this migration: SELECT DISTINCT role FROM users;', bad;
  END IF;

  SELECT count(*) INTO bad FROM tenants WHERE plan NOT IN ('trial', 'basic', 'pro');
  IF bad > 0 THEN
    RAISE EXCEPTION 'tenants: % row(s) have a plan outside (trial, basic, pro).', bad;
  END IF;

  SELECT count(*) INTO bad FROM tenants WHERE plan_status NOT IN ('active', 'expired', 'cancelled');
  IF bad > 0 THEN
    RAISE EXCEPTION 'tenants: % row(s) have a plan_status outside (active, expired, cancelled).', bad;
  END IF;

  SELECT count(*) INTO bad FROM subscriptions
   WHERE status NOT IN ('pending', 'active', 'expired', 'cancelled', 'failed');
  IF bad > 0 THEN
    RAISE EXCEPTION 'subscriptions: % row(s) have a status outside the allowed set.', bad;
  END IF;

  SELECT count(*) INTO bad FROM subscriptions WHERE plan NOT IN ('trial', 'basic', 'pro');
  IF bad > 0 THEN
    RAISE EXCEPTION 'subscriptions: % row(s) have a plan outside (trial, basic, pro).', bad;
  END IF;

  RAISE NOTICE 'All existing rows are within the allowed values — adding constraints.';
END $$;


ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'staff'));

ALTER TABLE tenants
  ADD CONSTRAINT tenants_plan_check
  CHECK (plan IN ('trial', 'basic', 'pro'));

ALTER TABLE tenants
  ADD CONSTRAINT tenants_plan_status_check
  CHECK (plan_status IN ('active', 'expired', 'cancelled'));

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('trial', 'basic', 'pro'));

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('pending', 'active', 'expired', 'cancelled', 'failed'));


COMMENT ON CONSTRAINT users_role_check ON users IS
  'Owner-only actions read this column. An unrecognised value silently '
  'demotes the account to staff, so the set is closed here rather than trusted.';

COMMENT ON CONSTRAINT tenants_plan_check ON tenants IS
  'Feature gating reads this through my_plan(). Closed set so a typo cannot '
  'grant or withhold a plan.';
