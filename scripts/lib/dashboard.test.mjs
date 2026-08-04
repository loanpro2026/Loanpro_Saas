import assert from 'node:assert/strict'

const today = '2026-08-04'
const loans = [
  { id: 1, status: 'active', closed_date: null },
  { id: 2, status: 'closed', closed_date: today },
  { id: 3, status: 'closed', closed_date: '2026-08-03' },
]
const activeDeposits = [
  { loan_id: 1, amount: 2000, deposit_date: today },
]
const archivedDeposits = [
  { loan_id: 2, amount: 500, deposit_date: '2026-08-01' },
  { loan_id: 2, amount: 300, deposit_date: today },
  { loan_id: 3, amount: 700, deposit_date: today },
]

const allDeposits = [...activeDeposits, ...archivedDeposits]
const statusByLoan = new Map(loans.map(loan => [loan.id, loan]))

const held = activeDeposits
  .filter(deposit => statusByLoan.get(deposit.loan_id)?.status === 'active')
  .reduce((sum, deposit) => sum + deposit.amount, 0)
const receivedToday = allDeposits
  .filter(deposit => deposit.deposit_date === today)
  .reduce((sum, deposit) => sum + deposit.amount, 0)
const adjustedToday = allDeposits
  .filter(deposit => statusByLoan.get(deposit.loan_id)?.closed_date === today)
  .reduce((sum, deposit) => sum + deposit.amount, 0)

assert.equal(held, 2000, 'held balance contains only deposits on active loans')
assert.equal(receivedToday, 3000, 'received includes active and already-archived deposits dated today')
assert.equal(adjustedToday, 800, 'adjusted includes every deposit on loans closed today')
assert.notEqual(receivedToday, adjustedToday, 'received and adjusted are independent movements')

console.log('dashboard deposit semantics: 4/4 passed')
