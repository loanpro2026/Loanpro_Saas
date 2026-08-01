-- ============================================================
-- LoanPro SaaS — Initial Schema
-- Supabase (PostgreSQL) with Row Level Security
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. TENANTS (one row per shop)
-- ============================================================
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name     TEXT NOT NULL,
  owner_id      UUID NOT NULL,          -- references auth.users(id)
  plan          TEXT NOT NULL DEFAULT 'trial',  -- trial | basic | pro
  plan_status   TEXT NOT NULL DEFAULT 'active', -- active | expired | cancelled
  trial_ends_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. SUBSCRIPTIONS
-- ============================================================
CREATE TABLE subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  razorpay_order_id     TEXT,
  razorpay_payment_id   TEXT,
  razorpay_subscription_id TEXT,
  plan                  TEXT NOT NULL,
  amount                INTEGER NOT NULL,         -- in paise (INR)
  currency              TEXT NOT NULL DEFAULT 'INR',
  status                TEXT NOT NULL DEFAULT 'pending', -- pending | active | expired | cancelled | failed
  starts_at             TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. USERS / STAFF
-- ============================================================
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     UUID NOT NULL UNIQUE,              -- references auth.users(id)
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'owner',     -- owner | staff
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. LOANS  (flat schema — mirrors MySQL exactly, with shop_id)
-- Fingerprint columns removed. Face verification kept.
-- ============================================================
CREATE TABLE loans (
  id                    BIGSERIAL PRIMARY KEY,
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Customer info (embedded, no separate customer table)
  name                  TEXT NOT NULL,
  father_name           TEXT,
  location              TEXT,
  address               TEXT,
  additional_information TEXT,

  -- Collateral
  category_type         TEXT NOT NULL CHECK (category_type IN ('Gold', 'Silver')),
  detailed_type         TEXT,
  weight                NUMERIC(10, 3),

  -- Financial
  amount                INTEGER NOT NULL,
  interest              INTEGER,

  -- Verification
  face_verified_by      TEXT,
  face_verification_log JSONB,

  -- Status & dates
  remarks               TEXT,
  issue_date            DATE NOT NULL,
  active_timestamp      TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  closed_date           DATE,
  closed_timestamp      TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. LOAN PHOTOS  (replaces loan_identity_images LONGBLOB)
-- Photos stored in Supabase Storage, URL saved here
-- ============================================================
CREATE TABLE loan_photos (
  loan_id       BIGINT PRIMARY KEY REFERENCES loans(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  photo_url     TEXT NOT NULL,           -- Supabase Storage public/signed URL
  storage_path  TEXT NOT NULL,           -- bucket path for deletion
  captured_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. DEPOSITS  (payments/repayments on a loan)
-- ============================================================
CREATE TABLE deposits (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  loan_id      BIGINT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  amount       INTEGER NOT NULL,
  deposit_date DATE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. DAILY CASH SUMMARY
-- ============================================================
CREATE TABLE daily_cash_summary (
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  investments     NUMERIC(14, 2) DEFAULT 0,
  returns         NUMERIC(14, 2) DEFAULT 0,
  total_cash      NUMERIC(14, 2) DEFAULT 0,
  added_cash      NUMERIC(14, 2) DEFAULT 0,
  removed_cash    NUMERIC(14, 2) DEFAULT 0,
  deposit_credit  NUMERIC(14, 2) DEFAULT 0,
  deposit_debit   NUMERIC(14, 2) DEFAULT 0,
  left_cash       NUMERIC(14, 2) DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, date)
);

-- ============================================================
-- 8. CASH TRANSACTIONS
-- ============================================================
CREATE TABLE cash_transactions (
  id               BIGSERIAL PRIMARY KEY,
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('add', 'remove')),
  amount           NUMERIC(10, 2) NOT NULL,
  reason           TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 9. ACTIVITY LOG
-- ============================================================
CREATE TABLE activity_log (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  description TEXT NOT NULL,
  amount      NUMERIC(12, 2),
  color       TEXT,
  icon        TEXT,
  time        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 10. CAMERA SESSIONS  (for QR-based mobile camera flow)
-- Short-lived sessions: desktop creates, mobile uses, auto-expires
-- ============================================================
CREATE TABLE camera_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  loan_id     BIGINT REFERENCES loans(id) ON DELETE CASCADE,
  session_key TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'captured', 'expired')),
  photo_url   TEXT,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_loans_tenant_id          ON loans(tenant_id);
CREATE INDEX idx_loans_status             ON loans(tenant_id, status);
CREATE INDEX idx_loans_issue_date         ON loans(tenant_id, issue_date DESC);
CREATE INDEX idx_loans_name               ON loans(tenant_id, name);
CREATE INDEX idx_deposits_loan_id         ON deposits(loan_id);
CREATE INDEX idx_deposits_tenant_date     ON deposits(tenant_id, deposit_date DESC);
CREATE INDEX idx_cash_tx_tenant_date      ON cash_transactions(tenant_id, transaction_date DESC);
CREATE INDEX idx_activity_log_tenant_time ON activity_log(tenant_id, time DESC);
CREATE INDEX idx_camera_sessions_key      ON camera_sessions(session_key);
CREATE INDEX idx_subscriptions_tenant     ON subscriptions(tenant_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- Every table is isolated by tenant_id.
-- Users can only see rows belonging to their own tenant.
-- ============================================================

ALTER TABLE tenants           ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans             ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_photos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_cash_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE camera_sessions   ENABLE ROW LEVEL SECURITY;

-- Helper function: get tenant_id for the current authenticated user
CREATE OR REPLACE FUNCTION get_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT tenant_id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- tenants: owner can read/update their own tenant
CREATE POLICY "tenants_select" ON tenants
  FOR SELECT USING (id = get_tenant_id());
CREATE POLICY "tenants_update" ON tenants
  FOR UPDATE USING (id = get_tenant_id());

-- subscriptions
CREATE POLICY "subscriptions_select" ON subscriptions
  FOR SELECT USING (tenant_id = get_tenant_id());
CREATE POLICY "subscriptions_insert" ON subscriptions
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

-- users
CREATE POLICY "users_select" ON users
  FOR SELECT USING (tenant_id = get_tenant_id());
CREATE POLICY "users_update" ON users
  FOR UPDATE USING (tenant_id = get_tenant_id() AND auth_id = auth.uid());

-- loans
CREATE POLICY "loans_select" ON loans
  FOR SELECT USING (tenant_id = get_tenant_id());
CREATE POLICY "loans_insert" ON loans
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "loans_update" ON loans
  FOR UPDATE USING (tenant_id = get_tenant_id());
CREATE POLICY "loans_delete" ON loans
  FOR DELETE USING (tenant_id = get_tenant_id());

-- loan_photos
CREATE POLICY "loan_photos_select" ON loan_photos
  FOR SELECT USING (tenant_id = get_tenant_id());
CREATE POLICY "loan_photos_insert" ON loan_photos
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "loan_photos_update" ON loan_photos
  FOR UPDATE USING (tenant_id = get_tenant_id());
CREATE POLICY "loan_photos_delete" ON loan_photos
  FOR DELETE USING (tenant_id = get_tenant_id());

-- deposits
CREATE POLICY "deposits_select" ON deposits
  FOR SELECT USING (tenant_id = get_tenant_id());
CREATE POLICY "deposits_insert" ON deposits
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "deposits_update" ON deposits
  FOR UPDATE USING (tenant_id = get_tenant_id());
CREATE POLICY "deposits_delete" ON deposits
  FOR DELETE USING (tenant_id = get_tenant_id());

-- daily_cash_summary
CREATE POLICY "cash_summary_all" ON daily_cash_summary
  FOR ALL USING (tenant_id = get_tenant_id());

-- cash_transactions
CREATE POLICY "cash_tx_all" ON cash_transactions
  FOR ALL USING (tenant_id = get_tenant_id());

-- activity_log
CREATE POLICY "activity_log_all" ON activity_log
  FOR ALL USING (tenant_id = get_tenant_id());

-- camera_sessions: allow public read by session_key (unauthenticated mobile camera)
CREATE POLICY "camera_select_by_key" ON camera_sessions
  FOR SELECT USING (true);  -- anyone with session_key can read (key is secret)
CREATE POLICY "camera_insert" ON camera_sessions
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "camera_update_by_key" ON camera_sessions
  FOR UPDATE USING (true);  -- mobile updates via key, validated in API

-- ============================================================
-- TRIGGERS — auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_tenants
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_subscriptions
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_users
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_loans
  BEFORE UPDATE ON loans
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_loan_photos
  BEFORE UPDATE ON loan_photos
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_cash_summary
  BEFORE UPDATE ON daily_cash_summary
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
