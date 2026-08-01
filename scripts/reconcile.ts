#!/usr/bin/env tsx
/**
 * reconcile — prove the migration lost nothing.
 *
 *   npm run migrate:reconcile -- --tenant <uuid>
 *
 * Pulls the same totals from the desktop MySQL and from Supabase and prints
 * them side by side. Run this with the shop owner watching, before they start
 * entering anything on the web app.
 *
 * The point is not that the script says "OK" — it is that the owner sees their
 * own outstanding total, their own loan count and their own cash position
 * match the numbers they already know. That is what makes someone comfortable
 * switching systems; a green tick from a tool they have never seen before does
 * not.
 *
 * Exit code is 1 if anything mismatches, so this can gate a deploy.
 */
import { createClient } from '@supabase/supabase-js'
import type { RowDataPacket } from 'mysql2'

import { connect, type SourceConfig } from './lib/source'
import * as out from './lib/report'

interface Args { tenant: string; mysql: SourceConfig; tolerance: number }

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (f: string, d?: string) => {
    const i = argv.indexOf(f)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d
  }
  const tenant = get('--tenant') ?? ''
  if (!tenant) {
    console.log(`
${out.bold('reconcile')} — compare desktop MySQL against Supabase

  --tenant <uuid>       tenant to check (required)
  --tolerance <n>       allowed absolute difference on money totals (default 0)
  --mysql-host/-port/-user/-password/-database   as per migrate-tenant
`)
    process.exit(1)
  }
  return {
    tenant,
    tolerance: Number(get('--tolerance', '0')),
    mysql: {
      host: get('--mysql-host', process.env.MIGRATE_MYSQL_HOST ?? '127.0.0.1')!,
      port: Number(get('--mysql-port', process.env.MIGRATE_MYSQL_PORT ?? '3307')),
      user: get('--mysql-user', process.env.MIGRATE_MYSQL_USER ?? 'root')!,
      password: get('--mysql-password', process.env.MIGRATE_MYSQL_PASSWORD ?? '')!,
      database: get('--mysql-database', process.env.MIGRATE_MYSQL_DATABASE ?? 'loan_management')!,
    },
  }
}

/** Rows we compare. `money` fields honour --tolerance; others must match exactly. */
const CHECKS: Array<{ key: string; label: string; money?: boolean; info?: boolean }> = [
  { key: 'loans_active',      label: 'Active loans' },
  { key: 'loans_closed',      label: 'Closed loans' },
  { key: 'amount_active',     label: 'Outstanding (active)', money: true },
  { key: 'weight_active',     label: 'Weight held (active)', money: true },
  { key: 'deposits_count',    label: 'Deposits' },
  { key: 'deposits_total',    label: 'Deposits total',       money: true },
  { key: 'closed_deposits',   label: 'Closed-record deposits' },
  { key: 'cash_tx_count',     label: 'Cash transactions' },
  { key: 'cash_added',        label: 'Cash added',           money: true },
  { key: 'cash_removed',      label: 'Cash removed',         money: true },
  { key: 'activity_count',    label: 'Activity log entries' },
  { key: 'photos_count',      label: 'Photos',               info: true },
  { key: 'oldest_issue_date', label: 'Oldest loan date' },
  { key: 'newest_issue_date', label: 'Newest loan date' },
  { key: 'min_loan_id',       label: 'Lowest loan number' },
  { key: 'max_loan_id',       label: 'Highest loan number' },
]

