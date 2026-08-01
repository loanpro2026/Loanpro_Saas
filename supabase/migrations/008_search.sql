-- ============================================================
-- Migration 008 — Search, autosuggest, and loan detail
--
-- Ports three desktop behaviours:
--   globalSearchRecords()   — one box, searches everything
--   getFieldSuggestions()   — autocomplete on name / father / location
--   getAllLocations()
--
-- Shops re-lend to the same families for years. Typing "Ramesh" and getting
-- his three previous loans is the single most-used action in the desktop app,
-- so it needs to be fast and forgiving of spelling.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram indexes make ILIKE '%term%' fast. Without them every search is a
-- sequential scan — fine at 500 loans, not at 50,000.
CREATE INDEX IF NOT EXISTS idx_loans_name_trgm
  ON loans USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_loans_father_trgm
  ON loans USING gin (father_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_loans_location_trgm
  ON loans USING gin (location gin_trgm_ops);


-- ============================================================
-- search_loans — the single search box
-- ============================================================
-- Accepts a loan number, a name, a father's name, a location, or a phrase.
-- Results are ranked so an exact loan-number match always wins: when a shop
-- types "4471" they are holding ticket 4471 and want that record, not every
-- loan of ₹4,471.

CREATE OR REPLACE FUNCTION search_loans(
  p_query  TEXT,
  p_status TEXT DEFAULT NULL,
  p_limit  INTEGER DEFAULT 25
)
RETURNS TABLE (
  id BIGINT, name TEXT, father_name TEXT, location TEXT,
  amount INTEGER, category_type TEXT, detailed_type TEXT, weight NUMERIC,
  issue_date DATE, status TEXT, closed_date DATE,
  total_deposits BIGINT, has_photo BOOLEAN, rank REAL
)
LANGUAGE sql
STABLE
SECURITY INVOKER          -- RLS applies; a user only ever searches their own shop
SET search_path = public, pg_temp
AS $$
  WITH q AS (
    SELECT
      trim(p_query)                                    AS raw,
      '%' || trim(p_query) || '%'                      AS like_pattern,
      CASE WHEN trim(p_query) ~ '^\d+$'
           THEN trim(p_query)::BIGINT END              AS as_number
  )
  SELECT
    l.id, l.name, l.father_name, l.location,
    l.amount, l.category_type, l.detailed_type, l.weight,
    l.issue_date, l.status, l.closed_date,
    COALESCE((SELECT sum(d.amount) FROM deposits d WHERE d.loan_id = l.id), 0)::BIGINT,
    EXISTS (SELECT 1 FROM loan_photos p WHERE p.loan_id = l.id),
    (CASE WHEN l.id = q.as_number                       THEN 100.0
          WHEN lower(l.name) = lower(q.raw)             THEN  90.0
          WHEN l.name ILIKE q.raw || '%'                THEN  70.0
          ELSE GREATEST(
                 similarity(l.name, q.raw) * 50,
                 similarity(COALESCE(l.father_name, ''), q.raw) * 35,
                 similarity(COALESCE(l.location, ''),    q.raw) * 25
               )
     END)::REAL AS rank
  FROM loans l, q
  WHERE (p_status IS NULL OR p_status = 'all' OR l.status = p_status)
    AND (
      l.id = q.as_number
      OR l.name        ILIKE q.like_pattern
      OR l.father_name ILIKE q.like_pattern
      OR l.location    ILIKE q.like_pattern
      OR l.detailed_type ILIKE q.like_pattern
    )
  ORDER BY rank DESC, l.issue_date DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

GRANT EXECUTE ON FUNCTION search_loans(TEXT, TEXT, INTEGER) TO authenticated;


-- ============================================================
-- field_suggestions — autocomplete while adding a loan
-- ============================================================
-- Ordered by frequency, not alphabetically: the locations a shop lends to most
-- should surface first. Prevents "Sadar Bazaar" / "sadar bazar" / "Sadar
-- Bazzar" drifting apart across years of typing, which is what makes location
-- reports useless.

CREATE OR REPLACE FUNCTION field_suggestions(
  p_field  TEXT,
  p_prefix TEXT DEFAULT '',
  p_limit  INTEGER DEFAULT 8
)
RETURNS TABLE (value TEXT, uses BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Whitelist the column: this is interpolated into dynamic SQL.
  IF p_field NOT IN ('name', 'father_name', 'location', 'detailed_type') THEN
    RAISE EXCEPTION 'Unsupported field: %', p_field USING ERRCODE = '22023';
  END IF;

  RETURN QUERY EXECUTE format($f$
    SELECT %I::TEXT AS value, count(*)::BIGINT AS uses
      FROM loans
     WHERE %I IS NOT NULL AND %I <> ''
       AND ($1 = '' OR %I ILIKE $1 || '%%')
     GROUP BY %I
     ORDER BY uses DESC, value ASC
     LIMIT $2
  $f$, p_field, p_field, p_field, p_field, p_field)
  USING COALESCE(trim(p_prefix), ''), LEAST(GREATEST(p_limit, 1), 50);
END $$;

GRANT EXECUTE ON FUNCTION field_suggestions(TEXT, TEXT, INTEGER) TO authenticated;


-- ============================================================
-- loan_detail — everything the detail page needs, in one round trip
-- ============================================================
CREATE OR REPLACE FUNCTION loan_detail(p_loan_id BIGINT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'loan', to_jsonb(l),
    'deposits', COALESCE((
      SELECT jsonb_agg(to_jsonb(d) ORDER BY d.deposit_date DESC, d.id DESC)
        FROM deposits d WHERE d.loan_id = l.id
    ), '[]'::jsonb),
    -- A closed loan's deposits live in the archive, so the detail page shows
    -- the same history before and after closing.
    'archived_deposits', COALESCE((
      SELECT jsonb_agg(to_jsonb(cd) ORDER BY cd.deposit_date DESC, cd.id DESC)
        FROM closed_record_deposits cd WHERE cd.loan_id = l.id
    ), '[]'::jsonb),
    'photo', (SELECT to_jsonb(p) FROM loan_photos p WHERE p.loan_id = l.id),
    'total_deposits', COALESCE(
      (SELECT sum(amount) FROM deposits WHERE loan_id = l.id),
      (SELECT sum(amount) FROM closed_record_deposits WHERE loan_id = l.id),
      0),
    'days_held', (COALESCE(l.closed_date, (now() AT TIME ZONE 'Asia/Kolkata')::date) - l.issue_date)
  )
  FROM loans l
  WHERE l.id = p_loan_id;
$$;

GRANT EXECUTE ON FUNCTION loan_detail(BIGINT) TO authenticated;


-- ============================================================
-- distinct_locations — for the location report filter
-- ============================================================
CREATE OR REPLACE FUNCTION distinct_locations()
RETURNS TABLE (location TEXT, loan_count BIGINT, active_amount BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT l.location::TEXT,
         count(*)::BIGINT,
         COALESCE(sum(l.amount) FILTER (WHERE l.status = 'active'), 0)::BIGINT
    FROM loans l
   WHERE l.location IS NOT NULL AND l.location <> ''
   GROUP BY l.location
   ORDER BY 3 DESC, 1 ASC;
$$;

GRANT EXECUTE ON FUNCTION distinct_locations() TO authenticated;
