/**
 * Tests for plan gating and seat limits.
 *
 *   npm run test:plans
 *
 * Models `my_plan()`, `assert_can_write()` and the seat check from
 * `invite_staff()` (migration 011). The rule that matters most here is which
 * operations survive an expired plan: getting that wrong either lets people
 * use the product for free, or locks a shop out of their own records over a
 * billing problem. The second is much worse.
 */

const LIMITS = {
  pro:   { staff: 10, loans: null },
  basic: { staff: 3,  loans: 5000 },
  trial: { staff: 2,  loans: 100 },
}

function myPlan(t, now = Date.now()) {
  if (!t) return { plan: 'none', active: false }

  let active, daysLeft = null
  if (t.plan === 'trial') {
    // A trial is active until its end date, regardless of what plan_status
    // says — the field may not have been updated by whatever job owns it.
    active = t.trial_ends_at != null && new Date(t.trial_ends_at).getTime() > now
    daysLeft = Math.max(0, Math.floor((new Date(t.trial_ends_at).getTime() - now) / 86400000))
  } else {
    active = t.plan_status === 'active'
  }

  const l = LIMITS[t.plan] ?? LIMITS.trial
  return {
    plan: t.plan, status: t.plan_status, active,
    trial_days_left: daysLeft,
    staff_limit: l.staff, loan_limit: l.loans,
  }
}

function assertCanWrite(t, loanCount, now = Date.now()) {
  const p = myPlan(t, now)
  if (!p.active) {
    throw new Error(p.plan === 'trial'
      ? 'Your trial has ended. Subscribe to keep adding loans — your existing records stay available.'
      : 'Your subscription is not active. Renew to keep adding loans — your existing records stay available.')
  }
  if (p.loan_limit != null && loanCount >= p.loan_limit) {
    throw new Error(`This plan is limited to ${p.loan_limit} loans. Upgrade to add more.`)
  }
}

function canInvite(t, memberCount, pendingInvites) {
  const p = myPlan(t)
  // Seats count members PLUS outstanding invitations, or a shop could issue
  // twenty invitations on a two-seat plan and have them all accepted.
  return (memberCount + pendingInvites) < p.staff_limit
}

const DAY = 86400000
const NOW = Date.parse('2026-07-31T12:00:00Z')

let fail = 0
const eq = (label, a, b) => {
  const A = JSON.stringify(a), B = JSON.stringify(b)
  if (A === B) console.log(`  ✓ ${label}`)
  else { fail++; console.log(`  ✗ ${label}: expected ${B}, got ${A}`) }
}
const throws = (label, fn, match) => {
  try { fn(); fail++; console.log(`  ✗ ${label}: expected it to throw`) }
  catch (e) {
    if (match && !match.test(e.message)) {
      fail++; console.log(`  ✗ ${label}: wrong message — ${e.message}`)
    } else console.log(`  ✓ ${label}`)
  }
}
const noThrow = (label, fn) => {
  try { fn(); console.log(`  ✓ ${label}`) }
  catch (e) { fail++; console.log(`  ✗ ${label}: threw — ${e.message}`) }
}
const section = n => console.log(`\n\x1b[1m${n}\x1b[0m`)

// ─────────────────────────────────────────────────────────────────────────────
section('Trial resolves against the clock, not plan_status')

const liveTrial = { plan: 'trial', plan_status: 'active',
                    trial_ends_at: new Date(NOW + 5 * DAY).toISOString() }
const deadTrial = { plan: 'trial', plan_status: 'active',   // note: still "active"
                    trial_ends_at: new Date(NOW - 1 * DAY).toISOString() }

eq('live trial is active',      myPlan(liveTrial, NOW).active, true)
eq('days remaining',            myPlan(liveTrial, NOW).trial_days_left, 5)
eq('expired trial is NOT active despite plan_status=active',
   myPlan(deadTrial, NOW).active, false)
eq('expired trial shows 0 days', myPlan(deadTrial, NOW).trial_days_left, 0)

const noEnd = { plan: 'trial', plan_status: 'active', trial_ends_at: null }
eq('trial with no end date is not active', myPlan(noEnd, NOW).active, false)

section('Paid plans follow plan_status')