async function main() {
  const args = parseArgs()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')

  const conn = await connect(args.mysql)
  const db = createClient(url, key, { auth: { persistSession: false } })

  try {
    out.heading('Reconciliation')
    out.kv('Desktop', `${args.mysql.host}:${args.mysql.port}/${args.mysql.database}`)
    out.kv('Tenant', args.tenant)

    // ── Source totals ───────────────────────────────────────────────────────
    const tableExists = async (t: string) => {
      const [r] = await conn.query<RowDataPacket[]>(
        'SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        [args.mysql.database, t]
      )
      return Number(r[0].n) > 0
    }

    const [loanRows] = await conn.query<RowDataPacket[]>(`
      SELECT
        SUM(status='active')                                    AS loans_active,
        SUM(status='closed')                                    AS loans_closed,
        COALESCE(SUM(CASE WHEN status='active' THEN amount END),0) AS amount_active,
        COALESCE(SUM(CASE WHEN status='active' THEN weight END),0) AS weight_active,
        MIN(issue_date) AS oldest_issue_date,
        MAX(issue_date) AS newest_issue_date,
        MIN(id) AS min_loan_id,
        MAX(id) AS max_loan_id
      FROM loans
    `)
    const [depRows] = await conn.query<RowDataPacket[]>(
      'SELECT COUNT(*) deposits_count, COALESCE(SUM(amount),0) deposits_total FROM deposits'
    )
    const [cashRows] = await conn.query<RowDataPacket[]>(`
      SELECT COUNT(*) cash_tx_count,
             COALESCE(SUM(CASE WHEN type='add'    THEN amount END),0) cash_added,
             COALESCE(SUM(CASE WHEN type='remove' THEN amount END),0) cash_removed
        FROM cash_transactions
    `)
    const [actRows] = await conn.query<RowDataPacket[]>('SELECT COUNT(*) activity_count FROM activity_log')

    let closedDeposits = 0
    if (await tableExists('closed_record_deposits')) {
      const [r] = await conn.query<RowDataPacket[]>('SELECT COUNT(*) n FROM closed_record_deposits')
      closedDeposits = Number(r[0].n)
    }

    let sourcePhotos = 0
    if (await tableExists('loan_identity_images')) {
      const [r] = await conn.query<RowDataPacket[]>(
        'SELECT COUNT(*) n FROM loan_identity_images WHERE image_data IS NOT NULL')
      sourcePhotos += Number(r[0].n)
    }
    if (await tableExists('closed_record_image_archive')) {
      const [r] = await conn.query<RowDataPacket[]>('SELECT COUNT(*) n FROM closed_record_image_archive')
      sourcePhotos += Number(r[0].n)
    }

    const source: Record<string, unknown> = {
      ...loanRows[0], ...depRows[0], ...cashRows[0], ...actRows[0],
      closed_deposits: closedDeposits,
      photos_count: sourcePhotos,
    }

    // ── Target totals ───────────────────────────────────────────────────────
    const { data: target, error } = await db.rpc('tenant_totals', { p_tenant_id: args.tenant })
    if (error) throw new Error(`tenant_totals: ${error.message}. Did migration 006 run?`)

    // ── Compare ─────────────────────────────────────────────────────────────
    out.heading('Desktop vs Web')

    const norm = (v: unknown): string => {
      if (v === null || v === undefined) return '—'
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
      const n = Number(v)
      return Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : String(v)
    }

    const rows: Array<[string, string, string]> = []
    let mismatches = 0
    let photoNote = false

    for (const chk of CHECKS) {
      const a = norm(source[chk.key])
      const b = norm((target as Record<string, unknown>)[chk.key])

      let same = a === b
      if (!same && chk.money && args.tolerance > 0) {
        same = Math.abs(Number(a) - Number(b)) <= args.tolerance
      }

      // Photos are expected to differ if --skip-photos or --archive-dir was
      // omitted, so flag rather than fail.
      if (!same && chk.info) { photoNote = true; same = true }
      else if (!same) mismatches++

      rows.push([chk.label + (same ? '' : '  ✗'), a, b])
    }

    out.table(rows, ['Check', 'Desktop', 'Web'])

    // ── Verdict ─────────────────────────────────────────────────────────────
    out.heading('Result')

    if (photoNote) {
      out.warn('Photo counts differ.')
      out.info('Expected if you ran with --skip-photos, or without --archive-dir')
      out.info('(closed-record photos live on disk, not in MySQL).')
    }

    if (mismatches === 0) {
      out.ok('Everything matches.')
      out.info('')
      out.info('Walk the shop owner through the table above before they start')
      out.info('using the web app. These should be numbers they recognise.')
    } else {
      out.fail(`${mismatches} mismatch(es) — do NOT go live yet.`)
      out.info('')
      out.info('Common causes:')
      out.info('  • loans skipped for missing issue_date or name — check the issues CSV')
      out.info('  • cash_transactions skipped because the tenant already had rows')
      out.info('  • data entered on the desktop after the migration ran')
      process.exit(1)
    }

    // Loan numbers must survive intact — the shop reads them off paper tickets
    // attached to the jewellery in the safe.
    if (norm(source.min_loan_id) === norm((target as any).min_loan_id) &&
        norm(source.max_loan_id) === norm((target as any).max_loan_id)) {
      out.ok('Loan numbers preserved exactly')
    }

  } finally {
    await conn.end()
  }
}

main().catch(err => {
  console.error()
  out.fail(String(err?.message ?? err))
  process.exit(1)
})
