-- ============================================================
-- Migration 004 — Tables missing from the desktop feature set
--
-- The Electron app has 15 MySQL tables; 001/002 covered 8 of them.
-- This migration adds the rest, minus the two fingerprint tables
-- (hardware-bound, deliberately not ported) and drive_backup_history
-- (replaced by Supabase PITR).
-- ============================================================


-- ============================================================
-- 1. closed_record_deposits
-- Deposit history is preserved when a loan is closed, so that historical
-- reports still reconcile after the live deposits row is removed.
-- ============================================================
CREATE TABLE closed_record_deposits (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           UUID   NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  loan_id             BIGINT NOT NULL,
  original_deposit_id BIGINT,
  amount              INTEGER NOT NULL,
  deposit_date        DATE    NOT NULL,
  archived_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_version      TEXT DEFAULT 'closed-record-deposits-v1',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT closed_record_deposits_tenant_match
    FOREIGN KEY (loan_id, tenant_id) REFERENCES loans(id, tenant_id) ON DELETE CASCADE,
  -- Mirrors uniq_closed_record_deposit_source in MySQL: archiving the same
  -- deposit twice is a no-op rather than a duplicate.
  CONSTRAINT closed_record_deposits_source_uniq
    UNIQUE (tenant_id, loan_id, original_deposit_id)
);

CREATE INDEX idx_closed_deposits_loan_date
  ON closed_record_deposits (tenant_id, loan_id, deposit_date);


-- ============================================================
-- 2. removed_records_with_deposits   (working table, purged daily)
-- A denormalised snapshot of loans closed today that had deposits — the
-- desktop app uses it for the end-of-day removal report.
-- ============================================================
CREATE TABLE removed_records_with_deposits (
  id                     BIGSERIAL PRIMARY KEY,
  tenant_id              UUID   NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  loan_id                BIGINT NOT NULL,
  name                   TEXT   NOT NULL,
  father_name            TEXT,
  location               TEXT,
  address                TEXT,
  amount                 INTEGER NOT NULL,
  detailed_type          TEXT,
  weight                 NUMERIC(10,3),
  issue_date             DATE NOT NULL,
  closed_date            DATE NOT NULL,
  closed_timestamp       TIMESTAMPTZ,
  additional_information TEXT,
  total_deposits         INTEGER NOT NULL DEFAULT 0,
  removal_date           DATE NOT NULL,
  remarks                TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_removed_records_date
  ON removed_records_with_deposits (tenant_id, removal_date);


-- ============================================================
-- 3. daily_deposit_records   (working table, purged daily)
-- Denormalised list of deposits taken today, for the daily report.
-- ============================================================
CREATE TABLE daily_deposit_records (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      UUID   NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  loan_id        BIGINT NOT NULL,
  loan_name      TEXT   NOT NULL,
  father_name    TEXT,
  location       TEXT,
  loan_amount    INTEGER NOT NULL,
  detailed_type  TEXT,
  weight         NUMERIC(10,3),
  deposit_amount INTEGER NOT NULL,
  deposit_date   DATE    NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_deposit_records_date
  ON daily_deposit_records (tenant_id, deposit_date);


-- ============================================================
-- 4. app_state — per-tenant key/value flags
-- Replaces the desktop's app_state table (daily-summary bootstrap etc).
-- ============================================================
CREATE TABLE app_state (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  state_key   TEXT NOT NULL,
  state_value TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, state_key)
);


-- ============================================================
-- 5. tenant_settings — replaces electron-store on the desktop
-- Typed as JSONB so a setting can be a scalar, list or object.
-- ============================================================
CREATE TABLE tenant_settings (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);


-- ============================================================
-- 6. user_invitations — staff accounts
-- ============================================================
CREATE TABLE user_invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'staff')),
  token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_invitations_email_uniq UNIQUE (tenant_id, email)
);


-- ============================================================
-- 7. migration_jobs — audit trail for hand-run migrations
-- Even though migrations are run by hand from a CLI, record them. Six months
-- from now, "where did this record come from?" needs an answer.
-- ============================================================
CREATE TABLE migration_jobs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_db          TEXT,
  source_app_version TEXT,
  status             TEXT NOT NULL DEFAULT 'running'
                       CHECK (status IN ('running', 'completed', 'failed')),
  stats              JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_log          TEXT,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ
);


-- ============================================================
-- 8. loan_photos — move from Supabase Storage to Cloudflare R2
-- ============================================================
-- 001 stored a public Supabase Storage URL. Customer identity photos must not
-- have permanent public URLs, and R2 keys are not URLs. Store the object key
-- and derive short-lived signed URLs at read time instead.

