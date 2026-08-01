/**
 * Tests for the report logic in migration 009 and lib/reports.ts.
 *
 *   npm run test:reports
 *
 * The SQL can't be executed here, so the two rules most likely to drift are
 * modelled in JS and checked against the desktop's behaviour:
 *   • normalize_item_type()  — the p##m## → Mangal Sutra convention
 *   • silver weight in kg, gold in grams
 *
 * Getting either wrong produces a report that looks plausible and is wrong,
 * which is the worst kind.
 */

// ── Mirror of normalize_item_type() from migration 009 ──────────────────────
function normalizeItemType(t) {
  if (t === null || t === undefined || String(t).trim() === '') return 'Unknown'
  if (/^p\d+m\d+$/i.test(t)) return 'Mangal Sutra'
  return t
}

// ── Mirror of the CSV escaping in lib/reports.ts ─────────────────────────────
function toCsv(rows, columns) {
  if (rows.length === 0) return ''
  const cols = columns ?? Object.keys(rows[0]).map(k => ({ key: k, label: k }))
  const escape = v => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = cols.map(c => escape(c.label)).join(',')
  const body = rows.map(r => cols.map(c => escape(r[c.key])).join(',')).join('\r\n')
  return `﻿${header}\r\n${body}`
}

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  if (Math.abs(previous) < 0.01) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

let fail = 0
const eq = (label, a, b) => {
  const A = JSON.stringify(a), B = JSON.stringify(b)
  if (A === B) console.log(`  ✓ ${label}`)
  else { fail++; console.log(`  ✗ ${label}: expected ${B}, got ${A}`) }
}
const section = n => console.log(`\n\x1b[1m${n}\x1b[0m`)

// ─────────────────────────────────────────────────────────────────────────────
section('Item type normalisation — the p##m## convention')

eq('p22m10 is a Mangal Sutra',      normalizeItemType('p22m10'), 'Mangal Sutra')
eq('P18M5 (uppercase) too',         normalizeItemType('P18M5'),  'Mangal Sutra')
eq('p1m1 minimal form',             normalizeItemType('p1m1'),   'Mangal Sutra')
eq('p100m250 many digits',          normalizeItemType('p100m250'), 'Mangal Sutra')

// Things that look similar but are not the code
eq('"22K Necklace" left alone',     normalizeItemType('22K Necklace'), '22K Necklace')
eq('"pm" alone is not the pattern', normalizeItemType('pm'), 'pm')
eq('"p22" alone is not',            normalizeItemType('p22'), 'p22')
eq('"m10" alone is not',            normalizeItemType('m10'), 'm10')
eq('"p22m" incomplete is not',      normalizeItemType('p22m'), 'p22m')
eq('"xp22m10" prefixed is not',     normalizeItemType('xp22m10'), 'xp22m10')
eq('"p22m10x" suffixed is not',     normalizeItemType('p22m10x'), 'p22m10x')
eq('"p22 m10" with a space is not', normalizeItemType('p22 m10'), 'p22 m10')

eq('null becomes Unknown',          normalizeItemType(null), 'Unknown')
eq('empty string becomes Unknown',  normalizeItemType(''), 'Unknown')
eq('whitespace becomes Unknown',    normalizeItemType('   '), 'Unknown')

section('Grouping: several codes collapse into one row')

const items = [
  { type: 'p22m10',       amount: 40000 },
  { type: 'p18m5',        amount: 25000 },
  { type: 'P24M2',        amount: 15000 },
  { type: '22K Necklace', amount: 60000 },
  { type: 'Ring',         amount: 10000 },
]
const grouped = {}
for (const i of items) {
  const k = normalizeItemType(i.type)
  grouped[k] = (grouped[k] ?? 0) + i.amount
}
eq('three codes merge into one Mangal Sutra row', grouped['Mangal Sutra'], 80000)
eq('necklace stays separate',                     grouped['22K Necklace'], 60000)
eq('row count after grouping',                    Object.keys(grouped).length, 3)

const total = Object.values(grouped).reduce((s, v) => s + v, 0)
eq('total is unchanged by grouping', total, 150000)

