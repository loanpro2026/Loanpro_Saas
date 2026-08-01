const ts = require('typescript');
const fs = require('fs'), path = require('path');
const ROOT = require('path').resolve(__dirname,'..');

const files = [];
(function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) {
  const p = path.join(d,e.name);
  if (e.isDirectory()) { if(!['node_modules','.next','.git'].includes(e.name)) walk(p); }
  else if (/\.tsx?$/.test(e.name)) files.push(p);
}})(ROOT);

const parse = f => ts.createSourceFile(f, fs.readFileSync(f,'utf8'), ts.ScriptTarget.ES2022, true,
  f.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);

// collect exports per file
const exportsOf = {};
for (const f of files) {
  const sf = parse(f); const names = new Set();
  sf.forEachChild(n => {
    const mods = ts.canHaveModifiers(n) ? (ts.getModifiers(n)||[]) : [];
    // `export { a, b } from './x'` and `export { a }` carry no modifiers.
    if (ts.isExportDeclaration(n)) {
      if (n.exportClause && ts.isNamedExports(n.exportClause))
        n.exportClause.elements.forEach(e => names.add(e.name.getText(sf)));
      return;
    }
    const isExp = mods.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    const isDef = mods.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (!isExp) return;
    if (isDef) { names.add('default'); return; }
    if (ts.isVariableStatement(n)) n.declarationList.declarations.forEach(d => d.name.getText && names.add(d.name.getText(sf)));
    else if (n.name) names.add(n.name.getText(sf));
  });
  exportsOf[path.resolve(f)] = names;
}

const resolve = (fromFile, spec) => {
  let base;
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // package
  for (const c of [base+'.ts', base+'.tsx', path.join(base,'index.ts'), path.join(base,'index.tsx'), base]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.resolve(c);
  }
  return undefined; // unresolved local
};

let problems = 0;
for (const f of files) {
  const sf = parse(f);
  sf.forEachChild(n => {
    if (!ts.isImportDeclaration(n) || !n.moduleSpecifier) return;
    const spec = n.moduleSpecifier.text;
    const target = resolve(f, spec);
    if (target === null) return;
    const rel = path.relative(ROOT, f);
    if (target === undefined) { problems++; console.log(`MISSING MODULE  ${rel}\n     imports '${spec}'`); return; }
    const clause = n.importClause; if (!clause) return;
    const want = [];
    if (clause.name) want.push('default');
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings))
      clause.namedBindings.elements.forEach(e => want.push((e.propertyName||e.name).getText(sf)));
    const have = exportsOf[target] || new Set();
    for (const w of want) {
      if (!have.has(w)) { problems++; console.log(`MISSING EXPORT  ${rel}\n     '${w}' not exported by ${path.relative(ROOT,target)}`); }
    }
  });
}
console.log(`\n${problems} import problem(s) across ${files.length} files`);
