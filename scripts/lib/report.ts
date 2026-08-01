/**
 * Console output for the migration scripts.
 *
 * These are read aloud to a shop owner over a call while their business data is
 * being moved, so clarity matters more than brevity. Anything skipped must be
 * visible — a silent drop is how you lose someone's trust permanently.
 */

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'

const useColour = process.stdout.isTTY && !process.env.NO_COLOR
const c = (code: string, s: string) => (useColour ? `${code}${s}${RESET}` : s)

export const bold = (s: string) => c(BOLD, s)
export const dim = (s: string) => c(DIM, s)

export function heading(text: string) {
  console.log(`\n${c(BOLD + CYAN, text)}`)
  console.log(c(DIM, '─'.repeat(Math.max(text.length, 40))))
}

export function info(text: string) {
  console.log(`  ${text}`)
}

export function ok(text: string) {
  console.log(`  ${c(GREEN, '✓')} ${text}`)
}

export function warn(text: string) {
  console.log(`  ${c(YELLOW, '⚠')} ${c(YELLOW, text)}`)
}

export function fail(text: string) {
  console.log(`  ${c(RED, '✗')} ${c(RED, text)}`)
}

export function kv(label: string, value: string | number, width = 34) {
  console.log(`  ${label.padEnd(width, '.')} ${bold(String(value))}`)
}

/** Right-aligned integers with thousands separators — easier to compare. */
export function num(n: number): string {
  return n.toLocaleString('en-IN')
}

export function table(rows: Array<[string, string | number, string | number]>, headers: [string, string, string]) {
  const all = [headers as unknown as [string, string, string], ...rows]
  const widths = [0, 1, 2].map(i =>
    Math.max(...all.map(r => String(r[i]).length))
  )
  const line = (r: (string | number)[], sep = ' │ ') =>
    r.map((v, i) => (i === 0 ? String(v).padEnd(widths[i]) : String(v).padStart(widths[i]))).join(sep)

  console.log(`  ${bold(line(headers))}`)
  console.log(`  ${c(DIM, widths.map(w => '─'.repeat(w)).join('─┼─'))}`)
  for (const r of rows) console.log(`  ${line(r)}`)
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

/** Single-line progress that overwrites itself, for long photo loops. */
export function progress(done: number, total: number, label: string) {
  if (!process.stdout.isTTY) return
  const pct = total ? Math.round((done / total) * 100) : 100
  process.stdout.write(`\r  ${label}: ${done}/${total} (${pct}%)   `)
  if (done >= total) process.stdout.write('\n')
}
