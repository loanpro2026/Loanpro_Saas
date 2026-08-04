/**
 * Checks that every class used with `@apply` in app/globals.css resolves
 * against the theme in tailwind.config.ts.
 *
 * Tailwind fails the build on an unknown `@apply` target, but that failure only
 * surfaces when the whole app compiles. This runs in under a second with no
 * dependencies, so a mistyped token — `text-ink-mutd`, `bg-green-bgg` — is
 * caught on the spot rather than at the end of a build.
 *
 * It is deliberately narrow: it validates the theme-driven part of a utility
 * (the colour, the size step, the shadow, the radius) and ignores core
 * utilities that carry no theme value, since those are Tailwind's problem, not
 * this project's.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const css = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8')
const config = fs.readFileSync(path.join(ROOT, 'tailwind.config.ts'), 'utf8')

/** Colour names available as `text-x`, `bg-x`, `border-x`, `ring-x`, … */
function colourNames() {
  const start = config.indexOf('colors: {')
  if (start === -1) throw new Error('tailwind.config.ts: no colors block')

  // Walk to the matching brace so nested scales are captured whole.
  let depth = 0
  let end = start
  for (let i = config.indexOf('{', start); i < config.length; i++) {
    if (config[i] === '{') depth++
    else if (config[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  const block = config.slice(start, end)

  const names = new Set()
  // Top-level families and, for each, its nested keys.
  const familyRe = /^\s{8}([a-zA-Z][\w-]*):\s*(\{|'|")/gm
  let match
  while ((match = familyRe.exec(block))) {
    const family = match[1]
    names.add(family)
    if (match[2] !== '{') continue

    let d = 0
    let i = block.indexOf('{', match.index)
    const from = i
    for (; i < block.length; i++) {
      if (block[i] === '{') d++
      else if (block[i] === '}') { d--; if (d === 0) break }
    }
    const inner = block.slice(from, i)
    const keyRe = /^\s+(DEFAULT|[a-zA-Z0-9][\w.]*):/gm
    let key
    while ((key = keyRe.exec(inner))) {
      names.add(key[1] === 'DEFAULT' ? family : `${family}-${key[1]}`)
    }
  }
  return names
}

/** Keys of a simple `name: { ... }` theme section, e.g. fontSize or boxShadow. */
function sectionKeys(section) {
  const start = config.indexOf(`${section}: {`)
  if (start === -1) return new Set()
  let depth = 0
  let end = start
  for (let i = config.indexOf('{', start); i < config.length; i++) {
    if (config[i] === '{') depth++
    else if (config[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  const block = config.slice(start, end)
  const keys = new Set()
  const re = /^\s+'?([\w.-]+)'?:\s*[[']/gm
  let match
  while ((match = re.exec(block))) keys.add(match[1])
  return keys
}

const colours = colourNames()
const fontSizes = sectionKeys('fontSize')
const shadows = sectionKeys('boxShadow')
const radii = sectionKeys('borderRadius')

// Directional variants take the same theme values as their base utility, so
// they are listed as prefixes in their own right.
const SIDES = ['t', 'r', 'b', 'l', 'x', 'y']
const CORNERS = ['t', 'r', 'b', 'l', 'tl', 'tr', 'bl', 'br', 's', 'e']

// Utilities whose value comes from the theme sections above.
const CHECKS = [
  {
    prefixes: [
      'text', 'bg', 'ring', 'ring-offset', 'from', 'via', 'to', 'divide',
      'placeholder', 'fill', 'stroke', 'accent', 'caret', 'outline', 'decoration',
      'shadow', 'border',
      ...SIDES.map(side => `border-${side}`),
      ...SIDES.map(side => `divide-${side}`),
    ],
    set: colours,
  },
  { prefixes: ['text'], set: fontSizes },
  { prefixes: ['shadow'], set: shadows },
  { prefixes: ['rounded', ...CORNERS.map(corner => `rounded-${corner}`)], set: radii },
]

const problems = []
const applied = new Set()

for (const [, body] of css.matchAll(/@apply\s+([^;]+);/g)) {
  for (const raw of body.split(/\s+/).filter(Boolean)) {
    // Drop variants (hover:, dark:, sm:) and any opacity modifier.
    const bare = raw.split(':').pop().split('/')[0]
    if (!bare || bare.startsWith('!')) continue
    // Arbitrary values are literal CSS; nothing to resolve.
    if (bare.includes('[')) continue
    applied.add(bare)
  }
}

for (const token of applied) {
  // Only judge tokens whose prefix is one we own a theme section for.
  const candidates = CHECKS.flatMap(check =>
    check.prefixes
      .filter(prefix => token.startsWith(`${prefix}-`))
      .map(prefix => ({ check, value: token.slice(prefix.length + 1), prefix }))
  )
  if (candidates.length === 0) continue

  // A token is fine if ANY interpretation resolves — `text-13` is a font size,
  // `text-ink` a colour, and both arrive through the same prefix.
  if (candidates.some(({ check, value }) => check.set.has(value))) continue

  // Core utilities that legitimately share these prefixes and carry no theme
  // value of ours: widths, sides, gradient directions, Tailwind's own scales.
  const CORE = /^(transparent|current|inherit|white|black|none|auto|full|solid|dashed|dotted|left|right|center|justify|balance|nowrap|wrap|ellipsis|clip|px|[trblxy]|sm|md|lg|xl|2xl|3xl|inner|gradient-to-[trbl]{1,2}|\d+(\.\d+)?)$/

  if (candidates.some(({ value }) => CORE.test(value))) continue
  problems.push(token)
}

if (problems.length) {
  console.error('\n\x1b[31mUnresolved @apply targets in app/globals.css:\x1b[0m')
  for (const token of problems.sort()) console.error(`  ${token}`)
  console.error('\nAdd them to tailwind.config.ts or fix the spelling.\n')
  process.exit(1)
}

console.log(`\n\x1b[32m${applied.size} @apply target(s) resolve against the theme\x1b[0m`)
