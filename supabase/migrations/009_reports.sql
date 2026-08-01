-- ============================================================
-- Migration 009 — Reports
--
-- Ports the seven report types from the desktop app (mainfunctions.js).
-- All are SECURITY INVOKER, so RLS scopes every one to the caller's shop.
--
-- Two domain conventions from the desktop are preserved exactly, because
-- changing them would make the web figures disagree with years of printed
-- reports the shop already has in a folder:
--
--   1. `p##m##` item codes (p22m10, P18M5…) all mean Mangal Sutra, and are
--      grouped under that name in inventory and breakdown reports.
--   2. Silver weight is shown in kilograms, gold in grams. Silver is bulky
--      and a shop holds kilos of it; grams would print as six-digit numbers.
-- ============================================================


-- ============================================================
-- Shared helper: normalise an item type
-- ============================================================
CREATE OR REPLACE FUNCTION normalize_item_type(p_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_type IS NULL OR trim(p_type) = ''       THEN 'Unknown'
    -- p<digits>m<digits> — a purity/weight shorthand the shops type in.
    WHEN p_type ~* '^p\d+m\d+$'                    THEN 'Mangal Sutra'
    ELSE p_type
  END;
$$;


-- ============================================================
-- 1. Daily report
-- ============================================================
-- The desktop recalculates before reading. Here the summary is kept current by
-- every mutation, so this only reads — but it still fills in a missing row so
-- that a quiet day reports zeros rather than "no report found".

CREATE OR REPLACE FUNCTION daily_report(p_date DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date DATE;
  v_row  daily_cash_summary%ROWTYPE;
  v_prev NUMERIC(14,2);
BEGIN
  v_date := COALESCE(p_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);

  SELECT * INTO v_row FROM daily_cash_summary
   WHERE date = v_date AND tenant_id = get_tenant_id();

  IF NOT FOUND THEN
    -- Carry the previous day's closing balance forward so a day with no
    -- activity still shows the correct cash in hand.
    SELECT COALESCE(left_cash, 0) INTO v_prev
      FROM daily_cash_summary
     WHERE tenant_id = get_tenant_id() AND date < v_date
     ORDER BY date DESC LIMIT 1;

    RETURN jsonb_build_object(
      'date', v_date, 'no_activity', true,
      'cash_balance', COALESCE(v_prev, 0), 'added_cash', 0, 'removed_cash', 0,
      'deposit_credit', 0, 'deposit_debit', 0,
      'investments', 0, 'returns', 0, 'left_cash', COALESCE(v_prev, 0)
    );
  END IF;

  RETURN jsonb_build_object(
    'date',           v_row.date,
    'no_activity',    false,
    'cash_balance',   v_row.total_cash,      -- opening balance
    'added_cash',     v_row.added_cash,
    'removed_cash',   v_row.removed_cash,
    'deposit_credit', v_row.deposit_credit,
    'deposit_debit',  v_row.deposit_debit,
    'investments',    v_row.investments,
    'returns',        v_row.returns,
    'left_cash',      v_row.left_cash
  );
END $$;


-- ============================================================
-- 2. Investment report — loans issued on a date
-- ============================================================
CREATE OR REPLACE FUNCTION investment_report(p_date DATE DEFAULT NULL)
RETURNS TABLE (
  id BIGINT, name TEXT, father_name TEXT, location TEXT,
  amount INTEGER, category_type TEXT, detailed_type TEXT, weight NUMERIC,
  issue_date DATE, status TEXT, closed_date DATE, has_photo BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT l.id, l.name, l.father_name, l.location,
         l.amount, l.category_type, l.detailed_type, l.weight,
         l.issue_date, l.status, l.closed_date,
         EXISTS (SELECT 1 FROM loan_photos p WHERE p.loan_id = l.id)
    FROM loans l
   WHERE l.issue_date = COALESCE(p_date, (now() AT TIME ZONE 'Asia/Kolkata')::date)
   ORDER BY l.status DESC, l.amount DESC;   -- active first, largest first
$$;


-- ============================================================
-- 3. Returns report — loans closed on a date
-- ============================================================
CREATE OR REPLACE FUNCTION returns_report(p_date DATE DEFAULT NULL)
RETURNS TABLE (
  id BIGINT, name TEXT, father_name TEXT, location TEXT,
  amount INTEGER, category_type TEXT, detailed_type TEXT, weight NUMERIC,
  issue_date DATE, closed_date DATE, interest INTEGER,
  total_return BIGINT, deposits_collected BIGINT, days_held INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT l.id, l.name, l.father_name, l.location,
         l.amount, l.category_type, l.detailed_type, l.weight,
         l.issue_date, l.closed_date, l.interest,
         (l.amount + COALESCE(l.interest, 0))::BIGINT,
         COALESCE((SELECT sum(cd.amount) FROM closed_record_deposits cd
                    WHERE cd.loan_id = l.id), 0)::BIGINT,
         (l.closed_date - l.issue_date)::INTEGER
    FROM loans l
   WHERE l.status = 'closed'
     AND l.closed_date = COALESCE(p_date, (now() AT TIME ZONE 'Asia/Kolkata')::date)
   ORDER BY l.amount DESC;
$$;


-- ============================================================
-- 4. Account report — date-wise totals over a range
-- ============================================================
-- p_type: 'Investment' | 'Returns' | 'Interest'
--
-- The desktop fills gaps in the range with zero rows and then filters them
-- back out, which is a no-op. We simply omit empty days — a chart reads better
-- without a row of zeros for every Sunday the shop was shut.

CREATE OR REPLACE FUNCTION account_report(
  p_type  TEXT,
  p_start DATE,
  p_end   DATE
)
RETURNS TABLE (date DATE, amount BIGINT, count BIGINT, avg_amount NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_type NOT IN ('Investment', 'Returns', 'Interest') THEN
    RAISE EXCEPTION 'Report type must be Investment, Returns or Interest'
      USING ERRCODE = '22023';
  END IF;
  IF p_start > p_end THEN
    RAISE EXCEPTION 'Start date must be before the end date' USING ERRCODE = '22023';
  END IF;

  IF p_type = 'Investment' THEN
    RETURN QUERY
      SELECT l.issue_date, sum(l.amount)::BIGINT, count(*)::BIGINT,
             round(avg(l.amount), 2)
        FROM loans l
       WHERE l.issue_date BETWEEN p_start AND p_end
       GROUP BY l.issue_date
       ORDER BY l.issue_date;

  ELSIF p_type = 'Returns' THEN
    RETURN QUERY
      SELECT l.closed_date, sum(l.amount + COALESCE(l.interest, 0))::BIGINT,
             count(*)::BIGINT, round(avg(l.amount + COALESCE(l.interest, 0)), 2)
        FROM loans l
       WHERE l.status = 'closed' AND l.closed_date BETWEEN p_start AND p_end
       GROUP BY l.closed_date
       ORDER BY l.closed_date;

  ELSE  -- Interest: the shop's actual earnings
    RETURN QUERY
      SELECT l.closed_date, sum(COALESCE(l.interest, 0))::BIGINT,
             count(*)::BIGINT, round(avg(COALESCE(l.interest, 0)), 2)
        FROM loans l
       WHERE l.status = 'closed' AND l.closed_date BETWEEN p_start AND p_end
       GROUP BY l.closed_date
      HAVING sum(COALESCE(l.interest, 0)) <> 0
       ORDER BY l.closed_date;
  END IF;
END $$;


-- ============================================================
-- 5. Location report
-- ============================================================
-- Which villages the shop's money is sitting in. Used to spot concentration —
-- too much lent into one place is a risk if that area has a bad harvest.

CREATE OR REPLACE FUNCTION location_report(
  p_locations TEXT[] DEFAULT NULL,
  p_start     DATE   DEFAULT NULL,
  p_end       DATE   DEFAULT NULL
)
RETURNS TABLE (
  location TEXT,
  loan_count BIGINT, active_count BIGINT, closed_count BIGINT,
  total_amount BIGINT, active_amount BIGINT,
  total_weight NUMERIC, avg_amount NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(NULLIF(trim(l.location), ''), 'Not recorded')::TEXT,
         count(*)::BIGINT,
         count(*) FILTER (WHERE l.status = 'active')::BIGINT,
         count(*) FILTER (WHERE l.status = 'closed')::BIGINT,
         sum(l.amount)::BIGINT,
         COALESCE(sum(l.amount) FILTER (WHERE l.status = 'active'), 0)::BIGINT,
         COALESCE(sum(l.weight), 0),
         round(avg(l.amount), 2)
    FROM loans l
   WHERE (p_start IS NULL OR l.issue_date >= p_start)
     AND (p_end   IS NULL OR l.issue_date <= p_end)
     -- NULL or empty array means every location.
     AND (p_locations IS NULL OR cardinality(p_locations) = 0
          OR l.location = ANY (p_locations))
   GROUP BY 1
   ORDER BY 6 DESC, 1;
$$;


-- ============================================================
-- 6. Inventory report — what is in the safe right now
-- ============================================================
CREATE OR REPLACE FUNCTION inventory_report()
RETURNS TABLE (
  category_type TEXT, item_type TEXT,
  item_count BIGINT, total_amount BIGINT, total_weight NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT l.category_type::TEXT,
         normalize_item_type(l.detailed_type)::TEXT,
         count(*)::BIGINT,
         sum(l.amount)::BIGINT,
         COALESCE(sum(l.weight), 0)
    FROM loans l
   WHERE l.status = 'active'
   GROUP BY 1, 2
   ORDER BY 1, 4 DESC;
$$;


-- ============================================================
-- 7. Jewellery stock — headline totals for the dashboard
-- ============================================================
-- Silver weight is returned in KILOGRAMS, gold in grams — matching the
-- desktop, which divides silver by 1000 for display.

CREATE OR REPLACE FUNCTION jewellery_stock()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'cost', jsonb_build_object(
      'gold',   COALESCE(sum(amount) FILTER (WHERE category_type = 'Gold'), 0),
      'silver', COALESCE(sum(amount) FILTER (WHERE category_type = 'Silver'), 0)
    ),
    'weight', jsonb_build_object(
      'gold',      round(COALESCE(sum(weight) FILTER (WHERE category_type = 'Gold'), 0), 3),
      'gold_unit', 'g',
      'silver',    round(COALESCE(sum(weight) FILTER (WHERE category_type = 'Silver'), 0) / 1000, 3),
      'silver_unit', 'kg'
    ),
    'count', jsonb_build_object(
      'gold',   count(*) FILTER (WHERE category_type = 'Gold'),
      'silver', count(*) FILTER (WHERE category_type = 'Silver')
    )
  )
  FROM loans WHERE status = 'active';
$$;


-- ============================================================
-- 8. Jewellery breakdown — top item types within a category
-- ============================================================
CREATE OR REPLACE FUNCTION jewellery_breakdown(
  p_category TEXT,
  p_limit    INTEGER DEFAULT 3
)
RETURNS TABLE (name TEXT, total_amount BIGINT, percentage NUMERIC)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH grouped AS (
    SELECT normalize_item_type(detailed_type)::TEXT AS name,
           sum(amount)::BIGINT AS total
      FROM loans
     WHERE status = 'active' AND category_type = p_category
     GROUP BY 1
  ), totals AS (
    SELECT COALESCE(sum(total), 0) AS grand FROM grouped
  )
  SELECT g.name, g.total,
         CASE WHEN t.grand > 0
              THEN round((g.total::NUMERIC / t.grand) * 100, 1)
              ELSE 0 END
    FROM grouped g CROSS JOIN totals t
   ORDER BY g.total DESC
   LIMIT LEAST(GREATEST(p_limit, 1), 20);
$$;


-- ============================================================
-- 9. Lending metrics — dashboard headline numbers
-- ============================================================
CREATE OR REPLACE FUNCTION lending_metrics()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today    DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_cash     NUMERIC(14,2);
  v_deposits BIGINT;
  v_trend    NUMERIC[];
  v_dep_trend NUMERIC[];
  v_cash_pct NUMERIC := 0;
  v_dep_pct  NUMERIC := 0;
BEGIN
  -- Latest known balance, not strictly today's: a shop that has not traded
  -- yet today still has cash in the drawer from yesterday.
  SELECT left_cash INTO v_cash
    FROM daily_cash_summary
   WHERE date <= v_today
   ORDER BY date DESC LIMIT 1;
  v_cash := COALESCE(v_cash, 0);

  SELECT COALESCE(sum(amount), 0)::BIGINT INTO v_deposits FROM deposits;

  SELECT array_agg(left_cash ORDER BY date),
         array_agg(deposit_credit ORDER BY date)
    INTO v_trend, v_dep_trend
    FROM (
      SELECT date, left_cash, deposit_credit
        FROM daily_cash_summary
       WHERE date BETWEEN v_today - 4 AND v_today
       ORDER BY date
    ) s;

  -- Day-on-day change. Guard the zero case: a shop that closed yesterday on
  -- zero cash would otherwise divide by zero.
  IF array_length(v_trend, 1) >= 2 THEN
    DECLARE
      y NUMERIC := v_trend[array_length(v_trend, 1) - 1];
      t NUMERIC := v_trend[array_length(v_trend, 1)];
    BEGIN
      IF abs(y) >= 0.01 THEN v_cash_pct := round(((t - y) / y) * 100, 1); END IF;
    END;
  END IF;

  IF array_length(v_dep_trend, 1) >= 2 THEN
    DECLARE
      y NUMERIC := v_dep_trend[array_length(v_dep_trend, 1) - 1];
      t NUMERIC := v_dep_trend[array_length(v_dep_trend, 1)];
    BEGIN
      IF abs(y) >= 0.01 THEN v_dep_pct := round(((t - y) / y) * 100, 1); END IF;
    END;
  END IF;

  RETURN jsonb_build_object(
    'cash_balance',        v_cash,
    'total_deposits',      v_deposits,
    'cash_change_pct',     v_cash_pct,
    'deposits_change_pct', v_dep_pct,
    'cash_trend',          COALESCE(to_jsonb(v_trend), '[]'::jsonb),
    'deposits_trend',      COALESCE(to_jsonb(v_dep_trend), '[]'::jsonb),
    'active_loans',        (SELECT count(*) FROM loans WHERE status = 'active'),
    'active_principal',    (SELECT COALESCE(sum(amount), 0) FROM loans WHERE status = 'active')
  );
END $$;


-- ============================================================
-- 10. Dashboard stats over a period
-- ============================================================
-- p_period: 'week' | 'month' | 'quarter' | 'year'

CREATE OR REPLACE FUNCTION dashboard_stats(p_period TEXT DEFAULT 'month')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_from  DATE;
  v_prev_from DATE;
BEGIN
  v_from := CASE p_period
    WHEN 'week'    THEN v_today - 7
    WHEN 'quarter' THEN v_today - 90
    WHEN 'year'    THEN v_today - 365
    ELSE                v_today - 30
  END;
  -- Equal-length preceding window, so the comparison is like for like.
  v_prev_from := v_from - (v_today - v_from);

  RETURN jsonb_build_object(
    'period', p_period,
    'from', v_from,
    'to', v_today,
    'issued_count',   (SELECT count(*) FROM loans WHERE issue_date BETWEEN v_from AND v_today),
    'issued_amount',  (SELECT COALESCE(sum(amount), 0) FROM loans WHERE issue_date BETWEEN v_from AND v_today),
    'closed_count',   (SELECT count(*) FROM loans WHERE status = 'closed' AND closed_date BETWEEN v_from AND v_today),
    'interest_earned',(SELECT COALESCE(sum(interest), 0) FROM loans WHERE status = 'closed' AND closed_date BETWEEN v_from AND v_today),
    'deposits_taken', (SELECT COALESCE(sum(amount), 0) FROM deposits WHERE deposit_date BETWEEN v_from AND v_today),
    'prev_issued_amount', (SELECT COALESCE(sum(amount), 0) FROM loans WHERE issue_date BETWEEN v_prev_from AND v_from),
    'prev_interest_earned', (SELECT COALESCE(sum(interest), 0) FROM loans WHERE status = 'closed' AND closed_date BETWEEN v_prev_from AND v_from)
  );
END $$;


-- ============================================================
-- 11. Chart data — issued vs returned over the last 12 months
-- ============================================================
CREATE OR REPLACE FUNCTION chart_data(p_months INTEGER DEFAULT 12)
RETURNS TABLE (month DATE, invested BIGINT, returned BIGINT, interest BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  -- generate_series so months with no trade still appear; a gap in a line
  -- chart reads as missing data rather than a quiet month.
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')::date)
        - ((LEAST(GREATEST(p_months, 1), 36) - 1) || ' months')::interval,
      date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')::date),
      '1 month'
    )::date AS m
  )
  SELECT mo.m,
         COALESCE((SELECT sum(amount) FROM loans
                    WHERE date_trunc('month', issue_date)::date = mo.m), 0)::BIGINT,
         COALESCE((SELECT sum(amount + COALESCE(interest, 0)) FROM loans
                    WHERE status = 'closed'
                      AND date_trunc('month', closed_date)::date = mo.m), 0)::BIGINT,
         COALESCE((SELECT sum(COALESCE(interest, 0)) FROM loans
                    WHERE status = 'closed'
                      AND date_trunc('month', closed_date)::date = mo.m), 0)::BIGINT
    FROM months mo
   ORDER BY mo.m;
$$;


-- ============================================================
-- Supporting indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_loans_closed_date
  ON loans (tenant_id, closed_date) WHERE status = 'closed';
CREATE INDEX IF NOT EXISTS idx_loans_category_status
  ON loans (tenant_id, category_type, status);
CREATE INDEX IF NOT EXISTS idx_loans_location
  ON loans (tenant_id, location);
CREATE INDEX IF NOT EXISTS idx_deposits_date
  ON deposits (tenant_id, deposit_date);


-- ============================================================
-- Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION normalize_item_type(TEXT)                 TO authenticated;
GRANT EXECUTE ON FUNCTION daily_report(DATE)                        TO authenticated;
GRANT EXECUTE ON FUNCTION investment_report(DATE)                   TO authenticated;
GRANT EXECUTE ON FUNCTION returns_report(DATE)                      TO authenticated;
GRANT EXECUTE ON FUNCTION account_report(TEXT, DATE, DATE)          TO authenticated;
GRANT EXECUTE ON FUNCTION location_report(TEXT[], DATE, DATE)       TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_report()                        TO authenticated;
GRANT EXECUTE ON FUNCTION jewellery_stock()                         TO authenticated;
GRANT EXECUTE ON FUNCTION jewellery_breakdown(TEXT, INTEGER)        TO authenticated;
GRANT EXECUTE ON FUNCTION lending_metrics()                         TO authenticated;
GRANT EXECUTE ON FUNCTION dashboard_stats(TEXT)                     TO authenticated;
GRANT EXECUTE ON FUNCTION chart_data(INTEGER)                       TO authenticated;
