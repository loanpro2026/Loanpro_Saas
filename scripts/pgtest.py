#!/usr/bin/env python3
"""
Apply every migration to a real PostgreSQL and prove the schema works.

Until now SQL in this project was only ever parsed, never executed — the
sandbox had no database. `scripts/sql.js` catches what a parser can catch
(invalid exception names, non-idempotent DDL) and nothing else. A function
body in PL/pgSQL is not planned until it is first *called*, so a call to a
function that does not exist, a column that was renamed, or a missing GRANT
all create cleanly and fail at runtime — which is exactly the class of bug
that reaches production looking like "could not be loaded".

This starts an embedded Postgres 16, stands up the parts of Supabase the
migrations depend on (the `auth` schema, the anon/authenticated/service_role
roles), applies 001 onward in order, seeds one shop, and then calls every
dashboard entry point *as the authenticated role with real JWT claims* —
which is what PostgREST does, and the only way a missing EXECUTE grant or an
RLS policy shows up at all. Called as `postgres` from the SQL editor,
everything passes.

Run:  python3 scripts/pgtest.py
"""
import json
import re
import subprocess
import sys
import uuid
from pathlib import Path

try:
    import pgserver
except ImportError:
    sys.exit("pgserver is not installed.  pip install pgserver --break-system-packages")

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = sorted((ROOT / 'supabase' / 'migrations').glob('*.sql'))

TENANT = str(uuid.uuid4())
AUTH_ID = str(uuid.uuid4())

# ── The Supabase-provided pieces the migrations assume already exist ─────────
# Not a re-implementation of Supabase, just enough of its contract that the
# migrations mean the same thing here as they do there.
PRELUDE = f"""
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT anon, authenticated, service_role TO postgres;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id    UUID PRIMARY KEY,
  email TEXT
);

-- Supabase derives auth.uid() from the request's JWT claims. Same contract.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub', ''
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    'authenticated');
$$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'email';
$$;

-- Migration 024 reads the whole claim set, not just the subject.
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{{}}'::jsonb);
$$;

GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.email(), auth.jwt()
  TO anon, authenticated, service_role;

INSERT INTO auth.users (id, email) VALUES ('{AUTH_ID}', 'shop@example.com')
  ON CONFLICT DO NOTHING;
"""

# Every table the migrations create should be readable by the app role; in a
# real Supabase project the default privileges do this. Applied after the
# migrations so it covers whatever they created.
GRANTS = """
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
"""

# ── Extensions this Postgres build does not ship ────────────────────────────
# Supabase provides pgcrypto, uuid-ossp and pg_trgm; the embedded build here
# has only plpgsql and vector. Rather than pretend otherwise, each one is
# replaced with the narrowest possible stand-in and named in the report, so
# what is and is not covered stays explicit.
#
#   pgcrypto   — needed only for gen_random_uuid(), which has been core since
#                PostgreSQL 13. Nothing to replace.
#   uuid-ossp  — not called anywhere in the migrations. Nothing to replace.
#   pg_trgm    — real. Used for three GIN indexes and for similarity() inside
#                search_loans. The indexes are dropped and similarity() is
#                stubbed, so search_loans compiles and runs but its RANKING IS
#                NOT VERIFIED HERE.
SHIMS = """
-- gen_random_bytes IS pgcrypto — unlike gen_random_uuid, it never moved into
-- core. Two tables default their session key / invitation token to
-- encode(gen_random_bytes(32),'hex'), so without this 001 fails on the very
-- first CREATE TABLE that uses it and every later migration collapses behind
-- it. Cryptographic quality is irrelevant to a schema test; length and
-- uniqueness are not.
CREATE OR REPLACE FUNCTION public.gen_random_bytes(n INTEGER)
RETURNS BYTEA LANGUAGE sql VOLATILE AS $$
  SELECT decode(string_agg(lpad(to_hex((random() * 255)::int), 2, '0'), ''), 'hex')
    FROM generate_series(1, n);
$$;

CREATE OR REPLACE FUNCTION public.similarity(a TEXT, b TEXT)
RETURNS REAL LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN a IS NULL OR b IS NULL OR length(b) = 0 THEN 0::real
    WHEN lower(a) = lower(b) THEN 1::real
    WHEN position(lower(b) in lower(a)) > 0
      THEN (length(b)::real / GREATEST(length(a), 1))
    ELSE 0::real END;
$$;
"""

UNVERIFIED = [
    'search_loans ranking — pg_trgm is unavailable, so similarity() is stubbed',
    'the three gin_trgm_ops indexes on loans — skipped, not created',
]

EXTENSION_RE = re.compile(
    r'^\s*CREATE\s+EXTENSION\s+(IF\s+NOT\s+EXISTS\s+)?["\']?(uuid-ossp|pgcrypto|pg_trgm)["\']?\s*;',
    re.IGNORECASE | re.MULTILINE)

