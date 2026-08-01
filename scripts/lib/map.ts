/**
 * Pure row mapping: desktop MySQL shape → Supabase shape.
 *
 * Deliberately free of database and network calls so it can be tested directly
 * against rows shaped like the real desktop schema. This is where the subtle
 * bugs live — a mistyped column name or a missed null check here silently
 * corrupts a shop's records — so it is the part most worth testing.
 *
 * Each mapper returns either a row to insert or a skip reason. Nothing is ever
 * dropped without a reason attached.
 */
import { toUtcIso, toDateOnly, toInt, toNumber, toJson } from './source'

export type Mapped<T> =
  | { ok: true; row: T }
  | { ok: false; reason: string }

const skip = (reason: string): Mapped<never> => ({ ok: false, reason })

/** Loose row type — mysql2 hands back plain objects. */
export type Row = Record<string, any>

// ─── loans ──────────────────────────────────────────────────────────────────

export function mapLoan(r: Row, tenantId: string): Mapped<Row> {
  const issueDate = toDateOnly(r.issue_date)

  // issue_date is NOT NULL downstream and a nameless loan cannot be matched to
  // a customer. Both are unrecoverable, so skip loudly rather than inventing
  // a value.
  if (!issueDate) return skip('missing issue_date')
  if (!r.name || String(r.name).trim() === '') return skip('missing customer name')

  const status = r.status === 'closed' ? 'closed' : 'active'

  return {
    ok: true,
    row: {
      id: Number(r.id),                 // preserved: written on paper tickets
      tenant_id: tenantId,
      name: String(r.name).trim(),
      father_name: nz(r.father_name),
      location: nz(r.location),
      address: nz(r.address),
      additional_information: nz(r.additional_information),
      // MySQL ENUM('Gold','Silver'). Anything unexpected becomes Gold rather
      // than failing the CHECK constraint and aborting the batch.
      category_type: r.category_type === 'Silver' ? 'Silver' : 'Gold',
      detailed_type: nz(r.detailed_type),
      weight: toNumber(r.weight),
      amount: toInt(r.amount) ?? 0,
      interest: toInt(r.interest),
      face_verified_by: nz(r.face_verified_by),
      face_verification_log: toJson(r.face_verification_log),
      remarks: nz(r.remarks),
      issue_date: issueDate,
      active_timestamp: toUtcIso(r.active_timestamp),
      status,
      // A closed loan with no closed_date would break historical reports, but
      // it is recoverable — keep the record, note the gap.
      closed_date: toDateOnly(r.closed_date),
      closed_timestamp: toUtcIso(r.closed_timestamp),
    },
  }
}

// ─── deposits ───────────────────────────────────────────────────────────────

export function mapDeposit(r: Row, tenantId: string, validLoans: Set<number>): Mapped<Row> {
  const date = toDateOnly(r.deposit_date)
  if (!date) return skip('missing deposit_date')

  const loanId = Number(r.loan_id)
  // The composite FK would reject this anyway; catching it here means one bad
  // row does not abort a 500-row batch.
  if (!validLoans.has(loanId)) return skip(`loan ${r.loan_id} not migrated`)

  return {
    ok: true,
    row: {
      id: Number(r.id),
      tenant_id: tenantId,
      loan_id: loanId,
      amount: toInt(r.amount) ?? 0,
      deposit_date: date,
    },
  }
}

export function mapClosedDeposit(r: Row, tenantId: string, validLoans: Set<number>): Mapped<Row> {
  const date = toDateOnly(r.deposit_date)
  if (!date) return skip('missing deposit_date')

  const loanId = Number(r.loan_id)
  if (!validLoans.has(loanId)) return skip(`loan ${r.loan_id} not migrated`)

  return {
    ok: true,
    row: {
      id: Number(r.id),
      tenant_id: tenantId,
      loan_id: loanId,
      original_deposit_id: toInt(r.original_deposit_id),
      amount: toInt(r.amount) ?? 0,
      deposit_date: date,
      archived_at: toUtcIso(r.archived_at) ?? new Date().toISOString(),
      source_version: nz(r.source_version) ?? 'closed-record-deposits-v1',
    },
  }
}

// ─── cash ───────────────────────────────────────────────────────────────────

export function mapCashSummary(r: Row, tenantId: string): Mapped<Row> {
  const date = toDateOnly(r.date)
  if (!date) return skip('missing date')

  // MySQL stored these as DOUBLE; the target is NUMERIC. Floating-point money
  // accumulates rounding error, and this is the shop's cash position.
  // Note the capitalised source columns — `Investments` and `Returns`.
  return {
    ok: true,
    row: {
      tenant_id: tenantId,
      date,
      investments: toNumber(r.Investments ?? r.investments) ?? 0,
      returns: toNumber(r.Returns ?? r.returns) ?? 0,
      total_cash: toNumber(r.total_cash) ?? 0,
      added_cash: toNumber(r.added_cash) ?? 0,
      removed_cash: toNumber(r.removed_cash) ?? 0,
      deposit_credit: toNumber(r.deposit_credit) ?? 0,
      deposit_debit: toNumber(r.deposit_debit) ?? 0,
      left_cash: toNumber(r.left_cash) ?? 0,
    },
  }
}

export function mapCashTx(r: Row, tenantId: string): Mapped<Row> {
  const date = toDateOnly(r.transaction_date)
  if (!date) return skip('missing transaction_date')

  return {
    ok: true,
    row: {
      // No id: the MySQL table has no primary key, so the target's BIGSERIAL
      // assigns one. This is why re-running needs the emptiness guard.
      tenant_id: tenantId,
      transaction_date: date,
      type: r.type === 'remove' ? 'remove' : 'add',
      amount: toNumber(r.amount) ?? 0,
      reason: String(r.reason ?? ''),
    },
  }
}

// ─── misc ───────────────────────────────────────────────────────────────────

export function mapActivity(r: Row, tenantId: string): Mapped<Row> {
  return {
    ok: true,
    row: {
      id: Number(r.id),
      tenant_id: tenantId,
      type: String(r.type ?? 'unknown'),
      description: String(r.description ?? ''),
      amount: toNumber(r.amount),
      color: nz(r.color),
      icon: nz(r.icon),
      time: toUtcIso(r.time) ?? new Date().toISOString(),
    },
  }
}

export function mapAppState(r: Row, tenantId: string): Mapped<Row> {
  if (!r.state_key) return skip('missing state_key')
  return {
    ok: true,
    row: {
      tenant_id: tenantId,
      state_key: String(r.state_key),
      state_value: r.state_value == null ? null : String(r.state_value),
    },
  }
}

/** Empty strings become NULL — MySQL treats '' and NULL loosely, Postgres does not. */
function nz(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v)
  return s.trim() === '' ? null : s
}
