-- ============================================================
-- Migration 015 — Marketing enquiries
--
-- Contact-form submissions from the public site. Deliberately not tied to a
-- tenant: whoever fills this in does not have an account yet — that is usually
-- the entire point of the message.
-- ============================================================

CREATE TABLE enquiries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  shop_name  TEXT,
  reason     TEXT NOT NULL DEFAULT 'other'
               CHECK (reason IN ('migration', 'sales', 'problem', 'billing', 'other')),
  message    TEXT NOT NULL,

  -- For rate limiting only. Not used for anything else, and worth pruning
  -- periodically since it is personal data with no lasting purpose.
  ip         TEXT,

  handled_at TIMESTAMPTZ,
  handled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes      TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_enquiries_created   ON enquiries (created_at DESC);
CREATE INDEX idx_enquiries_unhandled ON enquiries (created_at DESC) WHERE handled_at IS NULL;
CREATE INDEX idx_enquiries_ip_recent ON enquiries (ip, created_at DESC);

-- ============================================================
-- RLS
-- ============================================================
-- No policies at all: this table is written and read exclusively by the
-- service role. With RLS on and no permissive policy, `anon` and
-- `authenticated` can do nothing here — which is right, because these messages
-- contain other people's contact details and belong to you, not to any tenant.
ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON enquiries FROM anon, authenticated;
GRANT  ALL ON enquiries TO service_role;

COMMENT ON TABLE enquiries IS
  'Public contact-form submissions. Service role only — read them from the '
  'Supabase dashboard or an admin tool, never from the tenant app.';


-- ============================================================
-- Prune the IP column
-- ============================================================
-- It exists to stop someone hammering the form. Keeping it beyond that turns a
-- support inbox into an unnecessary store of personal data.
CREATE OR REPLACE FUNCTION prune_enquiry_ips()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE enquiries SET ip = NULL
   WHERE ip IS NOT NULL AND created_at < now() - INTERVAL '7 days';
$$;

DO $$
BEGIN
  PERFORM cron.schedule('prune-enquiry-ips', '30 3 * * *', 'SELECT prune_enquiry_ips()');
EXCEPTION
  WHEN undefined_schema OR undefined_function THEN
    RAISE NOTICE 'pg_cron not enabled — schedule prune_enquiry_ips() manually';
END $$;
