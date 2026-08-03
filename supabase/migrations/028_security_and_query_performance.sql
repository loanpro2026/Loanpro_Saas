-- ============================================================
-- Migration 028 — financial write boundary and large-book indexes
-- ============================================================

-- The application mutates these tables only through transaction-safe RPCs.
-- A modified browser client must not bypass their cash recalculation, archive
-- and activity-log work by writing to a base table directly.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE deposits FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE daily_cash_summary FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE cash_transactions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE activity_log FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE closed_record_deposits FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE removed_records_with_deposits FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE daily_deposit_records FROM anon, authenticated;

GRANT SELECT ON TABLE deposits TO authenticated;
GRANT SELECT ON TABLE daily_cash_summary TO authenticated;
GRANT SELECT ON TABLE cash_transactions TO authenticated;
GRANT SELECT ON TABLE activity_log TO authenticated;
GRANT SELECT ON TABLE closed_record_deposits TO authenticated;
GRANT SELECT ON TABLE removed_records_with_deposits TO authenticated;
GRANT SELECT ON TABLE daily_deposit_records TO authenticated;

-- PostgreSQL gives PUBLIC execute permission to newly created functions unless
-- it is revoked. Remove that implicit permission from every privileged
-- function. Existing explicit authenticated grants remain in place.
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name,
           p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS identity_arguments
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
      fn.schema_name, fn.function_name, fn.identity_arguments
    );
  END LOOP;
END $$;

-- Migration reconciliation accepts an arbitrary tenant id and is therefore
-- service-role only. It previously exposed cross-tenant totals to any signed-
-- in caller.
REVOKE EXECUTE ON FUNCTION tenant_totals(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION tenant_totals(UUID) TO service_role;

-- Cron owns these calls; service_role is retained for a deliberate manual run.
REVOKE EXECUTE ON FUNCTION purge_daily_working_tables() FROM authenticated;
REVOKE EXECUTE ON FUNCTION prune_enquiry_ips() FROM authenticated;
GRANT EXECUTE ON FUNCTION purge_daily_working_tables() TO service_role;
GRANT EXECUTE ON FUNCTION prune_enquiry_ips() TO service_role;

-- Match the actual list shapes: tenant + status/category, then stable date/id
-- ordering. These allow PostgreSQL to return a 50-row page without sorting or
-- walking thousands of unrelated records.
CREATE INDEX IF NOT EXISTS idx_loans_active_page
  ON loans (tenant_id, issue_date DESC, id DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_loans_closed_page
  ON loans (tenant_id, closed_date DESC, id DESC)
  WHERE status = 'closed';

CREATE INDEX IF NOT EXISTS idx_loans_active_category_page
  ON loans (tenant_id, category_type, issue_date DESC, id DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_loans_closed_category_page
  ON loans (tenant_id, category_type, closed_date DESC, id DESC)
  WHERE status = 'closed';

CREATE INDEX IF NOT EXISTS idx_closed_deposits_tenant_loan_date
  ON closed_record_deposits (tenant_id, loan_id, deposit_date);

