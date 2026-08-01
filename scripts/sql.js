#!/usr/bin/env node
/**
 * SQL checks that a parser will not catch.
 *
 *   npm run check:sql
 *
 * `pglast` validates SQL *grammar*, which is why a migration containing
 * `WHEN undefined_schema THEN` parsed cleanly and then failed on a real
 * database with:
 *
 *     ERROR: 42704: unrecognized exception condition "undefined_schema"
 *
 * There is no PL/pgSQL condition of that name — the real one is
 * `invalid_schema_name`. And because Postgres rejects it while *compiling* the
 * function body, it is not something the surrounding EXCEPTION block can
 * catch: the whole migration aborts and rolls back.
 *
 * That single typo in migration 004 cost four migrations. 004 rolled back, so
 * `tenant_settings` and `removed_records_with_deposits` never existed, and
 * 012, 013 and 014 all failed looking for them.
 */
const fs = require('fs')
const path = require('path')

const DIR = path.resolve(__dirname, '..', 'supabase')

/**
 * PL/pgSQL condition names, from PostgreSQL Appendix A (Error Codes).
 * Only the ones a migration realistically uses — an unknown name here is
 * flagged for a human to check rather than silently allowed.
 */
const CONDITIONS = new Set([
  'others', 'sqlstate',
  // Class 02 — no data
  'no_data', 'no_data_found', 'too_many_rows',
  // Class 21/22 — cardinality and data exceptions
  'cardinality_violation', 'data_exception', 'division_by_zero',
  'invalid_text_representation', 'invalid_datetime_format',
  'datetime_field_overflow', 'numeric_value_out_of_range',
  'string_data_right_truncation', 'invalid_parameter_value',
  // Class 23 — integrity constraint violations
  'integrity_constraint_violation', 'restrict_violation',
  'not_null_violation', 'foreign_key_violation',
  'unique_violation', 'check_violation', 'exclusion_violation',
  // Class 25 — invalid transaction state
  'invalid_transaction_state', 'read_only_sql_transaction',
  // Class 28 — invalid authorization
  'invalid_authorization_specification', 'invalid_password',
  // Class 2D / 40 — transaction
  'invalid_transaction_termination', 'transaction_rollback',
  'serialization_failure', 'deadlock_detected',
  // Class 3F — schema
  'invalid_schema_name',
  // Class 42 — syntax error or access rule violation
  'syntax_error_or_access_rule_violation', 'syntax_error',
  'insufficient_privilege', 'grouping_error', 'datatype_mismatch',
  'invalid_name', 'name_too_long',
  'duplicate_column', 'duplicate_cursor', 'duplicate_database',
  'duplicate_function', 'duplicate_prepared_statement', 'duplicate_schema',
  'duplicate_table', 'duplicate_alias', 'duplicate_object',
  'ambiguous_column', 'ambiguous_function',
  'undefined_column', 'undefined_function', 'undefined_table',
  'undefined_parameter', 'undefined_object',
  'invalid_column_definition', 'invalid_table_definition',
  'wrong_object_type',
  // Class 53/57/58 — resource / operator intervention
  'insufficient_resources', 'disk_full', 'out_of_memory',
  'query_canceled', 'admin_shutdown',
  // Class P0 — PL/pgSQL
  'plpgsql_error', 'raise_exception',
  'no_data_found_plpgsql', 'assert_failure',
])

/** Names people reach for that do not exist, with the right one. */
const COMMON_MISTAKES = {
  undefined_schema: 'invalid_schema_name',
  undefined_extension: 'undefined_object',
  schema_does_not_exist: 'invalid_schema_name',
  table_not_found: 'undefined_table',
  function_not_found: 'undefined_function',
  duplicate_key: 'unique_violation',
  permission_denied: 'insufficient_privilege',
}

const files = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.sql')) files.push(p)
  }
})(DIR)

let problems = 0
let checked = 0

for (const file of files) {
  const rel = path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/')
  const lines = fs.readFileSync(file, 'utf8').split('\n')

  let inException = false

  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('--')) return

    if (/^\s*EXCEPTION\s*$/i.test(line)) { inException = true; return }
    // A new block body ends the handler section.
    if (/^\s*(END|BEGIN)\b/i.test(trimmed)) inException = false
    if (!inException) return

    const m = trimmed.match(/^WHEN\s+(.+?)\s+THEN/i)
    if (!m) return

    // `WHEN a OR b THEN`
    for (const raw of m[1].split(/\s+OR\s+/i)) {
      const cond = raw.trim().toLowerCase()
      if (!cond || cond.startsWith('sqlstate')) continue
      checked++

      if (CONDITIONS.has(cond)) continue

      problems++
      console.log(`\n\x1b[31m✗ unrecognized exception condition\x1b[0m  ${rel}:${i + 1}`)
      console.log(`     WHEN ${cond} THEN`)
      if (COMMON_MISTAKES[cond]) {
        console.log(`     \x1b[33mDid you mean: ${COMMON_MISTAKES[cond]}\x1b[0m`)
      }
      console.log('     Postgres rejects this while COMPILING the function body, so the')
      console.log('     surrounding block cannot catch it — the migration aborts and')
      console.log('     rolls back, taking every table it created with it.')
    }
  })
}

// ── Migrations must be numbered contiguously ────────────────────────────────
// A gap usually means a file was renamed and something now runs out of order.
const migrations = fs.readdirSync(path.join(DIR, 'migrations'))
  .filter(f => /^\d{3}_.*\.sql$/.test(f))
  .map(f => Number(f.slice(0, 3)))
  .sort((a, b) => a - b)

for (let i = 1; i < migrations.length; i++) {
  if (migrations[i] !== migrations[i - 1] + 1) {
    problems++
    console.log(`\n\x1b[31m✗ migration numbering gap\x1b[0m`)
    console.log(`     ${String(migrations[i - 1]).padStart(3, '0')} is followed by ${String(migrations[i]).padStart(3, '0')}`)
  }
}

console.log()
if (problems === 0) {
  console.log(`\x1b[32m${checked} exception conditions valid · ${migrations.length} migrations, contiguous\x1b[0m`)
  process.exit(0)
}
console.log(`\x1b[31m${problems} problem(s)\x1b[0m`)
process.exit(1)
