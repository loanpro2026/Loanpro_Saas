-- Migration 002: Paired Devices
-- Stores FCM tokens (Android) and Web Push subscriptions (iOS PWA)
-- per tenant/user so desktop can push camera requests to phone.

CREATE TABLE IF NOT EXISTS paired_devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  device_name   TEXT NOT NULL DEFAULT 'My Phone',
  device_type   TEXT NOT NULL CHECK (device_type IN ('android', 'ios', 'pwa')),

  -- Android: FCM registration token
  fcm_token     TEXT,

  -- iOS / PWA Web Push subscription (stored as JSON)
  -- Shape: { endpoint, keys: { p256dh, auth } }
  push_subscription JSONB,

  -- Local IP for same-network relay (optional optimisation)
  local_ip      TEXT,
  local_port    INTEGER,

  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One active device per user per type (upsert-friendly)
  UNIQUE (user_id, device_type)
);

-- Index for fast tenant-level lookup
CREATE INDEX IF NOT EXISTS paired_devices_tenant_idx ON paired_devices (tenant_id);

-- Enable RLS
ALTER TABLE paired_devices ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read/write their own tenant's devices
CREATE POLICY "tenant_devices_select" ON paired_devices
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY "tenant_devices_insert" ON paired_devices
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY "tenant_devices_update" ON paired_devices
  FOR UPDATE USING (tenant_id = get_tenant_id());

CREATE POLICY "tenant_devices_delete" ON paired_devices
  FOR DELETE USING (tenant_id = get_tenant_id());
