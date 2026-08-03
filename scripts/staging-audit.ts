#!/usr/bin/env tsx
/**
 * Read-only staging audit for a migrated tenant.
 *
 * Runs the same query shapes used by the large record lists and detail pages,
 * reports remote latency, and verifies that server-side pagination remains
 * bounded. It never inserts, updates, deletes, uploads, or invokes a mutation
 * RPC. Run this against staging after importing a copied desktop database.
 */
import { performance } from 'node:perf_hooks'

import { createClient, type PostgrestError } from '@supabase/supabase-js'

import type { Database } from '../types/supabase'
import * as out from './lib/report'

type Args = { tenant: string; budgetMs: number; runs: number }
type Measurement = { label: string; average: number; maximum: number; rows: number | null }

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const value = (flag: string, fallback = '') => {
    const index = argv.indexOf(flag)
    return index >= 0 ? argv[index + 1] ?? fallback : fallback
  }
  const tenant = value('--tenant')
  const budgetMs = Number(value('--budget-ms', '1500'))
  const runs = Number(value('--runs', '3'))

  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(tenant)) {
    throw new Error('--tenant must be the staging tenant UUID')
  }
  if (!Number.isFinite(budgetMs) || budgetMs < 100 || budgetMs > 30000) {
    throw new Error('--budget-ms must be between 100 and 30000')
  }
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) {
    throw new Error('--runs must be an integer between 1 and 10')
  }
  return { tenant, budgetMs, runs }
}

function assertResult<T>(result: { data: T; error: PostgrestError | null }, label: string): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result.data
}

async function main() {
  const args = parseArgs()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }

  const db = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-loanpro-audit': 'staging-read-only' } },
  })

  out.heading('LoanPro staging query audit')
  out.kv('Tenant', args.tenant)
  out.kv('Latency budget', `${args.budgetMs} ms maximum`)
  out.kv('Samples per query', args.runs)

  const counts: Record<string, number> = {}
  for (const status of ['active', 'closed'] as const) {
    const result = await db.from('loans')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', args.tenant)
      .eq('status', status)
    if (result.error) throw new Error(`${status} count: ${result.error.message}`)
    counts[status] = result.count ?? 0
  }

  const sampleResult = await db.from('loans')
    .select('id,name,issue_date,amount')
    .eq('tenant_id', args.tenant)
    .order('issue_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
  const sample = (assertResult(sampleResult, 'sample loan') ?? [])[0]
  if (!sample) throw new Error('The staging tenant has no loans to audit')

  const measurements: Measurement[] = []
  async function measure(
    label: string,
    query: () => PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }>,
    maxRows = 50,
  ) {
    const durations: number[] = []
    let rows: number | null = null
    for (let run = 0; run < args.runs; run++) {
      const started = performance.now()
      const result = await query()
      durations.push(performance.now() - started)
      const data = assertResult(result, label)
      rows = data?.length ?? 0
      if (rows > maxRows) throw new Error(`${label}: returned ${rows} rows; expected at most ${maxRows}`)
    }
    measurements.push({
      label,
      average: durations.reduce((sum, value) => sum + value, 0) / durations.length,
      maximum: Math.max(...durations),
      rows,
    })
  }

  const listColumns = 'id,name,father_name,location,amount,category_type,detailed_type,weight,issue_date,status,closed_date'

  await measure('Active records — first 50', () => db.from('loans')
    .select(listColumns)
    .eq('tenant_id', args.tenant).eq('status', 'active')
    .order('issue_date', { ascending: false }).order('id', { ascending: false })
    .limit(50))

  await measure('Closed records — first 50', () => db.from('loans')
    .select(listColumns)
    .eq('tenant_id', args.tenant).eq('status', 'closed')
    .order('closed_date', { ascending: false }).order('id', { ascending: false })
    .limit(50))

  await measure('Exact loan-number lookup', () => db.from('loans')
    .select(listColumns)
    .eq('tenant_id', args.tenant).eq('id', sample.id)
    .limit(50))

  const nameTerm = String(sample.name ?? '').replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 3)
  if (nameTerm) {
    await measure('Customer-name filter', () => db.from('loans')
      .select(listColumns)
      .eq('tenant_id', args.tenant).ilike('name', `%${nameTerm}%`)
      .order('issue_date', { ascending: false }).order('id', { ascending: false })
      .limit(50))
  }

  await measure('Issue-date and amount filters', () => db.from('loans')
    .select(listColumns)
    .eq('tenant_id', args.tenant)
    .gte('issue_date', '2000-01-01')
    .gte('amount', 0)
    .order('issue_date', { ascending: false }).order('id', { ascending: false })
    .limit(50))

  await measure('Loan deposit history', () => db.from('deposits')
    .select('id,loan_id,amount,deposit_date,created_at')
    .eq('tenant_id', args.tenant).eq('loan_id', sample.id)
    .order('deposit_date', { ascending: false })
    .limit(50))

  const globalTerm = nameTerm || String(sample.id)
  await measure('Global loan search', () => db.from('loans')
    .select(listColumns)
    .eq('tenant_id', args.tenant)
    .or(`id.eq.${sample.id},name.ilike.%${globalTerm}%,father_name.ilike.%${globalTerm}%,location.ilike.%${globalTerm}%`)
    .order('issue_date', { ascending: false }).order('id', { ascending: false })
    .limit(20), 20)

  const totalsStarted = performance.now()
  const totalsResult = await db.rpc('tenant_totals', { p_tenant_id: args.tenant })
  assertResult(totalsResult, 'tenant totals')
  const totalsMs = performance.now() - totalsStarted
  measurements.push({ label: 'Migration totals and integrity summary', average: totalsMs, maximum: totalsMs, rows: 1 })

  out.heading('Dataset')
  out.table([
    ['Active loans', String(counts.active), 'records'],
    ['Closed loans', String(counts.closed), 'records'],
    ['Total loans', String(counts.active + counts.closed), 'records'],
    ['Sample loan', `#${sample.id}`, ''],
  ], ['Measure', 'Value', 'Unit'])

  out.heading('Remote query timings')
  out.table(measurements.map(item => [
    item.label,
    `${Math.round(item.average)} / ${Math.round(item.maximum)} ms`,
    String(item.rows ?? '—'),
  ]), ['Query', 'Average / maximum', 'Rows'])

  const slow = measurements.filter(item => item.maximum > args.budgetMs)
  out.heading('Result')
  if (slow.length) {
    for (const item of slow) out.fail(`${item.label}: ${Math.round(item.maximum)} ms`)
    throw new Error(`${slow.length} query shape(s) exceeded the ${args.budgetMs} ms budget`)
  }
  out.ok('All audited query shapes stayed bounded and within the latency budget.')
  out.info('This audit was read-only; no staging records were changed.')
}

main().catch(error => {
  out.fail(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
