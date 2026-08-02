-- ============================================================
-- Migration 016 — Editing closed records, and support tickets
--
-- The last two parity gaps found by auditing all 167 desktop IPC endpoints
-- against the web implementation.
-- ============================================================


-- ============================================================
-- 1. update_closed_record
-- ============================================================
-- Ports the desktop's updateClosedRecord (mainfunctions.js:3171).
--
-- A shop needs to fix a typo on a settled loan — a misspelled name, the wrong
-- weight, an interest figure entered as 8000 instead of 800. The web app was
-- redirecting closed loans away from the edit page entirely, which meant the
-- only remedy was reopening the loan (rewriting cash history) or editing the
-- database by hand.
--
-- Unlike editing an active loan, this can change `interest`, `closed_date` and
-- `amount` — all of which feed historical reports. So it re-chains the cash
-- summary from the earliest affected date, and it keeps the day's working
-- snapshot in step, exactly as the desktop does.

CREATE OR REPLACE FUNCTION update_closed_record(
  p_loan_id BIGINT,
  p_patch   JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant   UUID;
  v_old      loans%ROWTYPE;
  v_from     DATE;
  v_new_issue  DATE;
  v_new_closed DATE;
  v_new_amount INTEGER;
  v_new_interest INTEGER;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_old FROM loans
   WHERE id = p_loan_id AND tenant_id = v_tenant AND status = 'closed'
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Closed record not found' USING ERRCODE = 'P0002';
  END IF;

  -- Anything not supplied keeps its current value, so a partial patch is safe.
  v_new_issue    := COALESCE((p_patch ->> 'issue_date')::DATE,  v_old.issue_date);
  v_new_closed   := COALESCE((p_patch ->> 'closed_date')::DATE, v_old.closed_date);
  v_new_amount   := COALESCE((p_patch ->> 'amount')::INTEGER,   v_old.amount);
  v_new_interest := COALESCE((p_patch ->> 'interest')::INTEGER, v_old.interest);

  IF v_new_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF v_new_interest < 0 THEN
    RAISE EXCEPTION 'Interest cannot be negative' USING ERRCODE = '22023';
  END IF;
  IF v_new_closed < v_new_issue THEN
    RAISE EXCEPTION 'Closing date cannot be before the issue date' USING ERRCODE = '22023';
  END IF;

  UPDATE loans SET
    name                   = COALESCE(NULLIF(trim(p_patch ->> 'name'), ''), name),
    father_name            = COALESCE(NULLIF(trim(p_patch ->> 'father_name'), ''), father_name),
    location               = COALESCE(NULLIF(trim(p_patch ->> 'location'), ''), location),
    address                = COALESCE(NULLIF(trim(p_patch ->> 'address'), ''), address),
    additional_information = COALESCE(NULLIF(trim(p_patch ->> 'additional_information'), ''), additional_information),
    detailed_type          = COALESCE(NULLIF(trim(p_patch ->> 'detailed_type'), ''), detailed_type),
    weight                 = COALESCE((p_patch ->> 'weight')::NUMERIC, weight),
    amount                 = v_new_amount,
    interest               = v_new_interest,
    issue_date             = v_new_issue,
    closed_date            = v_new_closed
  WHERE id = p_loan_id AND tenant_id = v_tenant;

  -- Keep the end-of-day snapshot honest, as the desktop does.
  UPDATE removed_records_with_deposits SET
    name        = (SELECT name FROM loans WHERE id = p_loan_id),
    father_name = (SELECT father_name FROM loans WHERE id = p_loan_id),
    location    = (SELECT location FROM loans WHERE id = p_loan_id),
    address     = (SELECT address FROM loans WHERE id = p_loan_id),
    amount      = v_new_amount,
    weight      = (SELECT weight FROM loans WHERE id = p_loan_id),
    issue_date  = v_new_issue,
    closed_date = v_new_closed
  WHERE tenant_id = v_tenant AND loan_id = p_loan_id;

  INSERT INTO activity_log (tenant_id, type, description, color, icon)
  VALUES (v_tenant, 'closed_record_edited',
          format('Closed loan #%s corrected', p_loan_id), 'amber', 'pencil');

  -- Amount feeds `investments` on the issue date; interest and closed_date feed
  -- `returns` on the closing date. Re-chain from the earliest of the four dates
  -- involved, old or new.
  v_from := LEAST(v_old.issue_date, v_old.closed_date, v_new_issue, v_new_closed);
  PERFORM recalculate_cash_summary(v_tenant, v_from);

  RETURN jsonb_build_object('loan_id', p_loan_id, 'recalculated_from', v_from);
END $$;

GRANT EXECUTE ON FUNCTION update_closed_record(BIGINT, JSONB) TO authenticated;


-- ============================================================
-- 2. Support tickets
-- ============================================================
-- The desktop has a full ticketing system with an offline queue. Ported
-- because a shop that hits a problem needs a way to reach you from inside the
-- app, with their shop already identified — chasing a WhatsApp message with no
-- context is worse for both sides.

CREATE TABLE support_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,

  subject     TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'question'
                CHECK (category IN ('question', 'problem', 'billing', 'feature', 'other')),
  priority    TEXT NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('low', 'normal', 'high')),
  status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'answered', 'resolved', 'closed')),

  -- Captured automatically so you are not asking "what browser?" in the first
  -- reply. Only technical context, nothing identifying beyond the shop.
  context     JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE support_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  /** true when written by support rather than the shop. */
  from_staff BOOLEAN NOT NULL DEFAULT false,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tickets_tenant  ON support_tickets (tenant_id, created_at DESC);
