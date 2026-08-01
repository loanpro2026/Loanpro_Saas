const ts = require('typescript');
const fs = require('fs'), path = require('path');
const ROOT = require('path').resolve(__dirname,'..');
const files = [];
(function walk(d){
  for (const e of fs.readdirSync(d, {withFileTypes:true})) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!['node_modules','.next','.git'].includes(e.name)) walk(p); }
    else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
})(ROOT);

let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ES2022, true,
    f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const diags = sf.parseDiagnostics || [];
  if (diags.length) {
    bad++;
    console.log('SYNTAX ERROR ' + path.relative(ROOT, f));
    for (const d of diags.slice(0,5)) {
      const {line, character} = sf.getLineAndCharacterOfPosition(d.start);
      console.log(`   ${line+1}:${character+1}  ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`);
    }
  }
}
console.log(`\nParsed ${files.length} TS/TSX files — ${bad} with syntax errors`);
