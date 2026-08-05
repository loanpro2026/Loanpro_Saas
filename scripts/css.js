/**
 * Find Tailwind classes that silently do nothing.
 *
 * A misspelled utility is not an error anywhere. Tailwind does not warn,
 * TypeScript cannot see inside a string, ESLint has no opinion, and the build
 * succeeds — the class simply produces no CSS and the element renders without
 * the style you thought you gave it. `opacity-55` looks exactly like
 * `opacity-60` in a diff and does nothing at all, because Tailwind's opacity
 * scale has no 55. `gap-4.5`, `mt-7.5`, `text-13.5` on a project that never
 * defined 13.5 — same story.
 *
 * A handful of those across a codebase is a real part of what "the UI looks
 * unfinished" is: paddings that never applied, a weight that never took, a
 * breakpoint that never fired. Nothing is broken enough to notice directly;
 * it just never looks right.
 *
 * Method: resolve the project's actual Tailwind theme (so the config's own
 * extensions count as valid), collect every class token in the source, and
 * check each numeric utility's value against the scale that utility reads
 * from. Only families where a wrong number is plausible and silent are
 * checked, and only when the value is a bare number — arbitrary values in
 * brackets are always legal and our own component classes are not Tailwind's
 * business.
 *
 * Run: node scripts/css.js
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')

// Load the TS config the same way Tailwind does.
require(path.join(ROOT, 'node_modules', 'jiti'))
const jiti = require(path.join(ROOT, 'node_modules', 'jiti'))(__filename, { interopDefault: true })
const userConfig = jiti(path.join(ROOT, 'tailwind.config.ts'))
const resolveConfig = require(path.join(ROOT, 'node_modules', 'tailwindcss', 'resolveConfig'))
const theme = resolveConfig(userConfig.default ?? userConfig).theme

/**
 * Which theme scale each utility family reads from.
 *
 * Tailwind's own resolution order is what matters here: `p-*` falls back to
 * `spacing`, `w-*` reads `width` (which itself spreads `spacing`), and so on.
 * Using the resolved theme means a project that adds its own steps — this one
 * adds several font sizes — is checked against what it actually defined.
 */
const FAMILIES = {
  opacity: 'opacity',
  p: 'padding',   px: 'padding', py: 'padding',
  pt: 'padding',  pb: 'padding', pl: 'padding', pr: 'padding',
  m: 'margin',    mx: 'margin',  my: 'margin',
  mt: 'margin',   mb: 'margin',  ml: 'margin',  mr: 'margin',
  gap: 'gap', 'gap-x': 'gap', 'gap-y': 'gap',
  'space-x': 'space', 'space-y': 'space',
  w: 'width', h: 'height', 'min-w': 'minWidth', 'min-h': 'minHeight',
  'max-w': 'maxWidth', 'max-h': 'maxHeight',
  text: 'fontSize', font: 'fontWeight', leading: 'lineHeight',
  tracking: 'letterSpacing', rounded: 'borderRadius',
  'grid-cols': 'gridTemplateColumns',
  z: 'zIndex', order: 'order', basis: 'flexBasis',
  // Deliberately not col-span / row-span. Their theme keys are "span-2", not
  // "2", so checking the bare number reported every correct usage in the
  // codebase as broken. They are a fixed built-in 1–12 scale with nothing
  // project-specific to get wrong, so there is nothing here worth checking.
  top: 'inset', bottom: 'inset', left: 'inset', right: 'inset', inset: 'inset',
}

/** Families where the value is also legal as a colour name, so a bare number
 *  is the only thing worth checking (`text-13` yes, `text-ink` no). */
function valueIsNumeric(value) {
  return /^\d+(\.\d+)?$/.test(value) || /^\d+\/\d+$/.test(value)
}

function sourceFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, acc)
    else if (/\.(tsx|jsx)$/.test(entry.name)) acc.push(full)
  }
  return acc
}

/**
 * Strip comments before scanning.
 *
 * Without this the checker reads its own documentation. A comment explaining
 * that `text-16` was a dead class contains a backtick-quoted `text-16`, which
 * the string scanner below matches as happily as a real className — so fixing
 * the bug and describing the fix in the same commit left the check still
 * failing, pointing at the sentence that says it was fixed.
 *
 * Line comments are only stripped when `//` is not preceded by a colon, so
 * `https://…` inside a real string survives.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Every whitespace-separated token inside any string literal in the file.
 *  Over-collects on purpose — non-utilities are filtered out below. */
function classTokens(source) {
  const out = new Set()
  const strings = /(["'`])([^"'`\n]{2,400})\1/g
  let m
  while ((m = strings.exec(source))) {
    for (const tok of m[2].split(/\s+/)) {
      const clean = tok.trim()
      if (clean && /^[a-z0-9:./[\]-]+$/i.test(clean)) out.add(clean)
    }
  }
  return out
}

/** Strip responsive/state variants: `lg:hover:opacity-55` -> `opacity-55`. */
const baseUtility = token => token.split(':').pop().replace(/^!/, '')

/** Longest family prefix wins, so `min-w-4` is minWidth and not `m`. */
function split(util) {
  let best = null
  for (const family of Object.keys(FAMILIES)) {
    if (util.startsWith(family + '-') && (!best || family.length > best.length)) best = family
  }
  return best ? { family: best, value: util.slice(best.length + 1) } : null
}

const files = sourceFiles(path.join(ROOT, 'app')).concat(sourceFiles(path.join(ROOT, 'components')))

const problems = []
const seen = new Map()
let checked = 0

for (const file of files) {
  const source = stripComments(fs.readFileSync(file, 'utf8'))
  for (const token of classTokens(source)) {
    const util = baseUtility(token)
    if (util.startsWith('-')) continue
    const parts = split(util)
    if (!parts) continue
    if (!valueIsNumeric(parts.value)) continue

    checked++
    const scale = theme[FAMILIES[parts.family]] ?? {}
    if (Object.prototype.hasOwnProperty.call(scale, parts.value)) continue

    if (!seen.has(util)) {
      seen.set(util, true)
      problems.push({
        util,
        family: parts.family,
        scale: FAMILIES[parts.family],
        file: path.relative(ROOT, file),
        nearest: Object.keys(scale)
          .filter(k => /^\d+(\.\d+)?$/.test(k))
          .sort((a, b) => Math.abs(a - parts.value) - Math.abs(b - parts.value))
          .slice(0, 3),
      })
    }
  }
}

if (problems.length === 0) {
  console.log(`css: ${checked} numeric utilities across ${files.length} files — all resolve`)
  process.exit(0)
}

console.error(`css: ${problems.length} class(es) produce no CSS\n`)
for (const p of problems) {
  console.error(`  ${p.util}`)
  console.error(`    ${p.file}`)
  console.error(`    theme.${p.scale} has no "${p.util.slice(p.family.length + 1)}"` +
    (p.nearest.length ? ` — nearest: ${p.nearest.map(n => `${p.family}-${n}`).join(', ')}` : ''))
}
console.error('\nThese are silently doing nothing.')
process.exit(1)