CREATE INDEX idx_tickets_open    ON support_tickets (created_at DESC) WHERE status IN ('open', 'answered');
CREATE INDEX idx_messages_ticket ON support_messages (ticket_id, created_at);

ALTER TABLE support_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- A shop reads and writes its own tickets. Only support staff (service role)
-- can change status or reply as staff.
CREATE POLICY "tickets_select" ON support_tickets
  FOR SELECT TO authenticated USING (tenant_id = get_tenant_id());
CREATE POLICY "tickets_insert" ON support_tickets
  FOR INSERT TO authenticated WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY "messages_select" ON support_messages
  FOR SELECT TO authenticated USING (tenant_id = get_tenant_id());
CREATE POLICY "messages_insert" ON support_messages
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id() AND from_staff = false);

DROP TRIGGER IF EXISTS set_updated_at_tickets ON support_tickets;
CREATE TRIGGER set_updated_at_tickets
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- Raise a ticket with its first message, in one transaction — a ticket with no
-- body is useless and a message with no ticket is orphaned.
CREATE OR REPLACE FUNCTION create_ticket(
  p_subject  TEXT,
  p_body     TEXT,
  p_category TEXT DEFAULT 'question',
  p_context  JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant UUID;
  v_user   UUID;
  v_id     UUID;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF coalesce(trim(p_subject), '') = '' THEN
    RAISE EXCEPTION 'Please give the message a subject' USING ERRCODE = '22023';
  END IF;
  IF coalesce(trim(p_body), '') = '' THEN
    RAISE EXCEPTION 'Please describe the problem' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_user FROM users WHERE auth_id = auth.uid();

  INSERT INTO support_tickets (tenant_id, created_by, subject, category, context)
  VALUES (v_tenant, v_user, left(trim(p_subject), 200),
          CASE WHEN p_category IN ('question','problem','billing','feature','other')
               THEN p_category ELSE 'question' END,
          COALESCE(p_context, '{}'::jsonb))
  RETURNING id INTO v_id;

  INSERT INTO support_messages (ticket_id, tenant_id, author_id, from_staff, body)
  VALUES (v_id, v_tenant, v_user, false, trim(p_body));

  RETURN v_id;
END $$;


CREATE OR REPLACE FUNCTION reply_to_ticket(p_ticket_id UUID, p_body TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant UUID;
  v_user   UUID;
  v_id     UUID;
  v_status TEXT;
BEGIN
  v_tenant := get_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF coalesce(trim(p_body), '') = '' THEN
    RAISE EXCEPTION 'Message cannot be empty' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO v_status FROM support_tickets
   WHERE id = p_ticket_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'This ticket is closed. Please open a new one.' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_user FROM users WHERE auth_id = auth.uid();

  INSERT INTO support_messages (ticket_id, tenant_id, author_id, from_staff, body)
  VALUES (p_ticket_id, v_tenant, v_user, false, trim(p_body))
  RETURNING id INTO v_id;

  -- A shop replying to an answered ticket reopens it, so it does not sit in
  -- "answered" while they are still waiting.
  UPDATE support_tickets
     SET status = CASE WHEN status = 'answered' THEN 'open' ELSE status END
   WHERE id = p_ticket_id AND tenant_id = v_tenant;

  RETURN v_id;
END $$;


CREATE OR REPLACE FUNCTION my_tickets()
RETURNS TABLE (
  id UUID, subject TEXT, category TEXT, status TEXT,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  message_count BIGINT, last_message_at TIMESTAMPTZ, awaiting_you BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT t.id, t.subject, t.category, t.status, t.created_at, t.updated_at,
         (SELECT count(*) FROM support_messages m WHERE m.ticket_id = t.id),
         (SELECT max(m.created_at) FROM support_messages m WHERE m.ticket_id = t.id),
         t.status = 'answered'
    FROM support_tickets t
   ORDER BY (t.status IN ('open','answered')) DESC, t.updated_at DESC;
$$;


CREATE OR REPLACE FUNCTION ticket_detail(p_ticket_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'ticket', to_jsonb(t),
    'messages', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id, 'body', m.body, 'from_staff', m.from_staff,
          'created_at', m.created_at,
          'author', (SELECT full_name FROM users u WHERE u.id = m.author_id)
        ) ORDER BY m.created_at
      ) FROM support_messages m WHERE m.ticket_id = t.id
    ), '[]'::jsonb)
  )
  FROM support_tickets t WHERE t.id = p_ticket_id;
$$;


GRANT EXECUTE ON FUNCTION create_ticket(TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION reply_to_ticket(UUID, TEXT)            TO authenticated;
GRANT EXECUTE ON FUNCTION my_tickets()                           TO authenticated;
GRANT EXECUTE ON FUNCTION ticket_detail(UUID)                    TO authenticated;
