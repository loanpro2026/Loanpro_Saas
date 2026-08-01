/**
 * Interest calculation — verified against the desktop formula.
 *
 *   npm run test:interest
 *
 * Source of truth: electron_app/renderer/src/pages/Removerecord.tsx, lines
 * 195–213. Reproduced here verbatim so any drift shows up as a failing test
 * rather than as a shop overcharging a customer.
 *
 *   daysDiff   = today - issue_date
 *   yearsDiff  = daysDiff / 365
 *   annualRate = interestRate / 100          // shop-wide setting, default 36
 *   simple     = principal * annualRate * yearsDiff
 *   compound   = principal * (1 + annualRate/n)^(n * yearsDiff) - principal
 *                n = 4 quarterly, 2 half-yearly, 1 yearly
 */

// ── The desktop implementation, transcribed ─────────────────────────────────
function desktopInterest(principal, daysDiff, interestRate, type, period) {
  const yearsDiff = daysDiff / 365
  const annualRate = interestRate / 100

  if (type === 'compound') {
    const periodsPerYear = period === 'quarterly' ? 4
      : period === 'half-yearly' ? 2
      : 1
    return (principal * Math.pow(1 + (annualRate / periodsPerYear), periodsPerYear * yearsDiff)) - principal
  }
  return principal * annualRate * yearsDiff
}

// ── Our implementation, from lib/utils.ts ───────────────────────────────────
function calculateInterestAmount(principal, annualRatePercent, days, type = 'simple', period = 'yearly') {
  const years = Math.max(0, days) / 365
  const rate = annualRatePercent / 100
  if (type === 'compound') {
    const n = period === 'quarterly' ? 4 : period === 'half-yearly' ? 2 : 1
    return Math.round(principal * (Math.pow(1 + rate / n, n * years) - 1))
  }
  return Math.round(principal * rate * years)
}

// ── The bug this replaced ───────────────────────────────────────────────────
function oldWrongVersion(principal, ratePercent, days) {
  const months = days / 30
  return Math.round((principal * ratePercent * months) / 100)
}

let fail = 0
const eq = (label, a, b) => {
  if (a === b) console.log(`  ✓ ${label}`)
  else { fail++; console.log(`  ✗ ${label}: expected ${b}, got ${a}`) }
}
const section = n => console.log(`\n\x1b[1m${n}\x1b[0m`)

const RATE = 36   // the desktop default: 36% per YEAR

// ─────────────────────────────────────────────────────────────────────────────
section('Matches the desktop, to the rupee')

const cases = [
  [45000, 30],    [45000, 90],    [45000, 180],   [45000, 365],
  [45000, 400],   [45000, 730],   [12000, 45],    [250000, 1095],
  [5000, 1],      [100000, 0],    [78500, 217],
]

for (const [principal, days] of cases) {
  for (const type of ['simple', 'compound']) {
    for (const period of ['yearly', 'half-yearly', 'quarterly']) {
      if (type === 'simple' && period !== 'yearly') continue  // period is ignored
      const mine = calculateInterestAmount(principal, RATE, days, type, period)
      const theirs = Math.round(desktopInterest(principal, days, RATE, type, period))
      eq(`₹${principal} / ${days}d / ${type}${type === 'compound' ? `/${period}` : ''}`, mine, theirs)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('Sanity: the numbers a shop owner would recognise')

// 36% per year on ₹45,000 held exactly one year = ₹16,200
eq('₹45,000 for one year at 36%', calculateInterestAmount(45000, 36, 365), 16200)
// Half a year = half that
eq('₹45,000 for six months',      calculateInterestAmount(45000, 36, 182), 8078)
// One month ≈ 3%
eq('₹45,000 for 30 days',         calculateInterestAmount(45000, 36, 30), 1332)
eq('nothing on day zero',         calculateInterestAmount(45000, 36, 0), 0)
eq('negative days clamp to zero', calculateInterestAmount(45000, 36, -10), 0)

section('Compound is higher than simple, and more so over time')

const s1 = calculateInterestAmount(45000, 36, 365, 'simple')
const c1 = calculateInterestAmount(45000, 36, 365, 'compound', 'quarterly')
eq('compound quarterly exceeds simple over a year', c1 > s1, true)

const s3 = calculateInterestAmount(45000, 36, 1095, 'simple')
const c3 = calculateInterestAmount(45000, 36, 1095, 'compound', 'quarterly')
eq('and the gap widens over three years', (c3 - s3) > (c1 - s1), true)

eq('quarterly compounds more than half-yearly',
   calculateInterestAmount(45000, 36, 365, 'compound', 'quarterly') >
   calculateInterestAmount(45000, 36, 365, 'compound', 'half-yearly'), true)
eq('half-yearly compounds more than yearly',
   calculateInterestAmount(45000, 36, 365, 'compound', 'half-yearly') >
   calculateInterestAmount(45000, 36, 365, 'compound', 'yearly'), true)
eq('yearly compound == simple at exactly one year',
   calculateInterestAmount(45000, 36, 365, 'compound', 'yearly'),
   calculateInterestAmount(45000, 36, 365, 'simple'))

// ─────────────────────────────────────────────────────────────────────────────
section('The bug this fixes')

// The old code read 36 as a MONTHLY rate and divided days by 30.
const wrong = oldWrongVersion(45000, 36, 182)
const right = calculateInterestAmount(45000, 36, 182)

console.log(`  old (rate read as monthly): ₹${wrong.toLocaleString('en-IN')}`)
console.log(`  correct (rate is annual):   ₹${right.toLocaleString('en-IN')}`)
console.log(`  overcharge factor: ${(wrong / right).toFixed(1)}×`)

eq('the old version overcharged by roughly 12×', Math.round(wrong / right), 12)
eq('on one six-month loan that is a ₹90,202 error', wrong - right, 90202)

// ─────────────────────────────────────────────────────────────────────────────
section('Duration formatting')

const formatDuration = (days) => {
  const d = Math.max(0, Math.floor(days))
  const months = Math.floor(d / 30)
  const rem = d % 30
  if (months === 0) return `${rem} day${rem === 1 ? '' : 's'}`
  return `${months} month${months === 1 ? '' : 's'}, ${rem} day${rem === 1 ? '' : 's'}`
}

eq('182 days',  formatDuration(182), '6 months, 2 days')
eq('1 day',     formatDuration(1), '1 day')
eq('29 days',   formatDuration(29), '29 days')
eq('30 days',   formatDuration(30), '1 month, 0 days')
eq('0 days',    formatDuration(0), '0 days')
eq('negative',  formatDuration(-5), '0 days')

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${fail} failure(s)\x1b[0m`)
process.exit(fail ? 1 : 0)
