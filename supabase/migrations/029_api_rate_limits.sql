-- ============================================================
-- Migration 029 — distributed API abuse protection
-- ============================================================

CREATE TABLE IF NOT EXISTS api_rate_limits (
  scope TEXT NOT NULL,
  identity_hash TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY (scope, identity_hash)
);

ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE api_rate_limits TO service_role;

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_expiry
  ON api_rate_limits (window_started_at);

CREATE OR REPLACE FUNCTION consume_api_rate_limit(
  p_scope TEXT,
  p_identity_hash TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, retry_after INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_started TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF p_scope IS NULL OR p_identity_hash IS NULL OR p_limit IS NULL OR p_window_seconds IS NULL
     OR length(trim(p_scope)) NOT BETWEEN 1 AND 100
     OR p_identity_hash !~ '^[0-9a-f]{64}$'
     OR p_limit NOT BETWEEN 1 AND 10000
     OR p_window_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'invalid rate-limit parameters' USING ERRCODE = '22023';
  END IF;

  -- Serialise the first insert for the same key; ON CONFLICT then locks all
  -- subsequent updates. The count is capped to prevent unbounded increments.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_identity_hash, 0));

  INSERT INTO api_rate_limits AS limits (
    scope, identity_hash, window_started_at, request_count
  ) VALUES (
    p_scope, p_identity_hash, v_now, 1
  )
  ON CONFLICT (scope, identity_hash) DO UPDATE SET
    window_started_at = CASE
      WHEN limits.window_started_at <= v_now - make_interval(secs => p_window_seconds)
        THEN v_now
      ELSE limits.window_started_at
    END,
    request_count = CASE
      WHEN limits.window_started_at <= v_now - make_interval(secs => p_window_seconds)
        THEN 1
      ELSE least(limits.request_count + 1, p_limit + 1)
    END
  RETURNING limits.window_started_at, limits.request_count
    INTO v_started, v_count;

  allowed := v_count <= p_limit;
  remaining := greatest(0, p_limit - v_count);
  retry_after := CASE WHEN allowed THEN 0 ELSE greatest(
    1,
    ceil(extract(epoch FROM (v_started + make_interval(secs => p_window_seconds) - v_now)))::INTEGER
  ) END;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION consume_api_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_api_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION prune_api_rate_limits()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  deleted_count BIGINT;
BEGIN
  DELETE FROM api_rate_limits
   WHERE window_started_at < now() - INTERVAL '2 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION prune_api_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION prune_api_rate_limits() TO service_role;
