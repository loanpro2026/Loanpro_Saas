#!/usr/bin/env tsx
/**
 * Tests for the migration row mapping.
 *
 *   npx tsx scripts/lib/map.test.ts
 *
 * Rows here are shaped exactly as mysql2 returns them from the desktop schema
 * (see electron_app/renderer/public/Schema.sql) with `dateStrings: true` — so
 * dates arrive as strings, DECIMAL as strings, and ENUMs as plain text.
 *
 * The cases that matter most are the ugly ones: NULL dates, MySQL zero dates,
 * empty strings, and the timezone conversion. Those are what actually appear
 * in a seven-year-old production database.
 */
import {
  mapLoan, mapDeposit, mapClosedDeposit, mapCashSummary, mapCashTx,
  mapActivity, mapAppState,
} from './map'
import { toUtcIso } from './source'

const TENANT = '3f2a0000-0000-0000-0000-000000000001'

let passed = 0
let failed = 0

function check(label: string, condition: boolean, detail?: string) {
  if (condition) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`) }
}

function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  check(label, a === e, `expected ${e}, got ${a}`)
}

function section(name: string) {
  console.log(`\n\x1b[1m${name}\x1b[0m`)
}

// ─── A realistic active loan ────────────────────────────────────────────────

section('loans — happy path')

const activeLoan = {
  id: 4471,
  name: 'Ramesh Kumar',
  father_name: 'Suresh Kumar',
  location: 'Sadar Bazaar',
  amount: 45000,
  category_type: 'Gold',
  detailed_type: '22K Necklace',
  weight: '12.500',                 // DECIMAL(10,3) arrives as a string
  face_verified_by: 'counter-1',
  face_verification_log: '{"score":0.91}',
  remarks: 'Regular customer',
  address: '12 Main Road',
  additional_information: null,
  issue_date: '2026-03-01',
  active_timestamp: '2026-03-01 09:00:00',
  status: 'active',
  closed_date: null,
  closed_timestamp: null,
  interest: 24,
}

const r1 = mapLoan(activeLoan, TENANT)
check('active loan maps', r1.ok)
if (r1.ok) {
  eq('id preserved exactly', r1.row.id, 4471)
  eq('weight parsed from DECIMAL string', r1.row.weight, 12.5)
  eq('JSON column parsed', r1.row.face_verification_log, { score: 0.91 })
  eq('issue_date passed through', r1.row.issue_date, '2026-03-01')
  eq('timestamp converted IST→UTC', r1.row.active_timestamp, '2026-03-01T03:30:00.000Z')
  eq('tenant stamped', r1.row.tenant_id, TENANT)
  eq('status', r1.row.status, 'active')
}

section('loans — closed record')

const closedLoan = {
  ...activeLoan,
  id: 4470,
  status: 'closed',
  closed_date: '2026-06-15',
  closed_timestamp: '2026-06-15 17:45:00',
}
const r2 = mapLoan(closedLoan, TENANT)
check('closed loan maps', r2.ok)
if (r2.ok) {
  eq('closed_date', r2.row.closed_date, '2026-06-15')
  eq('closed_timestamp IST→UTC', r2.row.closed_timestamp, '2026-06-15T12:15:00.000Z')
}

section('loans — bad data is skipped, not silently mangled')

const noDate = mapLoan({ ...activeLoan, issue_date: null }, TENANT)
check('NULL issue_date skipped', !noDate.ok)
if (!noDate.ok) eq('  with reason', noDate.reason, 'missing issue_date')

const zeroDate = mapLoan({ ...activeLoan, issue_date: '0000-00-00' }, TENANT)
check('MySQL zero date skipped', !zeroDate.ok)

const noName = mapLoan({ ...activeLoan, name: '' }, TENANT)
check('empty name skipped', !noName.ok)

const whitespaceName = mapLoan({ ...activeLoan, name: '   ' }, TENANT)
check('whitespace-only name skipped', !whitespaceName.ok)

section('loans — edge values')

const oddCategory = mapLoan({ ...activeLoan, category_type: 'Platinum' }, TENANT)
check('unknown category falls back rather than failing CHECK', oddCategory.ok)
if (oddCategory.ok) eq('  becomes Gold', oddCategory.row.category_type, 'Gold')

const silver = mapLoan({ ...activeLoan, category_type: 'Silver' }, TENANT)
if (silver.ok) eq('Silver preserved', silver.row.category_type, 'Silver')

const emptyStrings = mapLoan({ ...activeLoan, father_name: '', location: '  ' }, TENANT)
if (emptyStrings.ok) {
  eq('empty string → NULL (father_name)', emptyStrings.row.father_name, null)
  eq('whitespace → NULL (location)', emptyStrings.row.location, null)
}

const nullWeight = mapLoan({ ...activeLoan, weight: null, interest: null }, TENANT)
if (nullWeight.ok) {
  eq('NULL weight stays NULL', nullWeight.row.weight, null)
  eq('NULL interest stays NULL', nullWeight.row.interest, null)
}

const badJson = mapLoan({ ...activeLoan, face_verification_log: 'not json{' }, TENANT)
check('malformed JSON does not abort the row', badJson.ok)
if (badJson.ok) eq('  preserved as raw', badJson.row.face_verification_log, { raw: 'not json{' })

const objJson = mapLoan({ ...activeLoan, face_verification_log: { score: 1 } }, TENANT)
if (objJson.ok) eq('already-parsed JSON passes through', objJson.row.face_verification_log, { score: 1 })

// ─── deposits ───────────────────────────────────────────────────────────────

section('deposits')

const validLoans = new Set([4470, 4471])

const d1 = mapDeposit({ id: 9001, loan_id: 4471, amount: 5000, deposit_date: '2026-04-10' }, TENANT, validLoans)
check('deposit maps', d1.ok)
if (d1.ok) {
  eq('deposit id preserved', d1.row.id, 9001)
  eq('loan_id linked', d1.row.loan_id, 4471)
}

const orphan = mapDeposit({ id: 9002, loan_id: 99999, amount: 100, deposit_date: '2026-04-10' }, TENANT, validLoans)
check('deposit on an unmigrated loan is skipped', !orphan.ok)
if (!orphan.ok) check('  reason names the loan', orphan.reason.includes('99999'))

const noDepDate = mapDeposit({ id: 9003, loan_id: 4471, amount: 100, deposit_date: null }, TENANT, validLoans)
check('deposit with NULL date skipped', !noDepDate.ok)

const cd = mapClosedDeposit({
  id: 77, loan_id: 4470, original_deposit_id: 9000, amount: 2500,
  deposit_date: '2026-05-01', archived_at: '2026-06-15 17:45:00',
  source_version: 'closed-record-deposits-v1',
}, TENANT, validLoans)
check('closed-record deposit maps', cd.ok)
if (cd.ok) {
  eq('archived_at IST→UTC', cd.row.archived_at, '2026-06-15T12:15:00.000Z')
  eq('original_deposit_id kept', cd.row.original_deposit_id, 9000)
}

// ─── cash ───────────────────────────────────────────────────────────────────

section('cash summary — note the capitalised source columns')

const cs = mapCashSummary({
  date: '2026-03-01',
  Investments: 120000.5,     // capital I in MySQL
  Returns: 45000.25,         // capital R
  total_cash: 500000,
  added_cash: 10000,
  removed_cash: 2000,
  deposit_credit: 3000,
  deposit_debit: 1000,
  left_cash: 490000,
}, TENANT)
check('cash summary maps', cs.ok)
if (cs.ok) {
  eq('Investments → investments', cs.row.investments, 120000.5)
  eq('Returns → returns', cs.row.returns, 45000.25)
  eq('left_cash', cs.row.left_cash, 490000)
}

const csLower = mapCashSummary({ date: '2026-03-02', investments: 5, returns: 6 }, TENANT)
if (csLower.ok) {
  eq('lowercase variant also handled', csLower.row.investments, 5)
  eq('missing columns default to 0', csLower.row.total_cash, 0)
}

section('cash transactions')

const tx = mapCashTx({ transaction_date: '2026-03-01', type: 'remove', amount: '1500.00', reason: 'Rent' }, TENANT)
check('cash tx maps', tx.ok)
if (tx.ok) {
  eq('amount from DECIMAL string', tx.row.amount, 1500)
  eq('type preserved', tx.row.type, 'remove')
  check('no id — MySQL table has no primary key', !('id' in tx.row))
}

const txDefault = mapCashTx({ transaction_date: '2026-03-01', type: 'weird', amount: 1, reason: '' }, TENANT)
if (txDefault.ok) eq('unknown type falls back to add', txDefault.row.type, 'add')

// ─── misc ───────────────────────────────────────────────────────────────────

section('activity log & app state')

const act = mapActivity({
  id: 505, type: 'loan_created', description: 'Loan #4471 created',
  time: '2026-03-01 09:00:00', amount: '45000.00', color: 'green', icon: 'plus',
}, TENANT)
check('activity maps', act.ok)
if (act.ok) {
  eq('time IST→UTC', act.row.time, '2026-03-01T03:30:00.000Z')
  eq('amount parsed', act.row.amount, 45000)
}

const st = mapAppState({ state_key: 'daily_summary_bootstrapped', state_value: '1' }, TENANT)
check('app state maps', st.ok)
const stBad = mapAppState({ state_key: null, state_value: 'x' }, TENANT)
check('app state without key skipped', !stBad.ok)

// ─── The timezone trap, stated explicitly ───────────────────────────────────

section('timezone — the highest-risk conversion in the migration')

eq('9am IST → 03:30 UTC', toUtcIso('2026-03-01 09:00:00'), '2026-03-01T03:30:00.000Z')
eq('midnight IST → previous UTC day', toUtcIso('2026-03-01 00:00:00'), '2026-02-28T18:30:00.000Z')
eq('05:30 IST → UTC midnight', toUtcIso('2026-01-01 05:30:00'), '2026-01-01T00:00:00.000Z')
eq('no DST in June', toUtcIso('2026-06-15 14:30:00'), '2026-06-15T09:00:00.000Z')
eq('no DST in December', toUtcIso('2026-12-15 14:30:00'), '2026-12-15T09:00:00.000Z')

// The result must not depend on the machine running the migration.
check(
  'conversion is independent of process TZ',
  toUtcIso('2026-03-01 09:00:00') === '2026-03-01T03:30:00.000Z',
  'run this file under TZ=UTC, TZ=Asia/Kolkata and TZ=America/Los_Angeles'
)

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passed, ${failed} failed\x1b[0m`)
process.exit(failed === 0 ? 0 : 1)
