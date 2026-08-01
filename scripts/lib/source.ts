/**
 * Reading the desktop app's MySQL database.
 *
 * Everything here is READ-ONLY. The customer's desktop data is never modified
 * by the migration — if anything goes wrong, they close the browser and carry
 * on using the desktop app as though nothing happened.
 *
 * Timezone handling is the single most dangerous part of this migration and is
 * explained at `toUtcIso` below.
 */
import mysql from 'mysql2/promise'

export const SOURCE_TZ = 'Asia/Kolkata'

export interface SourceConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export async function connect(cfg: SourceConfig) {
  return mysql.createConnection({
    ...cfg,
    // Return DATE/DATETIME as raw strings rather than JS Date objects.
    //
    // This matters enormously. If mysql2 builds a Date, it interprets the
    // naive MySQL value using the *Node process* timezone — so the same
    // database migrated from a laptop set to IST and a server set to UTC would
    // produce different timestamps. Taking the raw string and attaching the
    // offset ourselves makes the result independent of where the script runs.
    dateStrings: true,
    // Large LONGBLOB photos; give the driver room.
    maxPreparedStatements: 20,
  })
}

/**
 * Convert a naive MySQL DATETIME to a correct UTC ISO string.
 *
 * The desktop app runs on shop counters in India and writes local wall-clock
 * time with no offset. `2026-03-01 09:00:00` means 9am IST, which is
 * 03:30 UTC. Handing that string straight to `new Date()` in a UTC process
 * reads it as 9am UTC and shifts every record 5.5 hours later — enough to move
 * an evening entry onto the following day and silently corrupt every daily
 * report the shop relies on.
 *
 * IST is UTC+05:30 year-round with no daylight saving, so a fixed offset is
 * correct here. (This would need a real tz library for most other countries.)
 */
export function toUtcIso(value: string | null | undefined): string | null {
  if (!value) return null
  const s = String(value).trim()
  if (!s || s.startsWith('0000-00-00')) return null   // MySQL zero date

  // 'YYYY-MM-DD HH:MM:SS' or 'YYYY-MM-DDTHH:MM:SS(.sss)'
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null

  const [, y, mo, d, h, mi, sec] = m
  const utcMs = Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec) - (5 * 60 + 30) * 60_000
  return new Date(utcMs).toISOString()
}

/**
 * DATE columns carry no time component, so they need no conversion — but they
 * do need validating. A NULL or zero date in a NOT NULL target column would
 * abort the whole import partway through.
 */
export function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null
  const s = String(value).trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (!m || m[1].startsWith('0000')) return null
  return m[1]
}

/** MySQL DECIMAL/DOUBLE arrive as strings or numbers depending on the driver. */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function toInt(value: unknown): number | null {
  const n = toNumber(value)
  return n === null ? null : Math.round(n)
}

/**
 * `loans.face_verification_log` is a MySQL JSON column, which comes back as
 * either a parsed object or a string depending on driver version. Normalise,
 * and never let malformed JSON abort the migration — the field is advisory.
 */
export function toJson(value: unknown): unknown | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(String(value))
  } catch {
    return { raw: String(value) }
  }
}

/** Tables we expect to find. Absence of an optional one is not an error — */
/** older installs predate some of them. */
export const EXPECTED_TABLES = [
  'loans',
  'deposits',
  'daily_cash_summary',
  'cash_transactions',
  'activity_log',
] as const

export const OPTIONAL_TABLES = [
  'loan_identity_images',
  'closed_record_image_archive',
  'closed_record_deposits',
  'removed_records_with_deposits',
  'daily_deposit_records',
  'app_state',
  'fingerprints',
  'removed_fingerprints',
  'mobile_capture_devices',
  'drive_backup_history',
] as const

export async function listTables(conn: mysql.Connection): Promise<Set<string>> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>('SHOW TABLES')
  const names = rows.map(r => String(Object.values(r)[0]).toLowerCase())
  return new Set(names)
}

export async function countRows(conn: mysql.Connection, table: string): Promise<number> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM \`${table}\``
  )
  return Number(rows[0]?.n ?? 0)
}
