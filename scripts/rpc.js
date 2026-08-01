const fs=require('fs'), path=require('path');
const ROOT=require('path').resolve(__dirname,'..');

// 1. Function names + granted roles from the SQL migrations
const sqlDir=path.join(ROOT,'supabase/migrations');
let sql='';
for (const f of fs.readdirSync(sqlDir).sort()) sql+=fs.readFileSync(path.join(sqlDir,f),'utf8')+'\n';

const defined=new Set();
for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z0-9_]+)\s*\(/gi)) defined.add(m[1].toLowerCase());

const grantedToAuth=new Set();      // callable by a signed-in user
const grantedToService=new Set();   // callable only by the service role (CLI)
for (const m of sql.matchAll(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+([a-z0-9_]+)\s*\([^)]*\)\s+TO\s+([^;]+);/gi)) {
  if (/authenticated/i.test(m[2]))  grantedToAuth.add(m[1].toLowerCase());
  if (/service_role/i.test(m[2]))   grantedToService.add(m[1].toLowerCase());
}
const revokedFromAuth=new Set();
for (const m of sql.matchAll(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+([a-z0-9_]+)\s*\([^)]*\)\s+FROM\s+([^;]+);/gi)) {
  if (/authenticated|public/i.test(m[2])) revokedFromAuth.add(m[1].toLowerCase());
}

// 2. Tables from CREATE TABLE
const tables=new Set();
for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z0-9_]+)/gi)) tables.add(m[1].toLowerCase());

// 3. Every .rpc('x') and .from('y') in TS
const files=[];
(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){
  const p=path.join(d,e.name);
  if(e.isDirectory()){if(!['node_modules','.next','.git','supabase'].includes(e.name))walk(p);}
  else if(/\.tsx?$/.test(e.name))files.push(p);
}})(ROOT);

let problems=0;
const usedRpc=new Set(), usedTbl=new Set();
for(const f of files){
  const src=fs.readFileSync(f,'utf8'); const rel=path.relative(ROOT,f);
  for(const m of src.matchAll(/\.rpc\(\s*['"]([a-z0-9_]+)['"]/gi)){
    const name=m[1].toLowerCase(); usedRpc.add(name);
    if(!defined.has(name)){problems++;console.log(`MISSING FUNCTION  ${rel}\n     .rpc('${name}') has no CREATE FUNCTION`);}
    else {
      // Scripts run as service_role; app code runs as authenticated.
      const isScript = rel.startsWith('scripts/');
      const ok = isScript ? (grantedToService.has(name) || grantedToAuth.has(name))
                          : grantedToAuth.has(name);
      if(!ok && revokedFromAuth.has(name)){
        problems++;console.log(`NOT GRANTED       ${rel}\n     .rpc('${name}') is revoked and never granted to the calling role`);}
      else if(!ok){
        console.log(`note: ${rel} .rpc('${name}') relies on default grants`);}
    }
  }
  for(const m of src.matchAll(/\.from\(\s*['"]([a-z0-9_]+)['"]/gi)){
    const t=m[1].toLowerCase(); usedTbl.add(t);
    if(!tables.has(t)){problems++;console.log(`MISSING TABLE     ${rel}\n     .from('${t}') has no CREATE TABLE`);}
  }
}

console.log(`\nRPCs called:  ${[...usedRpc].sort().join(', ')}`);
console.log(`Tables used:  ${[...usedTbl].sort().join(', ')}`);
console.log(`\n${problems} problem(s)`);
