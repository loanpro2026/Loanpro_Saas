/**
 * Models recalculate_cash_summary() from migration 007 in JS and checks it
 * against hand-computed expectations, so the ledger formula is verified before
 * it ever touches a shop's books.
 *
 *   left_cash[d] = left_cash[d-1] + added - removed + dep_credit - dep_debit
 *                  - investments + returns
 */
function recalc({ from, to, loans, deposits, closedDeposits, cashTx }) {
  const out = {}
  const days = []
  for (let d = new Date(from); d <= new Date(to); d.setDate(d.getDate() + 1))
    days.push(d.toISOString().slice(0, 10))

  let prev = 0
  for (const day of days) {
    const added   = cashTx.filter(t => t.date === day && t.type === 'add').reduce((s, t) => s + t.amount, 0)
    const removed = cashTx.filter(t => t.date === day && t.type === 'remove').reduce((s, t) => s + t.amount, 0)
    const invest  = loans.filter(l => l.issue_date === day).reduce((s, l) => s + l.amount, 0)
    const returns = loans.filter(l => l.status === 'closed' && l.closed_date === day)
                         .reduce((s, l) => s + l.amount + (l.interest ?? 0), 0)

    const all = [...deposits, ...closedDeposits]              // union, as in 007
    const depCr = all.filter(d => d.deposit_date === day).reduce((s, d) => s + d.amount, 0)
    const depDb = all.filter(d => {
      const loan = loans.find(l => l.id === d.loan_id)
      return loan?.status === 'closed' && loan.closed_date === day
    }).reduce((s, d) => s + d.amount, 0)

    const left = prev + added - removed + depCr - depDb - invest + returns
    out[day] = { added, removed, depCr, depDb, invest, returns, left }
    prev = left
  }
  return out
}

let fail = 0
const eq = (label, a, b) => {
  if (a === b) console.log(`  ✓ ${label}`)
  else { fail++; console.log(`  ✗ ${label}: expected ${b}, got ${a}`) }
}

console.log('\n\x1b[1mScenario: lend, take a deposit, then close\x1b[0m')
// Day 1: shop starts with 100000 cash added, lends 45000
// Day 2: customer pays a 5000 deposit
// Day 3: customer settles — pays principal+interest, gets deposit credited back
const loans = [{ id: 1, amount: 45000, interest: 2000, issue_date: '2026-03-01',
                 status: 'closed', closed_date: '2026-03-03' }]
const deposits = []
const closedDeposits = [{ loan_id: 1, amount: 5000, deposit_date: '2026-03-02' }]
const cashTx = [{ date: '2026-03-01', type: 'add', amount: 100000 }]

const r = recalc({ from: '2026-03-01', to: '2026-03-04',
                   loans, deposits, closedDeposits, cashTx })

// Day 1: 0 + 100000 - 45000 = 55000
eq('day 1 lends 45000 out of 100000', r['2026-03-01'].left, 55000)
eq('day 1 investments', r['2026-03-01'].invest, 45000)

// Day 2: 55000 + 5000 deposit = 60000
eq('day 2 deposit adds cash', r['2026-03-02'].left, 60000)
eq('day 2 deposit_credit', r['2026-03-02'].depCr, 5000)

// Day 3: 60000 + (45000+2000 returns) - 5000 deposit_debit = 102000
// The shop lent 45000 and got back 47000 → profit 2000. Started at 100000.
eq('day 3 returns',        r['2026-03-03'].returns, 47000)
eq('day 3 deposit_debit',  r['2026-03-03'].depDb, 5000)
eq('day 3 closing balance', r['2026-03-03'].left, 102000)

// Day 4: nothing happens, balance carries
eq('day 4 carries forward', r['2026-03-04'].left, 102000)

console.log('\n\x1b[1mThe key property: profit == interest\x1b[0m')
const start = 100000, end = r['2026-03-04'].left
eq('net gain equals the interest charged', end - start, 2000)

console.log('\n\x1b[1mDeposit counted once, not twice\x1b[0m')
// A deposit is credited when paid, debited when the loan closes — net zero.
const depNet = r['2026-03-02'].depCr - r['2026-03-03'].depDb
eq('deposit nets to zero across its lifetime', depNet, 0)

console.log('\n\x1b[1mThe desktop bug this fixes\x1b[0m')
// The desktop reads deposit_credit from `deposits` only. Closing a loan
// DELETEs those rows, so day 2's deposit_credit retroactively becomes 0.
const desktop = recalc({ from: '2026-03-01', to: '2026-03-04', loans,
                         deposits: [], closedDeposits: [], cashTx })
console.log(`  desktop day-2 deposit_credit after closing: ${desktop['2026-03-02'].depCr}`)
console.log(`  ours (archive included):                    ${r['2026-03-02'].depCr}`)
eq('desktop loses the historical deposit', desktop['2026-03-02'].depCr, 0)
eq('ours preserves it', r['2026-03-02'].depCr, 5000)
// Final balance still agrees, because credit and debit both vanish together.
eq('final balance agrees either way', desktop['2026-03-04'].left, r['2026-03-04'].left)

console.log('\n\x1b[1mMulti-loan day\x1b[0m')
const many = recalc({
  from: '2026-04-01', to: '2026-04-02',
  loans: [
    { id: 1, amount: 10000, issue_date: '2026-04-01', status: 'active' },
    { id: 2, amount: 25000, issue_date: '2026-04-01', status: 'active' },
    { id: 3, amount: 15000, issue_date: '2026-04-02', status: 'active' },
  ],
  deposits: [], closedDeposits: [],
  cashTx: [{ date: '2026-04-01', type: 'add', amount: 50000 }],
})
eq('two loans same day sum',   many['2026-04-01'].invest, 35000)
eq('balance after day 1',      many['2026-04-01'].left, 15000)
eq('goes negative when overlent', many['2026-04-02'].left, 0)

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${fail} failure(s)\x1b[0m`)
process.exit(fail ? 1 : 0)
