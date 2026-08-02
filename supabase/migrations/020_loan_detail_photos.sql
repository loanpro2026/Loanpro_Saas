-- ============================================================
-- Migration 020 — loan_detail() returns both photos
--
-- Separate from 019 rather than folded into it, because 019 may already have
-- been applied. Both are re-runnable, so running them in order is safe either
-- way.
--
-- The 012 version had:
--
--     'photo', (SELECT to_jsonb(p) FROM loan_photos p WHERE p.loan_id = l.id)
--
-- With two rows per loan that subquery returns more than one row and fails at
-- runtime with "more than one row returned by a subquery used as an
-- expression" — on the loan detail page of every closed loan that has both
-- photos. It would have looked like the page was broken rather than the query.
--
-- `photo` is kept, still meaning the pledge photo, so anything not yet updated
-- keeps working. `photos` is the new shape.
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
    'archived_deposits', COALESCE((
      SELECT jsonb_agg(to_jsonb(cd) ORDER BY cd.deposit_date DESC, cd.id DESC)
        FROM closed_record_deposits cd WHERE cd.loan_id = l.id
    ), '[]'::jsonb),

    -- Retained for compatibility: the photo taken when the loan was created.
    'photo', (
      SELECT to_jsonb(p) FROM loan_photos p
       WHERE p.loan_id = l.id AND p.stage = 'pledge'
    ),

    -- Keyed by stage so the page can ask for what it wants without scanning an
    -- array: photos->'pledge', photos->'collection'. Either may be null.
    'photos', jsonb_build_object(
      'pledge', (
        SELECT to_jsonb(p) FROM loan_photos p
         WHERE p.loan_id = l.id AND p.stage = 'pledge'
      ),
      'collection', (
        SELECT to_jsonb(p) FROM loan_photos p
         WHERE p.loan_id = l.id AND p.stage = 'collection'
      )
    ),

    'total_deposits', COALESCE(
      (SELECT sum(amount) FROM deposits WHERE loan_id = l.id),
      (SELECT sum(amount) FROM closed_record_deposits WHERE loan_id = l.id),
      0),
    'days_held', (COALESCE(l.closed_date, (now() AT TIME ZONE 'Asia/Kolkata')::date) - l.issue_date),
    'suggested_interest', CASE
      WHEN l.status = 'closed' THEN COALESCE(l.interest, 0)::NUMERIC
      ELSE calculate_interest(l.amount, l.issue_date)
    END
  )
  FROM loans l
  WHERE l.id = p_loan_id;
$$;

GRANT EXECUTE ON FUNCTION loan_detail(BIGINT) TO authenticated;


-- ============================================================
-- loans_missing_photo() means "missing the PLEDGE photo"
-- ============================================================
-- Without the stage filter this would start listing every closed loan whose
-- collection photo exists but whose pledge photo does not, which is not what
-- the screen is for — it exists to chase up loans saved without a photo when
-- the shop requires one.
CREATE OR REPLACE FUNCTION loans_missing_photo()
RETURNS TABLE (
  id BIGINT, name TEXT, father_name TEXT, location TEXT,
  amount INTEGER, issue_date DATE
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT l.id, l.name, l.father_name, l.location, l.amount, l.issue_date
    FROM loans l
   WHERE l.status = 'active'
     AND l.photo_required_missing
     AND NOT EXISTS (
       SELECT 1 FROM loan_photos p
        WHERE p.loan_id = l.id AND p.stage = 'pledge'
     )
   ORDER BY l.issue_date DESC, l.id DESC;
$$;

GRANT EXECUTE ON FUNCTION loans_missing_photo() TO authenticated;


-- ============================================================
-- The "photo missing" flag is about the PLEDGE photo only
-- ============================================================
-- `loans.photo_required_missing` means "this shop requires a photo at creation
-- and none was taken". The 013 trigger cleared it on any insert into
-- loan_photos.
--
-- With stages that becomes wrong in a way nobody would notice: closing a loan
-- writes a collection photo, which would clear the flag and quietly drop that
-- loan off the "needs a photo" screen — even though the pledge photo it was
-- flagged for was never taken. The shop would believe it had caught up.
CREATE OR REPLACE FUNCTION clear_photo_missing_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.stage = 'pledge' THEN
    UPDATE loans SET photo_required_missing = false
     WHERE id = NEW.loan_id AND photo_required_missing;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_clear_photo_missing ON loan_photos;
CREATE TRIGGER trg_clear_photo_missing
  AFTER INSERT OR UPDATE ON loan_photos
  FOR EACH ROW EXECUTE FUNCTION clear_photo_missing_flag();
