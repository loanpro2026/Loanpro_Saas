/**
 * Payload shapes for the RPCs declared `RETURNS jsonb`.
 *
 * The generated type for those is `Json` — the full union — which is accurate
 * but unusable for property access. These declare what each function actually
 * builds, read off the `jsonb_build_object(...)` in its migration.
 *
 * This is a hand-maintained contract, so treat it as such: if you change one
 * of these SQL functions, change the type here in the same commit. The types
 * are only as true as the last person to check them, which is why each one
 * names its source migration.
 *
 * Where a key is built with `to_jsonb(some_row)` the shape is exactly that
 * table's Row type, so it is referenced rather than restated — a column rename
 * then becomes a compile error here too.
 */
import type { Database } from './supabase'

type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

/**
 * `loan_detail(p_loan_id)` — migration 012 (redefines the 008 version to add
 * `suggested_interest`).
 *
 * One round trip for the whole loan page: the loan, its deposits, the archived
 * deposits if it has been closed, and the photo.
 */
export interface LoanDetailPayload {
  loan: Row<'loans'> | null
  /** Live deposits. Empty array, never null — the SQL COALESCEs to '[]'. */
  deposits: Row<'deposits'>[]
  /** Deposits moved aside when the loan was closed. Also never null. */
  archived_deposits: Row<'closed_record_deposits'>[]
  /**
   * The pledge photo. Retained under its old name so existing callers keep
   * working; prefer `photos` below.
   */
  photo: Row<'loan_photos'> | null

  /**
   * Both stages, keyed rather than in an array so a caller can ask for the one
   * it wants. Either may be null: an active loan has no collection photo, and
   * a loan saved while the requirement was off has no pledge photo.
   */
  photos: {
    pledge: Row<'loan_photos'> | null
    collection: Row<'loan_photos'> | null
  }
  total_deposits: number
  days_held: number
  /**
   * Interest as computed by calculate_interest(), so this page and the closing
   * dialog cannot disagree. Rupees, not a rate.
   */
  suggested_interest: number
}

/**
 * `ticket_detail(p_ticket_id)` — migration 016.
 *
 * `messages` is NOT a `support_messages` row. The SQL builds a narrower object
 * per message and resolves the author's name through a subquery on `users`,
 * because the raw row only carries `author_id` and the thread needs something
 * to print. Do not "simplify" this to Row<'support_messages'> — it is a
 * different shape on purpose.
 */
export interface TicketDetailPayload {
  ticket: Row<'support_tickets'> | null
  messages: {
    id: string
    body: string
    from_staff: boolean
    created_at: string
    /** users.full_name, or null if the author's account was removed. */
    author: string | null
  }[]
}

/** `my_plan()` — migration 011. */
export interface MyPlanPayload {
  plan: string
  active: boolean
  trial_days_left: number | null
  staff_limit: number
}