TRGM_INDEX_RE = re.compile(
    r'CREATE\s+INDEX[^;]*?gin_trgm_ops[^;]*?;', re.IGNORECASE | re.DOTALL)


def neutralise(sql: str) -> tuple[str, list[str]]:
    """Strip what this build cannot run, and report exactly what was stripped."""
    removed = []

    def drop_ext(match):
        removed.append(f'CREATE EXTENSION {match.group(2)}')
        return '-- [pgtest] extension unavailable here\n'

    sql = EXTENSION_RE.sub(drop_ext, sql)

    def drop_index(match):
        name = re.search(r'INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)', match.group(0), re.I)
        removed.append(f'index {name.group(1) if name else "?"} (gin_trgm_ops)')
        return '-- [pgtest] trigram index skipped\n'

    sql = TRGM_INDEX_RE.sub(drop_index, sql)
    return sql, removed


class SqlError(RuntimeError):
    pass


def make_run(db):
    """
    psql that actually fails on failure.

    `pgserver.psql()` does not raise when the SQL errors — it prints the error
    to the output and returns normally. The first version of this script used
    it directly inside try/except, so every check "passed": migrations that
    errored were reported as applied, and calls that raised `Not authenticated`
    were reported ok. A harness that cannot fail is worse than no harness,
    because it produces a green result you then trust.

    psql also continues past an error by default, so a script's later
    statements run against a half-built state. ON_ERROR_STOP fixes that, and
    scanning the output for ERROR/FATAL catches what remains.
    """
    # psql is invoked directly rather than through db.psql() so that stderr is
    # captured. db.psql uses check_output without stderr, so on failure the
    # error text goes to the terminal and the exception carries only "exit
    # status 3" — which says something broke but not what.
    psql_bin = str(Path(pgserver.__file__).parent / 'pginstall' / 'bin' / 'psql')
    uri = db.get_uri()

    def run(sql: str) -> str:
        proc = subprocess.run(
            [psql_bin, uri, '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'],
            input=sql, capture_output=True, text=True,
        )
        combined = (proc.stdout or '') + (proc.stderr or '')
        if proc.returncode != 0:
            # Match on the severity keyword, not on the "psql:file:line:"
            # prefix — psql prefixes NOTICE lines identically, so keying off
            # the prefix reported harmless notices as the failure and hid the
            # real error further down.
            error = next(
                (l.strip() for l in combined.splitlines()
                 if re.search(r'\b(ERROR|FATAL|PANIC):', l)),
                combined.strip().splitlines()[0] if combined.strip() else 'unknown error',
            )
            # The DETAIL line is usually where the real cause is.
            detail = next(
                (l.strip() for l in combined.splitlines() if l.strip().startswith('DETAIL:')), '')
            raise SqlError(re.sub(r'\s+', ' ', f'{error} {detail}').strip())
        return combined
    return run


