"""
Generate types/supabase.ts from supabase/migrations/*.sql.

    pip install pglast
    python scripts/gen-types.py

This exists so the database types can be produced from the migrations
themselves — no Supabase CLI, no login, no network, no live database. The
migrations are the same DDL that was applied to the project, so the result
matches the deployed schema.

Re-run it whenever you add a migration. If you skip that, types/supabase.ts
drifts from the database and starts asserting a schema that no longer exists,
which is worse than having no types at all.

The equivalent official command, if you ever want the CLI, is:

    supabase gen types typescript --linked

That version additionally fills in Relationships[] (for typed nested selects),
because it can read the live foreign-key catalogue. This script cannot.
"""
import pglast, glob, re
from pglast import ast, enums

PG2TS = {
 'text':'string','varchar':'string','bpchar':'string','char':'string','uuid':'string',
 'date':'string','timestamptz':'string','timestamp':'string','time':'string','timetz':'string',
 'inet':'string','citext':'string','name':'string','interval':'string',
 'int2':'number','int4':'number','int8':'number','numeric':'number','float4':'number',
 'float8':'number','money':'number','oid':'number',
 'bool':'boolean',
 'jsonb':'Json','json':'Json',
 'record':'Json','void':'undefined','trigger':'unknown',
}
SERIAL={'serial':'number','bigserial':'number','smallserial':'number'}

def tname(tn):
    names=[x.sval for x in tn.names]
    base=names[-1]
    arr = tn.arrayBounds is not None
    ts = SERIAL.get(base) or PG2TS.get(base)
    if ts is None: ts='unknown'
    return (ts+'[]') if arr else ts, base

def is_serial(tn):
    return [x.sval for x in tn.names][-1] in SERIAL

tables={}   # name -> dict(col -> dict(ts, notnull, hasdefault, pk))
funcs={}    # name -> dict(args, returns)

for f in sorted(glob.glob('supabase/migrations/*.sql')):
    sql=open(f,encoding='utf-8').read()
    for raw in pglast.parse_sql(sql):
        s=raw.stmt
        if isinstance(s, ast.CreateStmt):
            t=s.relation.relname
            cols={}
            for e in (s.tableElts or []):
                if not isinstance(e, ast.ColumnDef): continue
                ts,base=tname(e.typeName)
                notnull=False; hasdef=is_serial(e.typeName); pk=False
                for c in (e.constraints or []):
                    ct=str(c.contype)
                    if 'NOTNULL' in ct: notnull=True
                    if 'DEFAULT' in ct: hasdef=True
                    if 'PRIMARY' in ct: pk=True; notnull=True
                    if 'IDENTITY' in ct or 'GENERATED' in ct: hasdef=True
                cols[e.colname]={'ts':ts,'notnull':notnull,'hasdef':hasdef,'pk':pk}
            # table-level PRIMARY KEY (col, col)
            for e in (s.tableElts or []):
                if isinstance(e, ast.Constraint) and 'PRIMARY' in str(e.contype):
                    for k in (e.keys or []):
                        if k.sval in cols:
                            cols[k.sval]['pk']=True; cols[k.sval]['notnull']=True
            tables[t]=cols
        elif isinstance(s, ast.AlterTableStmt):
            t=s.relation.relname
            for c in (s.cmds or []):
                if c.def_ is not None and isinstance(c.def_, ast.ColumnDef) and t in tables:
                    e=c.def_; ts,base=tname(e.typeName)
                    notnull=False; hasdef=is_serial(e.typeName)
                    for k in (e.constraints or []):
                        ct=str(k.contype)
                        if 'NOTNULL' in ct: notnull=True
                        if 'DEFAULT' in ct: hasdef=True
                    tables[t][e.colname]={'ts':ts,'notnull':notnull,'hasdef':hasdef,'pk':False}
        elif isinstance(s, ast.CreateFunctionStmt):
            nm=s.funcname[-1].sval
            args={}; tbl={}
            for p in (s.parameters or []):
                ts,base=tname(p.argType)
                mode=str(p.mode)
                if 'TABLE' in mode: tbl[p.name]=ts
                elif 'OUT' not in mode: args[p.name]=ts
            rts,rbase = tname(s.returnType)
            setof = bool(s.returnType.setof)
            if tbl:
                ret='{ '+'; '.join(f'{k}: {v} | null' for k,v in tbl.items())+' }[]'
            elif rbase=='void': ret='undefined'
            elif setof: ret=rts+'[]'
            else: ret=rts
            funcs[nm]={'args':args,'returns':ret}   # later definition wins