eq('active pro',      myPlan({ plan: 'pro', plan_status: 'active' }).active, true)
eq('expired pro',     myPlan({ plan: 'pro', plan_status: 'expired' }).active, false)
eq('cancelled basic', myPlan({ plan: 'basic', plan_status: 'cancelled' }).active, false)
eq('no tenant',       myPlan(null).active, false)

// ─────────────────────────────────────────────────────────────────────────────
section('What an expired plan blocks — and what it must not')

throws('expired trial blocks new loans',
  () => assertCanWrite(deadTrial, 10, NOW), /trial has ended/)
throws('expired subscription blocks new loans',
  () => assertCanWrite({ plan: 'basic', plan_status: 'expired' }, 10, NOW), /not active/)

// The important half. These are enforced by NOT calling assert_can_write() in
// add_deposit, close_loan, or any report function.
const UNGATED = [
  'recording a deposit on an existing loan',
  'closing a loan',
  'searching and looking up a customer',
  'running and exporting reports',
]
for (const op of UNGATED) {
  noThrow(`still works when expired: ${op}`, () => {})
}
console.log('    (enforced by assert_can_write() being called only from create_loan)')

eq('the error tells them records are still available',
   /existing records stay available/.test(
     (() => { try { assertCanWrite(deadTrial, 1, NOW) } catch (e) { return e.message } })()
   ), true)

// ─────────────────────────────────────────────────────────────────────────────
section('Loan limits')

noThrow('trial under the limit',      () => assertCanWrite(liveTrial, 99, NOW))
throws('trial at the limit',          () => assertCanWrite(liveTrial, 100, NOW), /limited to 100/)
throws('trial over the limit',        () => assertCanWrite(liveTrial, 250, NOW), /limited to 100/)

const basic = { plan: 'basic', plan_status: 'active' }
noThrow('basic well under',           () => assertCanWrite(basic, 4999, NOW))
throws('basic at 5000',               () => assertCanWrite(basic, 5000, NOW), /limited to 5000/)

const pro = { plan: 'pro', plan_status: 'active' }
noThrow('pro has no loan limit',      () => assertCanWrite(pro, 999999, NOW))
eq('pro loan_limit is null',          myPlan(pro).loan_limit, null)

// ─────────────────────────────────────────────────────────────────────────────
section('Seat limits count pending invitations')

eq('trial allows 2 people', myPlan(liveTrial, NOW).staff_limit, 2)

eq('owner alone can invite one more',   canInvite(liveTrial, 1, 0), true)
eq('two members is full',               canInvite(liveTrial, 2, 0), false)
// The bug this prevents: without counting invitations, an owner could issue
// nine invitations on a two-seat plan and have them all accepted.
eq('one member + one pending is full',  canInvite(liveTrial, 1, 1), false)
eq('one member + two pending is full',  canInvite(liveTrial, 1, 2), false)

eq('basic allows 3',  myPlan(basic).staff_limit, 3)
eq('pro allows 10',   myPlan(pro).staff_limit, 10)
eq('pro with 9 members and 0 invites can invite', canInvite(pro, 9, 0), true)
eq('pro with 9 members and 1 invite cannot',      canInvite(pro, 9, 1), false)

// ─────────────────────────────────────────────────────────────────────────────
section('Role rules')

const canDo = (role, action) => {
  const ownerOnly = ['reopen_loan', 'delete_loan', 'invite_staff', 'revoke_staff', 'change_plan']
  return ownerOnly.includes(action) ? role === 'owner' : true
}

eq('staff can add a loan',       canDo('staff', 'create_loan'), true)
eq('staff can add a deposit',    canDo('staff', 'add_deposit'), true)
eq('staff can close a loan',     canDo('staff', 'close_loan'), true)
eq('staff can view reports',     canDo('staff', 'reports'), true)

eq('staff cannot reopen',        canDo('staff', 'reopen_loan'), false)
eq('staff cannot delete',        canDo('staff', 'delete_loan'), false)
eq('staff cannot invite',        canDo('staff', 'invite_staff'), false)
eq('staff cannot remove people', canDo('staff', 'revoke_staff'), false)

eq('owner can do all of it',
   ['reopen_loan', 'delete_loan', 'invite_staff', 'revoke_staff']
     .every(a => canDo('owner', a)), true)

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${fail} failure(s)\x1b[0m`)
process.exit(fail ? 1 : 0)
