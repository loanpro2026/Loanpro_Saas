#!/usr/bin/env tsx
/**
 * migrate-tenant — move one shop from the desktop app's MySQL into Supabase.
 *
 *   # 1. Preview. Reads only; writes nothing anywhere.
 *   npm run migrate:tenant -- --tenant <uuid> --dry-run
 *
 *   # 2. Do it.
 *   npm run migrate:tenant -- --tenant <uuid> --execute
 *
 * Design rules, in priority order:
 *
 *   1. The source MySQL is never written to. If this script goes wrong the
 *      customer keeps using the desktop app as if nothing happened.
 *   2. Original loan IDs are preserved. Shops write those numbers on the
 *      paper tickets attached to the gold in the safe — renumbering them
 *      means they cannot find a customer's jewellery.
 *   3. Nothing is dropped silently. Anything skipped is counted and printed.
 *   4. Re-running is safe. Inserts use ON CONFLICT DO NOTHING against
 *      preserved primary keys.
 *
 * Fingerprint templates are deliberately NOT migrated — see §7 of
 * LOANPRO_WEB_PLAN.md. The count is reported so the customer hears it from you
 * rather than discovering it later.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { RowDataPacket } from 'mysql2'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import readline from 'node:readline/promises'

import {
  connect, listTables, countRows, toUtcIso, SOURCE_TZ, type SourceConfig,
} from './lib/source'
import {
  mapLoan, mapDeposit, mapClosedDeposit, mapCashSummary, mapCashTx,
  mapActivity, mapAppState, type Mapped, type Row,
} from './lib/map'
import * as out from './lib/report'
import { putObject, MAX_PHOTO_BYTES } from '../lib/r2'

// ─── Arguments ──────────────────────────────────────────────────────────────

interface Args {
  tenant: string
  dryRun: boolean
  execute: boolean
  archiveDir: string | null
  mysql: SourceConfig
  batchSize: number
  skipPhotos: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (flag: string, fallback?: string) => {
    const i = argv.indexOf(flag)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
  }
  const has = (flag: string) => argv.includes(flag)

  const tenant = get('--tenant') ?? ''
  const dryRun = has('--dry-run')
  const execute = has('--execute')

  if (!tenant || (!dryRun && !execute) || (dryRun && execute)) {
    console.log(`
${out.bold('migrate-tenant')} — move one shop from desktop MySQL into Supabase

  ${out.bold('--tenant <uuid>')}      target Supabase tenant (required)
  ${out.bold('--dry-run')}            report what would happen; write nothing
  ${out.bold('--execute')}            perform the migration

  --archive-dir <path>  closed-record image folder. Usually
                        %APPDATA%\\LoanPro\\closed-record-images
  --skip-photos         migrate rows only; useful for a fast rehearsal
  --batch <n>           insert batch size (default 500)

  --mysql-host <h>      default 127.0.0.1
  --mysql-port <p>      default 3307   (the desktop app's bundled MySQL)
  --mysql-user <u>      default root
  --mysql-password <p>  default from MIGRATE_MYSQL_PASSWORD
  --mysql-database <d>  default loan_management

Exactly one of --dry-run or --execute is required.
`)
    process.exit(1)
  }

  return {
    tenant,
    dryRun,
    execute,
    archiveDir: get('--archive-dir') ?? null,
    skipPhotos: has('--skip-photos'),
    batchSize: Number(get('--batch', '500')),
    mysql: {
      host: get('--mysql-host', process.env.MIGRATE_MYSQL_HOST ?? '127.0.0.1')!,
      port: Number(get('--mysql-port', process.env.MIGRATE_MYSQL_PORT ?? '3307')),
      user: get('--mysql-user', process.env.MIGRATE_MYSQL_USER ?? 'root')!,
      password: get('--mysql-password', process.env.MIGRATE_MYSQL_PASSWORD ?? '')!,
      database: get('--mysql-database', process.env.MIGRATE_MYSQL_DATABASE ?? 'loan_management')!,
    },
  }
}

// ─── Supabase ───────────────────────────────────────────────────────────────

function supabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set ' +
      '(put them in .env.local and run with `npm run migrate:tenant`).'
    )
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

// ─── Issue tracking ─────────────────────────────────────────────────────────

interface Issue { entity: string; id: string | number; reason: string }
const issues: Issue[] = []
const note = (entity: string, id: string | number, reason: string) =>
  issues.push({ entity, id, reason })

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs()
  const started = Date.now()

  out.heading('LoanPro migration')
  out.kv('Mode', args.dryRun ? 'DRY RUN (nothing will be written)' : 'EXECUTE')
  out.kv('Source', `mysql://${args.mysql.host}:${args.mysql.port}/${args.mysql.database}`)
  out.kv('Target tenant', args.tenant)
  out.kv('Source timezone', SOURCE_TZ)

  const conn = await connect(args.mysql)
  const db = supabaseAdmin()

  try {
    // ── Preflight ───────────────────────────────────────────────────────────
    out.heading('Checking target')

    const { data: tenant, error: tenantErr } = await db
      .from('tenants').select('id, shop_name, plan').eq('id', args.tenant).single()

    if (tenantErr || !tenant) {
      out.fail(`Tenant ${args.tenant} not found. Create the account first, then migrate into it.`)
      process.exit(1)
    }
    out.ok(`Target shop: ${tenant.shop_name} (plan: ${tenant.plan})`)

    // Refuse to merge into a tenant that is already in use. Merging two loan
    // books is not something to discover halfway through.
    const { count: existingLoans } = await db
      .from('loans').select('id', { count: 'exact', head: true }).eq('tenant_id', args.tenant)

    if ((existingLoans ?? 0) > 0) {
      out.warn(`Target tenant already has ${out.num(existingLoans!)} loans.`)
      out.info('Re-running is safe (existing ids are skipped), but if this is a')
      out.info('different shop\'s data you are about to merge two loan books.')
      if (args.execute && !(await confirm('Continue anyway?'))) process.exit(1)
    }

    // ── Inspect source ──────────────────────────────────────────────────────
    out.heading('Reading source database')

    const tables = await listTables(conn)
    const has = (t: string) => tables.has(t.toLowerCase())

    if (!has('loans')) {
      out.fail('No `loans` table — this does not look like a LoanPro database.')
      process.exit(1)
    }

    const counts: Record<string, number> = {}
    for (const t of [
      'loans', 'deposits', 'closed_record_deposits', 'daily_cash_summary',
      'cash_transactions', 'activity_log', 'app_state',
      'removed_records_with_deposits', 'daily_deposit_records',
      'loan_identity_images', 'closed_record_image_archive',
      'fingerprints', 'removed_fingerprints',
    ]) {
      counts[t] = has(t) ? await countRows(conn, t) : 0
    }

    const [loanStats] = await conn.query<RowDataPacket[]>(`
      SELECT
        SUM(status = 'active') AS active,
        SUM(status = 'closed') AS closed,
        SUM(CASE WHEN status = 'active' THEN amount ELSE 0 END) AS active_amount,
        MIN(issue_date) AS oldest,
        MAX(issue_date) AS newest,
        SUM(issue_date IS NULL) AS null_issue_date,
        SUM(name IS NULL OR name = '') AS null_name
      FROM loans
    `)
    const st = loanStats[0]

    out.table([
      ['Loans (active)', out.num(Number(st.active ?? 0)), ''],
      ['Loans (closed)', out.num(Number(st.closed ?? 0)), ''],
      ['Deposits', out.num(counts.deposits), ''],
      ['Closed-record deposits', out.num(counts.closed_record_deposits), ''],
      ['Cash transactions', out.num(counts.cash_transactions), ''],
      ['Daily cash summary', out.num(counts.daily_cash_summary), ''],
      ['Activity log', out.num(counts.activity_log), ''],
      ['App state', out.num(counts.app_state), ''],
    ], ['Entity', 'Rows', ''])

    out.info('')
    out.kv('Outstanding (active loans)', `₹${out.num(Number(st.active_amount ?? 0))}`)
    out.kv('Date range', `${st.oldest ?? '—'} → ${st.newest ?? '—'}`)

    // ── Data quality ────────────────────────────────────────────────────────
    out.heading('Data quality')

    let blockers = 0
    if (Number(st.null_issue_date ?? 0) > 0) {
      out.warn(`${st.null_issue_date} loans have no issue_date — these will be SKIPPED`)
      blockers += Number(st.null_issue_date)
    }
    if (Number(st.null_name ?? 0) > 0) {
      out.warn(`${st.null_name} loans have no customer name — these will be SKIPPED`)
    }
    if (blockers === 0) out.ok('No blocking data problems found')

    // Timezone sanity: show the customer a real record both ways so the
    // conversion is visible rather than assumed.
    const [sample] = await conn.query<RowDataPacket[]>(
      `SELECT id, active_timestamp FROM loans
        WHERE active_timestamp IS NOT NULL ORDER BY id DESC LIMIT 1`
    )
    if (sample[0]) {
      out.info('')
      out.info(`Timezone check on loan #${sample[0].id}:`)
      out.info(`  stored (desktop, ${SOURCE_TZ}):  ${sample[0].active_timestamp}`)
      out.info(`  will become (UTC):              ${toUtcIso(sample[0].active_timestamp)}`)
      out.info(out.dim('  These must describe the same moment. If not, stop.'))
    }

    // ── Photos ──────────────────────────────────────────────────────────────
    out.heading('Photos')

    let inlinePhotos = 0, inlineBytes = 0
    if (has('loan_identity_images')) {
      const [r] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) n, COALESCE(SUM(LENGTH(image_data)),0) b
           FROM loan_identity_images WHERE image_data IS NOT NULL`
      )
      inlinePhotos = Number(r[0].n); inlineBytes = Number(r[0].b)
    }

    let archivedPhotos = 0, archivedMissing = 0, archivedBytes = 0
    if (has('closed_record_image_archive')) {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT loan_id, relative_path, file_size_bytes FROM closed_record_image_archive`
      )
      archivedPhotos = rows.length
      for (const row of rows) {
        archivedBytes += Number(row.file_size_bytes ?? 0)
        if (args.archiveDir) {
          const p = path.join(args.archiveDir, String(row.relative_path).replace(/\\/g, path.sep))
          if (!fs.existsSync(p)) { archivedMissing++; note('photo', row.loan_id, 'archive file missing on disk') }
        }
      }
    }

    out.kv('Inline photos (active loans)', `${out.num(inlinePhotos)}  ${out.bytes(inlineBytes)}`)
    out.kv('Archived photos (closed loans)', `${out.num(archivedPhotos)}  ${out.bytes(archivedBytes)}`)

    if (archivedPhotos > 0 && !args.archiveDir) {
      out.warn('--archive-dir not given, so closed-record photos will NOT be migrated.')
      out.info('They live outside MySQL, usually at:')
      out.info(out.dim('  %APPDATA%\\LoanPro\\closed-record-images'))
    } else if (archivedMissing > 0) {
      out.warn(`${archivedMissing} archived photos are recorded but missing from disk`)
    }
    if (args.skipPhotos) out.warn('--skip-photos set: no images will be uploaded')

    // ── Not migrated ────────────────────────────────────────────────────────
    const fpTotal = counts.fingerprints + counts.removed_fingerprints
    if (fpTotal > 0) {
      out.heading('Will NOT be migrated')
      out.warn(`${out.num(fpTotal)} fingerprint templates`)
      out.info('The web app has no access to the SecuGen scanner, so fingerprint')
      out.info('capture and 1:N search stay desktop-only features. Make sure the')
      out.info('shop owner knows this BEFORE cutover, not after.')
      out.info(out.dim(`  (${out.num(counts.fingerprints)} active, ${out.num(counts.removed_fingerprints)} closed)`))
    }

    // ── Stop here if dry run ────────────────────────────────────────────────
    if (args.dryRun) {
      out.heading('Dry run complete')
      out.info('Nothing was written. Re-run with --execute to migrate.')
      if (issues.length) {
        out.info('')
        out.warn(`${issues.length} issue(s) recorded:`)
        for (const i of issues.slice(0, 20)) out.info(out.dim(`  ${i.entity} ${i.id}: ${i.reason}`))
        if (issues.length > 20) out.info(out.dim(`  ...and ${issues.length - 20} more`))
      }
      return
    }

    // ── Execute ─────────────────────────────────────────────────────────────
    out.heading('Migrating')
    if (!(await confirm(`Write this data into "${tenant.shop_name}"?`))) {
      out.info('Aborted.'); return
    }

    const { data: job } = await db.from('migration_jobs').insert({
      tenant_id: args.tenant,
      source_db: `${args.mysql.host}:${args.mysql.port}/${args.mysql.database}`,
      status: 'running',
    }).select('id').single()

    const stats: Record<string, number> = {}

    try {
      stats.loans = await migrateLoans(conn, db, args)
      stats.deposits = await migrateDeposits(conn, db, args)
      if (has('closed_record_deposits')) stats.closed_record_deposits = await migrateClosedDeposits(conn, db, args)
      stats.daily_cash_summary = await migrateCashSummary(conn, db, args)
      stats.cash_transactions = await migrateCashTx(conn, db, args)
      stats.activity_log = await migrateActivity(conn, db, args)
      if (has('app_state')) stats.app_state = await migrateAppState(conn, db, args)

      if (!args.skipPhotos) {
        stats.photos = await migratePhotos(conn, db, args, has)
      }

      // Sequences must be pushed past the imported ids, or the very next loan
      // the shop creates collides with an existing primary key.
      await resetSequences(db, args.tenant)
      out.ok('Sequences reset past imported ids')

      await db.from('migration_jobs').update({
        status: 'completed',
        stats: { ...stats, issues: issues.length, skipped_fingerprints: fpTotal },
        error_log: issues.length ? JSON.stringify(issues.slice(0, 500)) : null,
        completed_at: new Date().toISOString(),
      }).eq('id', job!.id)

    } catch (err) {
      await db.from('migration_jobs').update({
        status: 'failed',
        stats,
        error_log: String(err),
        completed_at: new Date().toISOString(),
      }).eq('id', job!.id)
      throw err
    }

    // ── Summary ─────────────────────────────────────────────────────────────
    out.heading('Done')
    for (const [k, v] of Object.entries(stats)) out.kv(k, out.num(v))
    out.kv('Elapsed', `${Math.round((Date.now() - started) / 1000)}s`)

    if (issues.length) {
      const file = path.resolve(`migration-issues-${args.tenant.slice(0, 8)}.csv`)
      fs.writeFileSync(file,
        'entity,id,reason\n' + issues.map(i => `${i.entity},${i.id},"${i.reason}"`).join('\n'))
      out.warn(`${issues.length} record(s) skipped — details in ${file}`)
    }

    out.info('')
    out.info(out.bold('Next: run the reconciliation before anyone starts using the web app.'))
    out.info(out.dim(`  npm run migrate:reconcile -- --tenant ${args.tenant}`))

  } finally {
    await conn.end()
  }
}

// ─── Entity migrations ──────────────────────────────────────────────────────

/** Insert in batches, skipping rows whose primary key already exists. */
async function insertBatches(
  db: SupabaseClient, table: string, rows: Record<string, unknown>[], batchSize: number
): Promise<number> {
  let written = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize)
    const { error } = await db.from(table).upsert(chunk, { ignoreDuplicates: true })
    if (error) throw new Error(`${table}: ${error.message}`)
    written += chunk.length
    out.progress(Math.min(i + batchSize, rows.length), rows.length, table)
  }
  return written
}