ALTER TABLE loan_photos ADD COLUMN IF NOT EXISTS r2_key      TEXT;
ALTER TABLE loan_photos ADD COLUMN IF NOT EXISTS byte_size   BIGINT;
ALTER TABLE loan_photos ADD COLUMN IF NOT EXISTS checksum    TEXT;
ALTER TABLE loan_photos ADD COLUMN IF NOT EXISTS mime_type   TEXT DEFAULT 'image/jpeg';
-- Replaces the desktop's separate closed_record_image_archive table: on object
-- storage there is no reason to split "on disk" from "in database".
ALTER TABLE loan_photos ADD COLUMN IF NOT EXISTS archived    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE loan_photos ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- photo_url / storage_path were Supabase-specific. Keep them nullable for now
-- so this migration is safe on a database that already has rows; drop them in
-- a later migration once nothing reads them.
ALTER TABLE loan_photos ALTER COLUMN photo_url    DROP NOT NULL;
ALTER TABLE loan_photos ALTER COLUMN storage_path DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loan_photos_archived
  ON loan_photos (tenant_id, archived);


-- ============================================================
-- 9. camera_sessions — R2 key instead of a public URL
-- ============================================================
ALTER TABLE camera_sessions ADD COLUMN IF NOT EXISTS r2_key TEXT;


-- ============================================================
-- ROW LEVEL SECURITY for everything added above
-- ============================================================
ALTER TABLE closed_record_deposits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE removed_records_with_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_deposit_records         ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_state                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invitations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_jobs                ENABLE ROW LEVEL SECURITY;

CREATE POLICY "closed_record_deposits_all" ON closed_record_deposits
  FOR ALL TO authenticated
  USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY "removed_records_all" ON removed_records_with_deposits
  FOR ALL TO authenticated
  USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY "daily_deposit_records_all" ON daily_deposit_records
  FOR ALL TO authenticated
  USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY "app_state_all" ON app_state
  FOR ALL TO authenticated
  USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY "tenant_settings_all" ON tenant_settings
  FOR ALL TO authenticated
  USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());

-- Invitations: readable by the tenant, but only writable server-side (an
-- invitation is how someone gains access, so issuing one is privileged).
CREATE POLICY "user_invitations_select" ON user_invitations
  FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id());

-- migration_jobs: read-only for the tenant, written by the CLI service role.
CREATE POLICY "migration_jobs_select" ON migration_jobs
  FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id());


-- ============================================================
-- updated_at triggers
-- ============================================================
DROP TRIGGER IF EXISTS set_updated_at_closed_record_deposits ON closed_record_deposits;
CREATE TRIGGER set_updated_at_closed_record_deposits
  BEFORE UPDATE ON closed_record_deposits
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_app_state ON app_state;
CREATE TRIGGER set_updated_at_app_state
  BEFORE UPDATE ON app_state
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_tenant_settings ON tenant_settings;
CREATE TRIGGER set_updated_at_tenant_settings
  BEFORE UPDATE ON tenant_settings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================
-- Daily purge of the two working tables
-- Replaces the desktop app's daily cleanup task. Requires pg_cron
-- (Supabase: Database → Extensions → enable pg_cron).
-- ============================================================
CREATE OR REPLACE FUNCTION purge_daily_working_tables()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM removed_records_with_deposits
   WHERE removal_date < (now() AT TIME ZONE 'Asia/Kolkata')::date;
  DELETE FROM daily_deposit_records
   WHERE deposit_date < (now() AT TIME ZONE 'Asia/Kolkata')::date;
END $$;

-- Schedule for 00:15 IST (18:45 UTC the previous day).
--
-- Checked with an IF rather than caught with an EXCEPTION. There is no
-- PL/pgSQL condition named `undefined_schema` — the real one is
-- `invalid_schema_name` — and naming a condition that does not exist is not a
-- runtime error you can catch: Postgres rejects it at compile time with
-- "unrecognized exception condition", which aborts the whole migration.
--
-- An explicit check is clearer anyway, and works whether or not pg_cron is
-- installed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'purge-daily-working-tables',
      '45 18 * * *',
      'SELECT purge_daily_working_tables()'
    );
    RAISE NOTICE 'Scheduled nightly purge of the daily working tables.';
  ELSE
    RAISE NOTICE E'pg_cron is not enabled — the daily working tables will NOT be purged automatically.\nEnable it under Database → Extensions, then run:\n  SELECT cron.schedule(''purge-daily-working-tables'', ''45 18 * * *'', ''SELECT purge_daily_working_tables()'');';
  END IF;
END $$;
