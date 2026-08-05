/**
 * Imports that are declared and never used.
 *
 * `@typescript-eslint/no-unused-vars` is an error in this project, so one
 * leftover import fails the Vercel build — and it has, more than once, after a
 * refactor removed the last use of something without removing the import. The
 * feedback loop for that is a push, a wait, and a red build log.
 *
 * This finds them in about a second using the TypeScript parser alone. It is
 * not a typechecker and does not pretend to be one; it answers exactly one
 * question, which happens to be the one that keeps breaking.
 *
 * Type-only usage counts as usage: an import referenced solely in a type
 * position (`const x: Foo`) is still needed, so identifiers are collected from
 * the whole tree rather than from value positions only. That direction of
 * error is the safe one — this under-reports rather than crying wolf.
 *
 * Run: node scripts/unused.js
 */
const fs = require('node:fs')
const path = require('node:path')
const ts = require(path.join(__dirname, '..', 'node_modules', 'typescript'))

const ROOT = path.join(__dirname, '..')
const SKIP = new Set(['node_modules', '.next', '.git', 'scripts'])

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else if (/\.tsx?$/.test(entry.name)) acc.push(full)
  }
  return acc
}

const problems = []
let scanned = 0

for (const file of walk(ROOT)) {
  const source = fs.readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(
    file, source, ts.ScriptTarget.ES2022, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  scanned++

  /** Local name -> the import it came from. */
  const imported = new Map()
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue
    const from = stmt.moduleSpecifier.getText(sf).replace(/['"]/g, '')
    // `import 'x'` for side effects has no clause and is skipped above.
    const clause = stmt.importClause
    if (clause.name) imported.set(clause.name.text, from)
    if (clause.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        imported.set(clause.namedBindings.name.text, from)
      } else {
        for (const el of clause.namedBindings.elements) imported.set(el.name.text, from)
      }
    }
  }
  if (imported.size === 0) continue

  // Every identifier in the file that is not itself part of an import clause.
  const used = new Set()
  ;(function visit(node) {
    if (ts.isImportDeclaration(node)) return
    if (ts.isIdentifier(node)) used.add(node.text)
    // A JSX tag name can be a qualified name (<Foo.Bar />); the leading
    // identifier is what the import provides.
    ts.forEachChild(node, visit)
  })(sf)

  for (const [name, from] of imported) {
    if (!used.has(name)) {
      problems.push({ name, from, file: path.relative(ROOT, file) })
    }
  }
}

if (problems.length === 0) {
  console.log(`unused: ${scanned} files — no unused imports`)
  process.exit(0)
}

console.error(`unused: ${problems.length} unused import(s)\n`)
for (const p of problems) {
  console.error(`  ${p.name}  (from '${p.from}')`)
  console.error(`    ${p.file}`)
}
console.error('\nThese fail the Vercel build under @typescript-eslint/no-unused-vars.')
process.exit(1)