/**
 * Run a pure mapper over every source row, recording each skip with its reason
 * so nothing disappears without appearing in the final report.
 */
function applyMapper(
  rows: Row[], entity: string, fn: (r: Row) => Mapped<Row>
): Row[] {
  const kept: Row[] = []
  for (const r of rows) {
    const res = fn(r)
    if (res.ok) kept.push(res.row)
    else note(entity, r.id ?? '?', res.reason)
  }
  return kept
}

async function migrateLoans(conn: any, db: SupabaseClient, args: Args): Promise<number> {
  const [rows] = await conn.query<RowDataPacket[]>('SELECT * FROM loans ORDER BY id')
  const mapped = applyMapper(rows, 'loan', r => mapLoan(r, args.tenant))
  return insertBatches(db, 'loans', mapped, args.batchSize)
}

async function migrateDeposits(conn: any, db: SupabaseClient, args: Args): Promise<number> {
  const [rows] = await conn.query<RowDataPacket[]>('SELECT * FROM deposits ORDER BY id')
  // A deposit whose loan was skipped would violate the composite FK, so it is
  // dropped here rather than aborting a 500-row batch.
  const validLoans = await loadValidLoanIds(db, args.tenant)
  const mapped = applyMapper(rows, 'deposit', r => mapDeposit(r, args.tenant, validLoans))
  return insertBatches(db, 'deposits', mapped, args.batchSize)
}

