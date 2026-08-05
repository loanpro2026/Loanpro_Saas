/**
 * Render components to HTML in Node, to catch crashes without a browser.
 *
 * The gap this fills: every check in this repo is static. They parse, they
 * resolve imports, they verify class names — none of them ever *runs* a
 * component. So a rewrite can pass all of them and still throw on the first
 * render, and the first person to find out is whoever opens the page. In a
 * production build that surfaces as "This page could not load" plus a digest,
 * which carries no information at all.
 *
 * This transpiles the real TSX with the TypeScript compiler, stubs the parts
 * of Next that only exist inside a running app (the router, Link), and calls
 * renderToStaticMarkup. It is not a substitute for a browser — no effects, no
 * hydration, no CSS. It answers one question: does this component throw when
 * React renders it?
 *
 * That is the question a "could not load" page is asking.
 *
 * Run: node scripts/render.js
 */
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')

const ROOT = path.join(__dirname, '..')
const ts = require(path.join(ROOT, 'node_modules', 'typescript'))
const React = require(path.join(ROOT, 'node_modules', 'react'))
const { renderToStaticMarkup } = require(path.join(ROOT, 'node_modules', 'react-dom', 'server'))

// ── Stubs for the pieces that only exist inside a running Next app ──────────
const STUBS = {
  'next/link': {
    __esModule: true,
    default: ({ children, href, ...rest }) =>
      React.createElement('a', { href: typeof href === 'string' ? href : '#', ...rest }, children),
  },
  'next/navigation': {
    useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {} }),
    usePathname: () => STUBS['next/navigation'].__pathname || '/',
    useSearchParams: () => new URLSearchParams(),
    redirect() { throw new Error('redirect() called during render') },
    notFound() { throw new Error('notFound() called during render') },
    __pathname: '/',
  },
  'react-hot-toast': {
    __esModule: true,
    default: Object.assign(() => {}, { success() {}, error() {}, loading() {}, dismiss() {} }),
    Toaster: () => null,
  },
  // Server-only modules. A client component that imports a server action gets
  // a generated RPC stub in a real build — it never pulls next/headers or the
  // server Supabase client into the browser bundle. Following those imports
  // here is both wrong and, on this filesystem, effectively endless.
  'next/headers': { cookies: () => ({ getAll: () => [], set() {} }), headers: () => new Map() },
  'next/cache': { revalidatePath() {}, revalidateTag() {}, unstable_cache: fn => fn },
  '@/lib/supabase/server': { createClient: async () => ({}) },
  '@/app/(app)/loans/actions': new Proxy({}, {
    get: () => async () => ({ ok: true }),
  }),
  // Stubbed at the module boundary, not followed.
  //
  // AutoSuggest imports the Supabase browser client, which drags in the whole
  // supabase-js graph — every file of it through the TypeScript transpiler on
  // a slow mount. The first version of this script appeared to hang; it was
  // compiling a dependency tree it has no use for. Nothing here calls the
  // network during a static render, so the boundary is the right place to cut.
  '@/lib/supabase/client': {
    createClient: () => ({
      rpc: async () => ({ data: null, error: null }),
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
      }),
      auth: { getUser: async () => ({ data: { user: null } }) },
    }),
  },
}

// ── Require TSX/TS on the fly, honouring the `@/` alias ─────────────────────
const originalResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (STUBS[request]) return request
  if (request.startsWith('@/')) {
    const base = path.join(ROOT, request.slice(2))
    for (const ext of ['.tsx', '.ts', '.js', '/index.tsx', '/index.ts']) {
      if (fs.existsSync(base + ext)) return base + ext
    }
    if (fs.existsSync(base)) return base
  }
  return originalResolve.call(this, request, ...rest)
}

const originalLoad = Module._load
Module._load = function (request, ...rest) {
  if (STUBS[request]) return STUBS[request]
  return originalLoad.call(this, request, ...rest)
}

const TRACE = process.env.RENDER_TRACE === '1'

for (const ext of ['.tsx', '.ts']) {
  require.extensions[ext] = function (module, filename) {
    if (TRACE) console.log('    compile ' + path.relative(ROOT, filename))
    const source = fs.readFileSync(filename, 'utf8')
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: filename,
    })
    module._compile(outputText, filename)
  }
}

// ── What to render ──────────────────────────────────────────────────────────
const rows = [
  {
    id: 1, name: 'Ramesh Kumar', father_name: 'Suresh Kumar', location: 'Sadar Bazaar',
    amount: 42000, category_type: 'Gold', detailed_type: 'Chain', weight: 22.5,
    issue_date: '2026-04-01', closed_date: '2026-08-06',
  },
  // The awkward row: every nullable column null at once.
  {
    id: 2, name: 'Sunita Devi', father_name: null, location: null,
    amount: 8500, category_type: 'Silver', detailed_type: null, weight: null,
    issue_date: '2026-07-01', closed_date: null,
  },
]

