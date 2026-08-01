-- ============================================================
-- Migration 006 — helpers used by scripts/migrate-tenant.ts
-- ============================================================

-- ============================================================
-- reset_sequences_for_tenant
-- ============================================================
-- The migration preserves original primary keys (a shop's loan numbers are
-- written on the paper tickets tied to the gold in their safe, so renumbering
-- them is not an option). Inserting explicit ids does not advance the
-- underlying BIGSERIAL sequence, so without this the next INSERT tries id 1
-- and fails on a duplicate key — on the shop's first day using the web app,
-- on their first new loan.
--
-- Sequences are global rather than per-tenant, so this sets each one past the
-- maximum id across ALL tenants, not just the one being migrated.

CREATE OR REPLACE FUNCTION reset_sequences_for_tenant(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB := '{}'::jsonb;
  v_table  TEXT;
  v_seq    TEXT;
  v_max    BIGINT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'loans', 'deposits', 'closed_record_deposits', 'activity_log',
    'cash_transactions', 'removed_records_with_deposits', 'daily_deposit_records'
  ] LOOP
    v_seq := pg_get_serial_sequence('public.' || v_table, 'id');
    CONTINUE WHEN v_seq IS NULL;

    EXECUTE format('SELECT COALESCE(MAX(id), 0) FROM %I', v_table) INTO v_max;

    -- is_called = true means the NEXT value is v_max + 1.
    -- Guard the zero case: setval(seq, 0) is invalid for a sequence starting
    -- at 1, so use 1 with is_called = false instead.
    IF v_max > 0 THEN
      PERFORM setval(v_seq, v_max, true);
    ELSE
      PERFORM setval(v_seq, 1, false);
    END IF;

    v_result := v_result || jsonb_build_object(v_table, v_max);
  END LOOP;

  RETURN v_result;
END $$;

-- Migration tooling only — never called by a client.
-- The GRANT to service_role must be explicit: revoking from PUBLIC removes the
-- implicit grant that service_role would otherwise have inherited, and the
-- CLI would then fail with "permission denied for function" partway through a
-- migration, after the rows are already inserted.
REVOKE EXECUTE ON FUNCTION reset_sequences_for_tenant(UUID) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION reset_sequences_for_tenant(UUID) TO service_role;


-- ============================================================
-- tenant_totals — used by scripts/reconcile.ts
-- ============================================================
-- Returns the same figures the reconcile script pulls from MySQL, so a shop
-- owner can compare the two side by side and satisfy themselves that nothing
-- was lost. Seeing their own totals match is what makes someone comfortable
-- switching; no amount of reassurance substitutes for it.

CREATE OR REPLACE FUNCTION tenant_totals(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'loans_active',        (SELECT count(*)            FROM loans WHERE tenant_id = p_tenant_id AND status = 'active'),
    'loans_closed',        (SELECT count(*)            FROM loans WHERE tenant_id = p_tenant_id AND status = 'closed'),
    'amount_active',       (SELECT COALESCE(sum(amount), 0) FROM loans WHERE tenant_id = p_tenant_id AND status = 'active'),
    'weight_active',       (SELECT COALESCE(sum(weight), 0) FROM loans WHERE tenant_id = p_tenant_id AND status = 'active'),
    'deposits_count',      (SELECT count(*)            FROM deposits WHERE tenant_id = p_tenant_id),
    'deposits_total',      (SELECT COALESCE(sum(amount), 0) FROM deposits WHERE tenant_id = p_tenant_id),
    'closed_deposits',     (SELECT count(*)            FROM closed_record_deposits WHERE tenant_id = p_tenant_id),
    'cash_tx_count',       (SELECT count(*)            FROM cash_transactions WHERE tenant_id = p_tenant_id),
    'cash_added',          (SELECT COALESCE(sum(amount), 0) FROM cash_transactions WHERE tenant_id = p_tenant_id AND type = 'add'),
    'cash_removed',        (SELECT COALESCE(sum(amount), 0) FROM cash_transactions WHERE tenant_id = p_tenant_id AND type = 'remove'),
    'activity_count',      (SELECT count(*)            FROM activity_log WHERE tenant_id = p_tenant_id),
    'photos_count',        (SELECT count(*)            FROM loan_photos WHERE tenant_id = p_tenant_id),
    'oldest_issue_date',   (SELECT min(issue_date)::text FROM loans WHERE tenant_id = p_tenant_id),
    'newest_issue_date',   (SELECT max(issue_date)::text FROM loans WHERE tenant_id = p_tenant_id),
    'min_loan_id',         (SELECT min(id)             FROM loans WHERE tenant_id = p_tenant_id),
    'max_loan_id',         (SELECT max(id)             FROM loans WHERE tenant_id = p_tenant_id)
  );
$$;

REVOKE EXECUTE ON FUNCTION tenant_totals(UUID) FROM public, anon;
GRANT  EXECUTE ON FUNCTION tenant_totals(UUID) TO authenticated, service_role;
