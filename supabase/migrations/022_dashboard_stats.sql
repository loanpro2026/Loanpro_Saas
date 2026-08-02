-- ============================================================
-- Migration 022 — dashboard_stats gains the removal amount, and stops
-- double-counting one day
--
-- The desktop dashboard's four cards are Total Investment, Investment,
-- Removals and Interest (components/Card.tsx). Each shows an amount, a
-- trend against the preceding period, and a record count.
--
-- dashboard_stats() already returned three of the four. It had closed_COUNT
-- but no closed_AMOUNT, so the Removals card had a number of loans and no
-- money against it — which is the figure a shop actually wants: how much
-- principal came back this month.
--
-- ── The boundary bug ──────────────────────────────────────────────────────
--
-- The two windows were:
--
--     current   BETWEEN v_from      AND v_today
--     previous  BETWEEN v_prev_from AND v_from
--
-- BETWEEN is inclusive at both ends, so whatever happened on v_from itself was
-- counted in BOTH windows. On a quiet day that is invisible. On a busy one — a
-- shop that issued twenty loans exactly 30 days ago — it inflates the previous
-- period and the trend arrow points the wrong way. The previous window now
-- ends the day before.
-- ============================================================

CREATE OR REPLACE FUNCTION dashboard_stats(p_period TEXT DEFAULT 'month')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today     DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_from      DATE;
  v_prev_from DATE;
  v_prev_to   DATE;
BEGIN
  v_from := CASE p_period
    WHEN 'today'   THEN v_today
    WHEN 'week'    THEN v_today - 7
    WHEN 'quarter' THEN v_today - 90
    WHEN 'year'    THEN v_today - 365
    ELSE                v_today - 30
  END;

  -- Equal-length preceding window, ending the day before this one starts so
  -- the two never overlap.
  v_prev_to   := v_from - 1;
  v_prev_from := v_prev_to - (v_today - v_from);

  RETURN jsonb_build_object(
    'period', p_period,
    'from',   v_from,
    'to',     v_today,

    -- Money lent in the period.
    'issued_count',  (SELECT count(*)
                        FROM loans WHERE issue_date BETWEEN v_from AND v_today),
    'issued_amount', (SELECT COALESCE(sum(amount), 0)
                        FROM loans WHERE issue_date BETWEEN v_from AND v_today),

    -- Loans settled in the period, and the principal that came back with them.
    'closed_count',  (SELECT count(*)
                        FROM loans
                       WHERE status = 'closed' AND closed_date BETWEEN v_from AND v_today),
    'closed_amount', (SELECT COALESCE(sum(amount), 0)
                        FROM loans
                       WHERE status = 'closed' AND closed_date BETWEEN v_from AND v_today),

    -- Interest is the rupee amount written at closing, never a rate.
    'interest_earned', (SELECT COALESCE(sum(interest), 0)
                          FROM loans
                         WHERE status = 'closed' AND closed_date BETWEEN v_from AND v_today),
    'interest_count',  (SELECT count(*)
                          FROM loans
                         WHERE status = 'closed'
                           AND closed_date BETWEEN v_from AND v_today
                           AND COALESCE(interest, 0) > 0),

    'deposits_taken', (SELECT COALESCE(sum(amount), 0)
                         FROM deposits WHERE deposit_date BETWEEN v_from AND v_today),

    -- The preceding, non-overlapping window, for the trend arrows.
    'prev_issued_amount',   (SELECT COALESCE(sum(amount), 0)
                               FROM loans
                              WHERE issue_date BETWEEN v_prev_from AND v_prev_to),
    'prev_closed_amount',   (SELECT COALESCE(sum(amount), 0)
                               FROM loans
                              WHERE status = 'closed'
                                AND closed_date BETWEEN v_prev_from AND v_prev_to),
    'prev_interest_earned', (SELECT COALESCE(sum(interest), 0)
                               FROM loans
                              WHERE status = 'closed'
                                AND closed_date BETWEEN v_prev_from AND v_prev_to)
  );
END $$;

GRANT EXECUTE ON FUNCTION dashboard_stats(TEXT) TO authenticated;

COMMENT ON FUNCTION dashboard_stats(TEXT) IS
  'Figures behind the dashboard cards. p_period: today | week | month | '
  'quarter | year. The prev_* values cover an equal-length window ending the '
  'day before this one begins, so no day is counted twice.';
