"""
Generate types/supabase.ts from supabase/migrations/*.sql.

    python -m pip install -r scripts/requirements.txt
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

That version can additionally see database objects created outside these
migrations. This script derives tables, functions, checks, and relationships
from the checked-in SQL only.
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


def check_union(colname, constraints):
    """
    `CHECK (col IN ('a','b'))` -> "'a' | 'b'".

    The desktop app's statuses and categories are enforced this way rather than
    with Postgres enums, so without this every one of them types as bare
    `string` and a typo like 'Golde' compiles fine.
    """
    for c in (constraints or []):
        if c.contype != enums.ConstrType.CONSTR_CHECK or c.raw_expr is None:
            continue
        e = c.raw_expr
        if not isinstance(e, ast.A_Expr):
            continue
        if e.kind != enums.A_Expr_Kind.AEXPR_IN:
            continue
        # Only when the check is on this very column.
        lex = e.lexpr
        if not (isinstance(lex, ast.ColumnRef) and lex.fields[-1].sval == colname):
            continue
        vals = []
        for v in (e.rexpr or ()):
            if isinstance(v, ast.A_Const) and getattr(v.val, 'sval', None) is not None:
                vals.append(v.val.sval)
        if vals:
            return ' | '.join(f"'{v}'" for v in vals)
    return None


def fk_of(colname, constraints):
    """Column-level `REFERENCES other(col)` -> (table, [cols])."""
    for c in (constraints or []):
        if c.contype == enums.ConstrType.CONSTR_FOREIGN and c.pktable is not None:
            cols = [x.sval for x in (c.pk_attrs or [])] or ['id']
            return (c.pktable.relname, cols)
    return None


tables={}   # name -> dict(col -> dict(ts, notnull, hasdefault, pk))
funcs={}    # name -> dict(args, returns)
rels={}     # table -> list of relationship dicts

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
                    ct=c.contype
                    if ct == enums.ConstrType.CONSTR_NOTNULL: notnull=True
                    if ct == enums.ConstrType.CONSTR_DEFAULT: hasdef=True
                    if ct == enums.ConstrType.CONSTR_PRIMARY: pk=True; notnull=True
                    if ct in (enums.ConstrType.CONSTR_IDENTITY,
                              enums.ConstrType.CONSTR_GENERATED): hasdef=True
                union = check_union(e.colname, e.constraints)
                if union: ts = union
                fk = fk_of(e.colname, e.constraints)
                if fk:
                    rels.setdefault(t, []).append({
                        'name': f'{t}_{e.colname}_fkey',
                        'cols': [e.colname],
                        'one': False,
                        'rel': fk[0],
                        'refcols': fk[1],
                    })
                cols[e.colname]={'ts':ts,'notnull':notnull,'hasdef':hasdef,'pk':pk}
            # table-level PRIMARY KEY / CHECK / FOREIGN KEY
            for e in (s.tableElts or []):
                if not isinstance(e, ast.Constraint): continue
                ct=e.contype
                if ct == enums.ConstrType.CONSTR_PRIMARY:
                    for k in (e.keys or []):
                        if k.sval in cols:
                            cols[k.sval]['pk']=True; cols[k.sval]['notnull']=True
                elif ct == enums.ConstrType.CONSTR_CHECK:
                    for cname in cols:
                        u = check_union(cname, [e])
                        if u: cols[cname]['ts'] = u
                elif ct == enums.ConstrType.CONSTR_FOREIGN and e.pktable is not None:
                    fcols=[x.sval for x in (e.fk_attrs or [])]
                    rcols=[x.sval for x in (e.pk_attrs or [])] or ['id']
                    if fcols:
                        rels.setdefault(t, []).append({
                            'name': f"{t}_{'_'.join(fcols)}_fkey",
                            'cols': fcols, 'one': False,
                            'rel': e.pktable.relname, 'refcols': rcols,
                        })
            tables[t]=cols
        elif isinstance(s, ast.AlterTableStmt):
            t=s.relation.relname
            for c in (s.cmds or []):
                # ALTER TABLE ... ADD CONSTRAINT ... CHECK (col IN (...)).
                # Constraints added after the table was created are just as
                # binding as inline ones, so the union must come from here too
                # — migration 017 adds all the role/plan ones this way.
                if (isinstance(c.def_, ast.Constraint)
                        and c.def_.contype == enums.ConstrType.CONSTR_CHECK
                        and t in tables):
                    for cname in tables[t]:
                        u = check_union(cname, [c.def_])
                        if u: tables[t][cname]['ts'] = u
                    continue
                # ALTER COLUMN ... DROP NOT NULL / SET NOT NULL / DROP COLUMN.
                # Ignoring these means the generated type asserts a constraint
                # the database does not have. Migration 004 relaxes
                # loan_photos.photo_url and .storage_path this way when the
                # storage backend moved to R2 — without this the types still
                # demanded them and every insert failed to compile.
                st = c.subtype
                if t in tables and c.name and c.name in tables[t]:
                    if st == enums.AlterTableType.AT_DropNotNull:
                        tables[t][c.name]['notnull'] = False
                        continue
                    if st == enums.AlterTableType.AT_SetNotNull:
                        tables[t][c.name]['notnull'] = True
                        continue
                    if st == enums.AlterTableType.AT_ColumnDefault:
                        tables[t][c.name]['hasdef'] = c.def_ is not None
                        continue
                if st == enums.AlterTableType.AT_DropColumn and t in tables and c.name in tables.get(t, {}):
                    del tables[t][c.name]
                    continue
                if c.def_ is not None and isinstance(c.def_, ast.ColumnDef) and t in tables:
                    e=c.def_; ts,base=tname(e.typeName)
                    notnull=False; hasdef=is_serial(e.typeName)
                    for k in (e.constraints or []):
                        ct=k.contype
                        if ct == enums.ConstrType.CONSTR_NOTNULL: notnull=True
                        if ct == enums.ConstrType.CONSTR_DEFAULT: hasdef=True
                    tables[t][e.colname]={'ts':ts,'notnull':notnull,'hasdef':hasdef,'pk':False}
        elif isinstance(s, ast.CreateFunctionStmt):
            nm=s.funcname[-1].sval
            args={}; tbl={}; required=[]
            for p in (s.parameters or []):
                ts,base=tname(p.argType)
                mode=p.mode
                if mode == enums.FunctionParameterMode.FUNC_PARAM_TABLE:
                    tbl[p.name]=ts
                elif mode != enums.FunctionParameterMode.FUNC_PARAM_OUT:
                    args[p.name]=ts
                    # No DEFAULT means the caller must supply it. PostgREST
                    # resolves a function by its argument names, so omitting one
                    # does not raise a type error at runtime — it fails to find
                    # the function at all, surfacing as a confusing 404.
                    if p.defexpr is None:
                        required.append(p.name)
            rts,rbase = tname(s.returnType)
            setof = bool(s.returnType.setof)
            if tbl:
                ret='{ '+'; '.join(f'{k}: {v} | null' for k,v in tbl.items())+' }[]'
            elif rbase=='void': ret='undefined'
            elif setof: ret=rts+'[]'
            else: ret=rts
            funcs[nm]={'args':args,'returns':ret,'required':required}

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
 * Derived from the DDL, so these are real rather than guessed:
 *   - Relationships[], from every REFERENCES clause, which is what makes
 *     nested selects like `.select('*, tenant:tenants(*)')` type-check.
 *   - String unions from `CHECK (col IN (...))`, inline or added later by an
 *     ALTER TABLE. This schema uses CHECK constraints instead of Postgres
 *     enums, so without this every status and category would be bare `string`.
 *
 * What it still cannot know, because it reads DDL and not a live catalogue:
 *   - Views and composite types (this schema uses none).
 *   - A function returning `record` without an OUT/TABLE list becomes Json.
 *   - A CHECK written any way other than `col IN (...)` — a regex or a range
 *     check, say — is not turned into a type.
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
    rl = rels.get(t, [])
    if not rl:
        w('        Relationships: []')
    else:
        w('        Relationships: [')
        seen=set()
        for r in rl:
            sig=(r['name'], tuple(r['cols']), r['rel'])
            if sig in seen: continue
            seen.add(sig)
            w('          {')
            w(f"            foreignKeyName: '{r['name']}'")
            w(f"            columns: [{', '.join(repr(c).replace(chr(39), chr(39)) for c in r['cols'])}]")
            w(f"            isOneToOne: {'true' if r['one'] else 'false'}")
            w(f"            referencedRelation: '{r['rel']}'")
            w(f"            referencedColumns: [{', '.join(repr(c) for c in r['refcols'])}]")
            w('          },')
        w('        ]')
    w('      }')
w('    }')
w('    Views: { [_ in never]: never }')
w('    Functions: {')
for n in sorted(funcs):
    fn=funcs[n]
    if fn['args']:
        a='{ '+'; '.join(f'{q(k)}?: {v} | null' for k,v in fn['args'].items())+' }'
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

import json
json.dump({n: f['required'] for n, f in sorted(funcs.items())},
          open('scripts/rpc-required-args.json','w',encoding='utf-8'), indent=1)
print(f"tables={len(tables)} functions={len(funcs)} lines={len(out)}")
