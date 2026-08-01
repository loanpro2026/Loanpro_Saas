-- ============================================================
-- Migration 010 — Idempotency for offline writes
--
-- The desktop app works with no internet. The web app cannot, and that is the
-- one genuine regression in this whole move. The mitigation is a write queue:
-- a deposit taken while the connection is down is stored on the device and
-- replayed when it comes back.
--
-- Replay is where this gets dangerous. A queued write can be sent twice —
-- the response is lost, the tab is reloaded mid-sync, two tabs are open, the
-- phone flips between wifi and mobile data. Without a guard, the shop records
-- a ₹5,000 deposit twice and their books stop matching the cash drawer.
--
-- So every queued write carries a client-generated UUID, and the database
-- refuses to act on the same one twice. The client can retry as often as it
-- likes; the effect happens exactly once.
-- ============================================================


-- ============================================================
-- 1. Idempotency keys on the tables a client can write offline
-- ============================================================
ALTER TABLE loans             ADD COLUMN IF NOT EXISTS idempotency_key UUID;
ALTER TABLE deposits          ADD COLUMN IF NOT EXISTS idempotency_key UUID;
ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS idempotency_key UUID;

-- Scoped per tenant rather than globally: keys are generated on the client, so
-- a collision across two shops is not impossible and should not be an error.
-- Partial, because rows created online have no key and NULLs would not be
-- meaningfully unique anyway.
CREATE UNIQUE INDEX IF NOT EXISTS idx_loans_idempotency
  ON loans (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_idempotency
  ON deposits (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_tx_idempotency
  ON cash_transactions (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;


-- ============================================================
-- 2. Idempotent variants of the write functions
-- ============================================================
-- Each checks for an existing row with the same key first and returns it
-- unchanged rather than raising. A replay must look like success to the
-- client, or the queue will retry forever on a write that already landed.

CREATE OR REPLACE FUNCTION create_loan_idem(p_loan JSONB, p_key UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant   UUID;
  v_existing BIGINT;
  v_id       BIGINT;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_key IS NULL THEN
    RAISE EXCEPTION 'An idempotency key is required' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_existing FROM loans
   WHERE tenant_id = v_tenant AND idempotency_key = p_key;
  IF FOUND THEN
    RETURN v_existing;             -- already applied; not an error
  END IF;

  v_id := create_loan(p_loan);
  UPDATE loans SET idempotency_key = p_key WHERE id = v_id AND tenant_id = v_tenant;
  RETURN v_id;
END $$;


CREATE OR REPLACE FUNCTION add_deposit_idem(
  p_loan_id BIGINT,
  p_amount  INTEGER,
  p_date    DATE,
  p_key     UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant   UUID;
  v_existing deposits%ROWTYPE;
  v_result   JSONB;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_key IS NULL THEN
    RAISE EXCEPTION 'An idempotency key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing FROM deposits
   WHERE tenant_id = v_tenant AND idempotency_key = p_key;
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_existing.id, 'date', v_existing.deposit_date,
                              'replayed', true);
  END IF;

  v_result := add_deposit(p_loan_id, p_amount, p_date);

  UPDATE deposits SET idempotency_key = p_key
   WHERE id = (v_result ->> 'id')::BIGINT AND tenant_id = v_tenant;

  RETURN v_result || jsonb_build_object('replayed', false);
END $$;


CREATE OR REPLACE FUNCTION record_cash_idem(
  p_type   TEXT,
  p_amount NUMERIC,
  p_reason TEXT,
  p_date   DATE,
  p_key    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant   UUID;
  v_existing cash_transactions%ROWTYPE;
  v_result   JSONB;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_key IS NULL THEN
    RAISE EXCEPTION 'An idempotency key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing FROM cash_transactions
   WHERE tenant_id = v_tenant AND idempotency_key = p_key;
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_existing.id, 'date', v_existing.transaction_date,
                              'replayed', true);
  END IF;

  v_result := record_cash_transaction(p_type, p_amount, p_reason, p_date);

  UPDATE cash_transactions SET idempotency_key = p_key
   WHERE id = (v_result ->> 'id')::BIGINT AND tenant_id = v_tenant;

  RETURN v_result || jsonb_build_object('replayed', false);
END $$;


-- Closing a loan is naturally idempotent — close_loan() raises if the loan is
-- already closed. The queue treats that specific error as success rather than
-- retrying, so no separate variant is needed.


-- ============================================================
-- 3. Offline snapshot
-- ============================================================
-- What the device caches so a shop can keep serving customers with no
-- connection. The critical counter task is: someone hands over a paper ticket,
-- the shop looks up that loan. Everything else can wait.
--
-- Deliberately capped. A device holding a shop's entire seven-year history is
-- both slow to sync and a privacy problem if the phone is lost.

CREATE OR REPLACE FUNCTION offline_snapshot(p_limit INTEGER DEFAULT 2000)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'generated_at', now(),
    'loans', COALESCE((
      SELECT jsonb_agg(row_to_json(l))
      FROM (
        SELECT id, name, father_name, location, amount, interest,
               category_type, detailed_type, weight, issue_date, status,
               (SELECT COALESCE(sum(d.amount), 0) FROM deposits d WHERE d.loan_id = loans.id) AS total_deposits
          FROM loans
         WHERE status = 'active'
         ORDER BY issue_date DESC
         LIMIT LEAST(GREATEST(p_limit, 1), 5000)
      ) l
    ), '[]'::jsonb),
    'cash_balance', COALESCE((
      SELECT left_cash FROM daily_cash_summary
       ORDER BY date DESC LIMIT 1
    ), 0)
  );
$$;


-- ============================================================
-- Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION create_loan_idem(JSONB, UUID)                        TO authenticated;
GRANT EXECUTE ON FUNCTION add_deposit_idem(BIGINT, INTEGER, DATE, UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION record_cash_idem(TEXT, NUMERIC, TEXT, DATE, UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION offline_snapshot(INTEGER)                            TO authenticated;
