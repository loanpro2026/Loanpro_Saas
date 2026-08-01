/**
 * GET /api/export — download everything this shop has.
 *
 * Replaces the desktop's `exportDatabase` / `.loanprobackup`. Supabase PITR
 * covers disaster recovery; this covers something different and arguably more
 * important — a shop being able to take their own data out whenever they like,
 * without asking anyone. They have that today, and losing it would be a real
 * regression on the move to a hosted product.
 *
 * Streams a ZIP so a shop with 5,000 loans and 1,200 photos does not have to
 * hold the whole archive in memory on a Vercel function before the download
 * starts.
 */
import { NextResponse } from 'next/server'
import archiver from 'archiver'
import { PassThrough, Readable } from 'node:stream'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/tenant'
import { presignDownload } from '@/lib/r2'

// Node runtime: this needs streams and the R2 SDK, neither of which works on
// the edge runtime.
export const runtime = 'nodejs'
export const maxDuration = 300

/** Pull a table in pages. A single select on a large shop would time out. */
async function fetchAll(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  orderBy = 'id'
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  const page = 1000

  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table).select('*').order(orderBy).range(from, from + page - 1)

    if (error) {
      // A table that does not exist yet should not abort the whole export —
      // the shop still gets everything else.
      console.error(`[export] ${table}:`, error.message)
      break
    }
    if (!data?.length) break
    rows.push(...data)
    if (data.length < page) break
  }
  return rows
}

export async function GET() {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const supabase = await createClient()

  const { data: tenant } = await supabase
    .from('tenants').select('shop_name, plan, created_at').eq('id', ctx.tenantId).single()

  const archive = archiver('zip', { zlib: { level: 6 } })
  const passthrough = new PassThrough()
  archive.pipe(passthrough)

  // Build in the background; the response streams as it is produced.
  ;(async () => {
    try {
      // ── Tables ────────────────────────────────────────────────────────────
      // RLS scopes every one of these to the caller's shop, so there is no
      // tenant filter to forget.
      const tables = [
        ['loans', 'id'],
        ['deposits', 'id'],
        ['closed_record_deposits', 'id'],
        ['daily_cash_summary', 'date'],
        ['cash_transactions', 'id'],
        ['activity_log', 'id'],
        ['loan_photos', 'loan_id'],
        ['tenant_settings', 'key'],
        ['users', 'created_at'],
      ] as const

      const counts: Record<string, number> = {}
      const photoRows: Array<{ loan_id: number; r2_key: string }> = []

      for (const [table, order] of tables) {
        const rows = await fetchAll(supabase, table, order)
        counts[table] = rows.length

        if (table === 'loan_photos') {
          for (const r of rows) {
            if (r.r2_key) photoRows.push({ loan_id: Number(r.loan_id), r2_key: String(r.r2_key) })
          }
        }
        archive.append(JSON.stringify(rows, null, 2), { name: `data/${table}.json` })
      }

      // ── Photos ────────────────────────────────────────────────────────────
      // Named by loan id rather than the R2 key, so the folder is browsable by
      // someone who has never heard of object storage.
      let photosIncluded = 0
      let photosFailed = 0

      for (const p of photoRows) {
        try {
          const url = await presignDownload(p.r2_key, 300)
          const res = await fetch(url)
          if (!res.ok || !res.body) { photosFailed++; continue }

          archive.append(Readable.fromWeb(res.body as any), {
            name: `photos/loan-${p.loan_id}.jpg`,
          })
          photosIncluded++
        } catch {
          photosFailed++
        }
      }

      // ── Manifest ──────────────────────────────────────────────────────────
      const manifest = {
        export_version: 1,
        shop_name: tenant?.shop_name ?? null,
        exported_at: new Date().toISOString(),
        exported_at_ist: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        timezone_note:
          'All timestamps in these files are UTC. Dates (issue_date, deposit_date, ' +
          'closed_date) have no timezone and are the shop\'s local calendar dates.',
        counts,
        photos: { included: photosIncluded, failed: photosFailed },
      }
      archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })

      archive.append(README(tenant?.shop_name ?? 'your shop', counts, photosIncluded),
        { name: 'README.txt' })

      await archive.finalize()
    } catch (err) {
      console.error('[export] failed', err)
      archive.abort()
    }
  })()

  const stamp = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
  const safeName = (tenant?.shop_name ?? 'loanpro')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'loanpro'

  return new NextResponse(Readable.toWeb(passthrough) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName}-export-${stamp}.zip"`,
      // The archive is built as it streams, so there is no length to declare.
      'Cache-Control': 'no-store',
    },
  })
}

function README(shop: string, counts: Record<string, number>, photos: number): string {
  return `LoanPro data export — ${shop}
${'='.repeat(60)}

This is everything on your account, in open formats. It is yours; you do not
need LoanPro to read it.

WHAT IS IN HERE
---------------
  manifest.json     What was exported, when, and how many of each.
  data/*.json       One file per table. Plain JSON — any spreadsheet tool,
                    programming language or database can read it.
  photos/           Customer photos, named by loan number.

YOUR RECORDS
------------
  Loans             ${counts.loans ?? 0}
  Deposits          ${counts.deposits ?? 0}
  Closed-record deposits  ${counts.closed_record_deposits ?? 0}
  Cash transactions ${counts.cash_transactions ?? 0}
  Daily cash summary rows ${counts.daily_cash_summary ?? 0}
  Photos            ${photos}

READING THE MONEY FIELDS
------------------------
  loans.amount      The principal, in rupees.
  loans.interest    The interest CHARGED, in rupees, written when the loan was
                    closed. It is empty on active loans. It is not a rate.
  deposits.amount   Part-payments made against a loan.

  When a loan is closed its deposits move from deposits.json to
  closed_record_deposits.json. Both files together are the full history.

DATES
-----
  issue_date, deposit_date, closed_date have no timezone — they are the
  calendar dates as entered at the shop.
  Anything ending in _at or _timestamp is UTC. India is UTC+5:30, so
  2026-03-01T03:30:00Z is 9:00am on 1 March.

Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
`
}