async function migrateClosedDeposits(conn: any, db: SupabaseClient, args: Args): Promise<number> {
  const [rows] = await conn.query<RowDataPacket[]>('SELECT * FROM closed_record_deposits ORDER BY id')
  const validLoans = await loadValidLoanIds(db, args.tenant)
  const mapped = applyMapper(rows, 'closed_deposit', r => mapClosedDeposit(r, args.tenant, validLoans))
  return insertBatches(db, 'closed_record_deposits', mapped, args.batchSize)
}

async function migrateCashSummary(conn: any, db: SupabaseClient, args: Args): Promise<number> {
  const [rows] = await conn.query<RowDataPacket[]>('SELECT * FROM daily_cash_summary ORDER BY date')
  const mapped = applyMapper(rows, 'cash_summary', r => mapCashSummary(r, args.tenant))
  return insertBatches(db, 'daily_cash_summary', mapped, args.batchSize)
}

async function migrateCashTx(conn: any, db: SupabaseClient, args: Args): Promise<number> {
  // The MySQL table has no primary key, so there is no id to preserve and
  // therefore no way to deduplicate on re-run. Guard on emptiness instead.
  const { count } = await db.from('cash_transactions')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', args.tenant)
  if ((count ?? 0) > 0) {
    out.warn(`cash_transactions already has ${count} rows for this tenant — skipping to avoid duplicates`)
    return 0
  }

  const [rows] = await conn.query<RowDataPacket[]>('SELECT * FROM cash_transactions')
  const mapped = applyMapper(rows, 'cash_tx', r => mapCashTx(r, args.tenant))
  return insertBatches(db, 'cash_transactions', mapped, args.batchSize)
}