def main() -> int:
    print(f'Postgres starting…')
    db = pgserver.get_server('/tmp/pgdata')
    run = make_run(db)

    run('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
    run('DROP SCHEMA IF EXISTS auth CASCADE;')
    run(PRELUDE)
    run(SHIMS)

    # ── Apply the migrations in order ───────────────────────────────────────
    print(f'\nApplying {len(MIGRATIONS)} migrations')
    failed = []
    stripped = []
    for path in MIGRATIONS:
        sql, removed = neutralise(path.read_text(encoding='utf-8'))
        stripped.extend(f'{path.name}: {item}' for item in removed)
        try:
            run(sql)
            print(f'  ok    {path.name}')
        except Exception as exc:
            first = str(exc).strip().splitlines()
            detail = next((l for l in first if 'ERROR' in l), first[0] if first else str(exc))
            print(f'  FAIL  {path.name}\n          {detail.strip()}')
            failed.append(path.name)

    if failed:
        print(f'\n{len(failed)} migration(s) failed to apply — stopping here.')
        return 1

    run(GRANTS)

    # ── Seed one shop ───────────────────────────────────────────────────────
    print('\nSeeding a shop')
    run(f"""
      INSERT INTO tenants (id, shop_name, owner_id)
        VALUES ('{TENANT}', 'Test Jewellers', '{AUTH_ID}')
        ON CONFLICT (id) DO NOTHING;
      INSERT INTO users (auth_id, tenant_id, email, full_name, role)
        VALUES ('{AUTH_ID}', '{TENANT}', 'shop@example.com', 'Akshat Sharma', 'owner')
        ON CONFLICT DO NOTHING;
      INSERT INTO loans (tenant_id, name, father_name, location, amount,
                         category_type, detailed_type, weight, issue_date, status)
      VALUES
        ('{TENANT}', 'Ramesh Kumar', 'Suresh Kumar', 'Sadar Bazaar', 42000,
         'Gold',   'Chain',  22.5, CURRENT_DATE - 120, 'active'),
        ('{TENANT}', 'Sunita Devi', 'Mohan Lal',    'Kot Kapura',   8500,
         'Silver', 'Payal', 850.0, CURRENT_DATE - 40,  'active');
    """)
    run(f"""
      INSERT INTO deposits (tenant_id, loan_id, amount, deposit_date)
      SELECT '{TENANT}', id, 2000, CURRENT_DATE FROM loans
       WHERE tenant_id = '{TENANT}' AND name = 'Ramesh Kumar';
    """)

    # ── Call everything the dashboard calls, as the app's role ──────────────
    print('\nCalling every dashboard entry point as `authenticated`')
    calls = [
        ('get_tenant_id()',          'SELECT get_tenant_id()'),
        ('dashboard_snapshot()',     'SELECT dashboard_snapshot()'),
        ('dashboard_stats(today)',   "SELECT dashboard_stats('today')"),
        ('chart_data(12)',           'SELECT * FROM chart_data(12)'),
        ('lending_metrics()',        'SELECT lending_metrics()'),
        ('jewellery_stock()',        'SELECT jewellery_stock()'),
        ('inventory_report()',       'SELECT * FROM inventory_report()'),
        ('my_settings()',            'SELECT my_settings()'),
        ('daily_cash_summary read',
         """SELECT deposit_credit, deposit_debit, added_cash, removed_cash,
                   investments, returns, total_cash, left_cash
              FROM daily_cash_summary LIMIT 1"""),
    ]

    problems = []
    for label, sql in calls:
        # Fresh transaction per call: `SET LOCAL ROLE` must not leak, and one
        # failure must not abort the rest.
        script = (
            "BEGIN;"
            f"SELECT set_config('request.jwt.claims', '{json.dumps({'sub': AUTH_ID, 'role': 'authenticated'})}', true);"
            "SET LOCAL ROLE authenticated;"
            f"{sql};"
            "ROLLBACK;"
        )
        try:
            run(script)
            print(f'  ok    {label}')
        except Exception as exc:
            msg = re.sub(r'\s+', ' ', str(exc)).strip()
            print(f'  FAIL  {label}\n          {msg[:300]}')
            problems.append((label, msg))

    # ── Does the snapshot agree with the raw tables? ────────────────────────
    print('\nChecking dashboard_snapshot against the tables directly')
    try:
        # Round-trip the JSON through a file rather than through psql's
        # aligned text output. psql wraps long values across lines and pads
        # them with spaces, so scraping stdout silently truncated the payload
        # to nothing and every field came back None — which reads exactly like
        # a broken function and is not one. COPY writes the bytes verbatim.
        out_path = '/tmp/loanpro-snapshot.json'
        run(
            f"SELECT set_config('request.jwt.claims', '{json.dumps({'sub': AUTH_ID})}', false);"
            f"COPY (SELECT dashboard_snapshot()::text) TO '{out_path}';"
        )
        raw = Path(out_path).read_text(encoding='utf-8').strip()
        # COPY escapes backslashes and newlines in text format; the payload is
        # single-line JSON, so only the escaping needs undoing.
        raw = raw.replace('\\\\', '\\')
        snap = json.loads(raw)
        expect_principal = 42000 + 8500
        checks = [
            ('active_loans', snap.get('active_loans'), 2),
            ('active_principal', snap.get('active_principal'), expect_principal),
            ('cash.total_deposits', snap.get('cash', {}).get('total_deposits'), 2000),
            ('cash.deposit_credit', snap.get('cash', {}).get('deposit_credit'), 2000),
            ('stock.count.gold', snap.get('stock', {}).get('count', {}).get('gold'), 1),
            ('stock.count.silver', snap.get('stock', {}).get('count', {}).get('silver'), 1),
        ]
        for name, got, want in checks:
            ok = got == want
            print(f'  {"ok   " if ok else "WRONG"} {name}: got {got!r}, expected {want!r}')
            if not ok:
                problems.append((f'snapshot {name}', f'got {got!r}, expected {want!r}'))
    except Exception as exc:
        msg = re.sub(r'\s+', ' ', str(exc)).strip()
        print(f'  FAIL  could not read snapshot: {msg[:300]}')
        problems.append(('snapshot', msg))

    print()
    if stripped:
        print('Not exercised (this Postgres build lacks the extension):')
        for item in stripped:
            print(f'  - {item}')
    for item in UNVERIFIED:
        print(f'  - {item}')
    print()

    if problems:
        print(f'{len(problems)} problem(s):')
        for label, msg in problems:
            print(f'  - {label}: {msg[:200]}')
        return 1

    print('All migrations apply and every dashboard call works as `authenticated`.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