function cases() {
  const { RecordsTable, Pagination } = require(path.join(ROOT, 'components/loans/RecordsTable.tsx'))
  const { LoanFilters } = require(path.join(ROOT, 'components/loans/LoanFilters.tsx'))
  const { PageHeader, Card, CardHeader, StatCard, StatStrip, StatStripCell } =
    require(path.join(ROOT, 'components/ui/Page.tsx'))
  const { EmptyState } = require(path.join(ROOT, 'components/ui/EmptyState.tsx'))
  const { DiagnosticPanel } = require(path.join(ROOT, 'components/dashboard/DiagnosticPanel.tsx'))

  return [
    ['RecordsTable (active, 2 rows)',
      () => React.createElement(RecordsTable, { rows, variant: 'active', countLabel: 'Showing all 2' })],
    ['RecordsTable (closed, 2 rows)',
      () => React.createElement(RecordsTable, { rows, variant: 'closed', countLabel: 'Showing all 2' })],
    ['RecordsTable (no rows)',
      () => React.createElement(RecordsTable, { rows: [], variant: 'active', countLabel: 'Showing all 0' })],
    ['RecordsTable + Pagination',
      () => React.createElement(RecordsTable, {
        rows, variant: 'active', countLabel: 'Showing 1-50 of 128',
        pagination: React.createElement(Pagination, { page: 2, lastPage: 3, hrefFor: n => `?page=${n}` }),
      })],
    ['Pagination (single page -> null)',
      () => React.createElement(Pagination, { page: 1, lastPage: 1, hrefFor: n => `?page=${n}` })],
    ['LoanFilters (active route)',
      () => { STUBS['next/navigation'].__pathname = '/view-records/active'
              return React.createElement(LoanFilters, { currentStatus: 'active' }) }],
    ['LoanFilters (closed route, filters applied)',
      () => { STUBS['next/navigation'].__pathname = '/view-records/closed'
              return React.createElement(LoanFilters, {
                currentStatus: 'closed', currentCategory: 'Gold', query: 'ramesh',
                searchField: 'father_name', sort: 'amount',
                issueFrom: '2026-01-01', issueTo: '2026-08-01', minAmount: '1000', maxAmount: '50000' }) }],
    ['LoanFilters (search by loan number)',
      () => React.createElement(LoanFilters, { currentStatus: 'active', searchField: 'id', query: '42' })],
    ['PageHeader with actions',
      () => React.createElement(PageHeader, {
        title: 'Active Records', subtitle: '2 active loans',
        actions: React.createElement(LoanFilters, { currentStatus: 'active' }) })],
    ['EmptyState',
      () => React.createElement(EmptyState, { title: 'No loans found', description: 'Nothing here.' })],
    ['StatStrip + cells',
      () => React.createElement(StatStrip, { columns: 4 },
        React.createElement(StatStripCell, { label: 'Loan amount', value: '42,000' }),
        React.createElement(StatStripCell, { label: 'Days held', value: '127 days', highlight: true, tone: 'primary', sub: '4 months' }))],
    ['Card + CardHeader',
      () => React.createElement(Card, null, React.createElement(CardHeader, { title: 'Collateral', meta: '2 items' }))],
    ['StatCard',
      () => React.createElement(StatCard, { label: 'Active', value: '50,500', sub: '2 loans', tone: 'green' })],
    ['DiagnosticPanel (one failure)',
      () => React.createElement(DiagnosticPanel, { failures: [
        { call: 'dashboard_snapshot', code: '42883', message: 'function normalize_item_type(text) does not exist' }] })],
    ['DiagnosticPanel (empty -> null)',
      () => React.createElement(DiagnosticPanel, { failures: [] })],
  ]
}

let failed = 0
let list
try {
  process.stdout.write('loading components… ')
  const started = Date.now()
  list = cases()
  console.log(`${list.length} cases in ${((Date.now() - started) / 1000).toFixed(1)}s\n`)
} catch (err) {
  console.error('Could not even load the components:\n  ' + (err && err.message))
  console.error(err && err.stack ? err.stack.split('\n').slice(1, 4).join('\n') : '')
  process.exit(1)
}

for (const [label, make] of list) {
  try {
    const html = renderToStaticMarkup(React.createElement(make))
    console.log(`  ok    ${label}  (${html.length} chars)`)
  } catch (err) {
    failed++
    console.log(`  FAIL  ${label}`)
    console.log(`          ${(err && err.message ? err.message : String(err)).split('\n')[0]}`)
    const frame = (err && err.stack ? err.stack.split('\n') : [])
      .find(l => l.includes('/components/') || l.includes('/app/'))
    if (frame) console.log(`          ${frame.trim()}`)
  }
}

console.log()
if (failed) {
  console.log(`${failed} of ${list.length} components throw when rendered.`)
  process.exit(1)
}
console.log(`All ${list.length} render without throwing.`)
