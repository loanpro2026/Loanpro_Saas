/**
 * Report helpers shared by the reports pages.
 *
 * CSV export lives here rather than in a component because a shop's most
 * common follow-up to any report is "send it to my accountant", and every
 * report type needs the same treatment.
 */

export type ReportKey =
  | 'daily' | 'investment' | 'returns' | 'account'
  | 'location' | 'inventory'

export const REPORTS: Array<{
  key: ReportKey
  title: string
  description: string
  /** Which date control the report needs. */
  input: 'single-date' | 'date-range' | 'none'
}> = [
  { key: 'daily',      title: 'Daily report',     input: 'single-date',
    description: 'Cash in, cash out and closing balance for one day' },
  { key: 'investment', title: 'Investment',       input: 'single-date',
    description: 'Loans issued on a given day' },
  { key: 'returns',    title: 'Returns',          input: 'single-date',
    description: 'Loans settled on a given day, with interest earned' },
  { key: 'account',    title: 'Account summary',  input: 'date-range',
    description: 'Day-by-day investment, returns or interest over a period' },
  { key: 'location',   title: 'By location',      input: 'date-range',
    description: 'Where the shop’s money is lent out' },
  { key: 'inventory',  title: 'Inventory',        input: 'none',
    description: 'What is currently held in the safe' },
]

// Date helpers (todayIST, daysAgoIST) live in lib/utils — one definition of
// "today" for the whole codebase. Import them from there, not here.

/**
 * Column definitions per report, shared by CSV and PDF export.
 *
 * One definition rather than two: a shop that exports the same report as CSV
 * and as PDF and gets different columns will reasonably assume one of them is
 * wrong. It also means the raw database column names (`item_type`,
 * `total_amount`) never leak into a document an accountant reads.
 */
export interface ExportColumn {
  key: string
  label: string
  numeric?: boolean
}

export const REPORT_COLUMNS: Record<ReportKey, ExportColumn[]> = {
  daily: [
    { key: 'label', label: 'Item' },
    { key: 'value', label: 'Amount', numeric: true },
  ],
  investment: [
    { key: 'id',            label: 'Loan #',    numeric: true },
    { key: 'name',          label: 'Customer' },
    { key: 'father_name',   label: "Father's name" },
    { key: 'location',      label: 'Place' },
    { key: 'category_type', label: 'Metal' },
    { key: 'detailed_type', label: 'Item' },
    { key: 'weight',        label: 'Weight (g)', numeric: true },
    { key: 'amount',        label: 'Amount',     numeric: true },
    { key: 'status',        label: 'Status' },
  ],
  returns: [
    { key: 'id',                 label: 'Loan #',     numeric: true },
    { key: 'name',               label: 'Customer' },
    { key: 'location',           label: 'Place' },
    { key: 'detailed_type',      label: 'Item' },
    { key: 'amount',             label: 'Principal',  numeric: true },
    { key: 'interest',           label: 'Interest',   numeric: true },
    { key: 'deposits_collected', label: 'Deposits',   numeric: true },
    { key: 'total_return',       label: 'Total',      numeric: true },
    { key: 'days_held',          label: 'Days',       numeric: true },
  ],
  account: [
    { key: 'date',       label: 'Date' },
    { key: 'count',      label: 'Count',   numeric: true },
    { key: 'avg_amount', label: 'Average', numeric: true },
    { key: 'amount',     label: 'Total',   numeric: true },
  ],
  location: [
    { key: 'location',      label: 'Place' },
    { key: 'loan_count',    label: 'Loans',       numeric: true },
    { key: 'active_count',  label: 'Active',      numeric: true },
    { key: 'closed_count',  label: 'Closed',      numeric: true },
    { key: 'avg_amount',    label: 'Average',     numeric: true },
    { key: 'active_amount', label: 'Outstanding', numeric: true },
  ],
  inventory: [
    { key: 'category_type', label: 'Metal' },
    { key: 'item_type',     label: 'Item' },
    { key: 'item_count',    label: 'Count',      numeric: true },
    { key: 'total_weight',  label: 'Weight (g)', numeric: true },
    { key: 'total_amount',  label: 'Value',      numeric: true },
  ],
}

/** Reports wide enough that portrait A4 would squeeze the columns. */
export const LANDSCAPE_REPORTS: ReportKey[] = ['investment', 'returns', 'location']

/**
 * Convert rows to CSV.
 *
 * Excel is the destination for most of these. Two things matter:
 *   • A leading BOM, or Excel mangles rupee signs and Indian names.
 *   • Quoting anything containing a comma, quote or newline — addresses and
 *     remarks routinely contain all three.
 */
export function toCsv(
  rows: Record<string, unknown>[],
  columns?: Array<{ key: string; label: string }>
): string {
  if (rows.length === 0) return ''

  const cols = columns ?? Object.keys(rows[0]).map(k => ({ key: k, label: k }))

  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const header = cols.map(c => escape(c.label)).join(',')
  const body = rows.map(r => cols.map(c => escape(r[c.key])).join(',')).join('\r\n')

  return `﻿${header}\r\n${body}`
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Percentage change, guarding the zero base.
 * Returns null when there is no meaningful comparison — the UI shows "—"
 * rather than an infinity or a misleading 100%.
 */
export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  if (Math.abs(previous) < 0.01) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

/** Indian numbering: 1,23,456 rather than 123,456. */
export function formatIndian(n: number): string {
  return new Intl.NumberFormat('en-IN').format(Math.round(n))
}

export function formatWeightUnit(value: number, unit: 'g' | 'kg'): string {
  return `${value.toLocaleString('en-IN', { maximumFractionDigits: 3 })}${unit}`
}