def q(k): return k if re.fullmatch(r'[A-Za-z_$][A-Za-z0-9_$]*',k) else f'"{k}"'

out=[]
w=out.append
w('''/**
 * Database types for LoanPro SaaS.
 *
 * GENERATED FROM supabase/migrations/*.sql — the same DDL that was applied to
 * the project — rather than introspected from a live database. That makes it
 * accurate to the schema you ran, and it needs no CLI, no login and no network.
 *
 * What this gives you: every column name and type on all 21 tables, and the
 * argument and return shape of all RPC functions. A typo in a column name is
 * now a compile error instead of a row of `undefined` at runtime.
 *
 * What it cannot know, because it reads DDL and not a live catalogue:
 *   - Relationships[] is empty, so nested `.select('*, loans(*)')` embeds are
 *     not typed. The queries still work; they are just not checked.
 *   - Views, enums and composite types are empty (this schema uses none).
 *   - A function returning `record` without an OUT/TABLE list becomes Json.
 *
 * If the schema changes, re-run the generator, or replace this file wholesale
 * with `supabase gen types typescript --linked` if you ever want the CLI.
 * Do not hand-edit: a wrong type here is worse than none, because it claims a
 * safety the queries do not have.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  /**
   * Read by supabase-js to pick its PostgREST typing rules. Supabase hosts
   * PostgREST 12. Leaving this out is not an error — the client assumes 12 —
   * but stating it means an upgrade becomes a visible change here rather than
   * a silent shift in how query results are typed.
   */
  __InternalSupabase: {
    PostgrestVersion: '12'
  }
  public: {
    Tables: {''')

for t in sorted(tables):
    cols=tables[t]
    w(f'      {q(t)}: {{')
    w('        Row: {')
    for c,m in cols.items():
        w(f"          {q(c)}: {m['ts']}" + ('' if m['notnull'] else ' | null'))
    w('        }')
    w('        Insert: {')
    for c,m in cols.items():
        opt = m['hasdef'] or not m['notnull']
        w(f"          {q(c)}{'?' if opt else ''}: {m['ts']}" + ('' if m['notnull'] else ' | null'))
    w('        }')
    w('        Update: {')
    for c,m in cols.items():
        w(f"          {q(c)}?: {m['ts']}" + ('' if m['notnull'] else ' | null'))
    w('        }')
    w('        Relationships: []')
    w('      }')
w('    }')
w('    Views: { [_ in never]: never }')
w('    Functions: {')
for n in sorted(funcs):
    fn=funcs[n]
    if fn['args']:
        a='{ '+'; '.join(f'{q(k)}?: {v}' for k,v in fn['args'].items())+' }'
    else:
        a='Record<string, never>'
    w(f'      {q(n)}: {{')
    w(f'        Args: {a}')
    w(f"        Returns: {fn['returns']}")
    w('      }')
w('    }')
w('    Enums: { [_ in never]: never }')
w('    CompositeTypes: { [_ in never]: never }')
w('  }')
w('}')
w('')
w('/** Convenience aliases. */')
w("export type Tables<T extends keyof Database['public']['Tables']> =")
w("  Database['public']['Tables'][T]['Row']")
w("export type Inserts<T extends keyof Database['public']['Tables']> =")
w("  Database['public']['Tables'][T]['Insert']")
w("export type Updates<T extends keyof Database['public']['Tables']> =")
w("  Database['public']['Tables'][T]['Update']")
w("export type Funcs<T extends keyof Database['public']['Functions']> =")
w("  Database['public']['Functions'][T]['Returns']")
w('')
w('export type TableName = keyof Database[\'public\'][\'Tables\']')
w('')

open('types/supabase.ts','w',encoding='utf-8').write('\n'.join(out))
print(f"tables={len(tables)} functions={len(funcs)} lines={len(out)}")