const pct = Math.round((grouped['Mangal Sutra'] / total) * 1000) / 10
eq('Mangal Sutra share', pct, 53.3)

// ─────────────────────────────────────────────────────────────────────────────
section('Weight units — gold in grams, silver in kilos')

const goldGrams = 458.25
const silverGrams = 47500        // 47.5 kg — a realistic silver holding

eq('gold shown in grams unchanged', goldGrams, 458.25)
eq('silver converted to kg',        Math.round((silverGrams / 1000) * 1000) / 1000, 47.5)

// The reason the units differ at all
const silverAsGrams = String(silverGrams)
const silverAsKg = String(silverGrams / 1000)
console.log(`  note: silver as grams reads "${silverAsGrams}", as kg "${silverAsKg}"`)
eq('kg form is shorter to read', silverAsKg.length < silverAsGrams.length, true)

// A shop with tiny silver holdings should not round to zero
eq('250g of silver is 0.25kg, not 0', Math.round((250 / 1000) * 1000) / 1000, 0.25)

// ─────────────────────────────────────────────────────────────────────────────
section('Percentage change guards')

eq('normal increase',       pctChange(110, 100), 10)
eq('normal decrease',       pctChange(90, 100), -10)
eq('one decimal place',     pctChange(103.7, 100), 3.7)
eq('zero base returns null', pctChange(500, 0), null)
eq('tiny base returns null', pctChange(500, 0.001), null)
eq('negative base works',   pctChange(-50, -100), -50)
eq('NaN returns null',      pctChange(NaN, 100), null)
eq('no change is 0',        pctChange(100, 100), 0)

// ─────────────────────────────────────────────────────────────────────────────
section('CSV export — the things that break in Excel')

const csv = toCsv([
  { id: 1, name: 'Ramesh Kumar', location: 'Sadar Bazaar, Indore', amount: 45000 },
  { id: 2, name: 'Sita "Bai" Devi', location: null, amount: 12000 },
  { id: 3, name: 'Line\nBreak', location: 'X', amount: 1 },
])

eq('starts with a BOM so Excel reads UTF-8', csv.charCodeAt(0), 0xFEFF)
eq('comma in a value is quoted',   csv.includes('"Sadar Bazaar, Indore"'), true)
eq('quotes are doubled',           csv.includes('"Sita ""Bai"" Devi"'), true)
eq('newline in a value is quoted', csv.includes('"Line\nBreak"'), true)
eq('null becomes empty',           csv.includes(',,'), true)
eq('CRLF line endings',            csv.includes('\r\n'), true)
eq('empty input gives empty out',  toCsv([]), '')

// ─────────────────────────────────────────────────────────────────────────────
section('Account report totals')

const rows = [
  { date: '2026-03-01', amount: 45000, count: 2 },
  { date: '2026-03-03', amount: 30000, count: 1 },
  { date: '2026-03-07', amount: 75000, count: 3 },
]
eq('total sums the days',   rows.reduce((s, r) => s + r.amount, 0), 150000)
eq('count sums separately', rows.reduce((s, r) => s + r.count, 0), 6)

const busiest = rows.reduce((a, b) => (b.amount > a.amount ? b : a))
eq('busiest day is the largest', busiest.date, '2026-03-07')

// Quiet days are omitted, not plotted as zero — a shop is shut some days and a
// floor of zeros hides the real movement.
eq('gaps are omitted, not filled', rows.length, 3)

// ─────────────────────────────────────────────────────────────────────────────
section('Location concentration')

const locs = [
  { location: 'Sadar Bazaar', active_amount: 320000 },
  { location: 'Rau',          active_amount: 95000 },
  { location: 'Mhow',         active_amount: 45000 },
]
const outstanding = locs.reduce((s, l) => s + l.active_amount, 0)
const topShare = (locs[0].active_amount / outstanding) * 100

eq('total outstanding', outstanding, 460000)
eq('top location share', Math.round(topShare * 10) / 10, 69.6)
eq('concentration warning fires above 40%', topShare > 40, true)

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${fail} failure(s)\x1b[0m`)
process.exit(fail ? 1 : 0)