async function migrateActivity(conn: any, db: SupabaseClient, args: Args): Promise<number> {
  const [rows] = await conn.query<RowDataPacket[]>('SELECT * FROM activity_log ORDER BY id')
  const mapped = applyMapper(rows, 'activity', r => mapActivity(r, args.tenant))
  return insertBatches(db, 'activity_log', mapped, args.batchSize)
}

async function migrateAppState(conn: any, db: SupabaseClient, args: Args): Promise<number> {
  const [rows] = await conn.query<RowDataPacket[]>('SELECT * FROM app_state')
  const mapped = applyMapper(rows, 'app_state', r => mapAppState(r, args.tenant))
  return insertBatches(db, 'app_state', mapped, args.batchSize)
}

/**
 * Photos come from two places:
 *   • loan_identity_images — LONGBLOB in MySQL, for active loans
 *   • closed_record_image_archive — files on disk, for closed loans
 * Both end up as R2 objects with a loan_photos row.
 */
async function migratePhotos(
  conn: any, db: SupabaseClient, args: Args, has: (t: string) => boolean
): Promise<number> {
  const validLoans = await loadValidLoanIds(db, args.tenant)
  let done = 0

  const upload = async (loanId: number, buf: Buffer, capturedAt: string | null, archived: boolean) => {
    if (!validLoans.has(loanId)) { note('photo', loanId, 'loan not migrated'); return }
    if (buf.length === 0) { note('photo', loanId, 'empty image'); return }
    if (buf.length > MAX_PHOTO_BYTES) { note('photo', loanId, `too large (${out.bytes(buf.length)})`); return }

    const key = `${args.tenant}/loans/${loanId}/${crypto.randomUUID()}.jpg`
    await putObject(key, buf, 'image/jpeg')

    const { error } = await db.from('loan_photos').upsert({
      loan_id: loanId,
      tenant_id: args.tenant,
      r2_key: key,
      byte_size: buf.length,
      mime_type: 'image/jpeg',
      checksum: crypto.createHash('sha256').update(buf).digest('hex'),
      captured_at: capturedAt,
      archived,
      archived_at: archived ? new Date().toISOString() : null,
    }, { onConflict: 'loan_id' })

    if (error) note('photo', loanId, error.message)
    else done++
  }

  // Inline blobs. Streamed one at a time — loading every LONGBLOB into memory
  // at once would exhaust the heap on a large shop.
  if (has('loan_identity_images')) {
    const [ids] = await conn.query<RowDataPacket[]>(
      'SELECT loan_id FROM loan_identity_images WHERE image_data IS NOT NULL ORDER BY loan_id'
    )
    for (const [i, row] of ids.entries()) {
      const [full] = await conn.query<RowDataPacket[]>(
        'SELECT image_data, captured_at FROM loan_identity_images WHERE loan_id = ?', [row.loan_id]
      )
      if (full[0]?.image_data) {
        await upload(Number(row.loan_id), Buffer.from(full[0].image_data), toUtcIso(full[0].captured_at), false)
      }
      out.progress(i + 1, ids.length, 'inline photos')
    }
  }

  // Archived files on disk.
  if (has('closed_record_image_archive') && args.archiveDir) {
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT loan_id, relative_path, captured_at FROM closed_record_image_archive'
    )
    for (const [i, r] of rows.entries()) {
      const p = path.join(args.archiveDir, String(r.relative_path).replace(/\\/g, path.sep))
      if (!fs.existsSync(p)) { note('photo', r.loan_id, 'archive file missing'); continue }
      await upload(Number(r.loan_id), fs.readFileSync(p), toUtcIso(r.captured_at), true)
      out.progress(i + 1, rows.length, 'archived photos')
    }
  }

  return done
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function loadValidLoanIds(db: SupabaseClient, tenantId: string): Promise<Set<number>> {
  const ids = new Set<number>()
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await db.from('loans')
      .select('id').eq('tenant_id', tenantId).range(from, from + page - 1)
    if (error) throw new Error(`loading loan ids: ${error.message}`)
    if (!data?.length) break
    data.forEach(r => ids.add(Number(r.id)))
    if (data.length < page) break
  }
  return ids
}

/**
 * Push BIGSERIAL sequences past the highest imported id.
 *
 * Without this the next INSERT reuses id 1 and fails on the primary key —
 * the first thing the shop would hit on their first day using the web app.
 * Needs the `reset_sequences_for_tenant` helper from migration 006.
 */
async function resetSequences(db: SupabaseClient, tenantId: string) {
  const { error } = await db.rpc('reset_sequences_for_tenant', { p_tenant_id: tenantId })
  if (error) throw new Error(`resetting sequences: ${error.message}`)
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`\n  ${question} [y/N] `)
  rl.close()
  return answer.trim().toLowerCase() === 'y'
}

main().catch(err => {
  console.error()
  out.fail(String(err?.message ?? err))
  if (process.env.DEBUG) console.error(err)
  process.exit(1)
})
