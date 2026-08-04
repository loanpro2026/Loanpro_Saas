import assert from 'node:assert/strict'
import { userFacingError } from '../../lib/user-message'

const fallback = 'The loan could not be saved. No record was added.'

assert.equal(
  userFacingError(new Error('Failed to fetch'), fallback),
  'Check your internet connection and try again. Your existing information is unchanged.',
)
assert.equal(
  userFacingError('JWT expired', fallback),
  'Your sign-in has expired. Sign in again, then retry.',
)
assert.equal(
  userFacingError('permission denied for relation loans', fallback),
  'Your account does not have permission for this action.',
)
assert.equal(userFacingError('Postgres SQLSTATE 23505', fallback), fallback)
assert.equal(userFacingError('This loan is already closed.', fallback), 'This loan is already closed.')
assert.equal(userFacingError('', fallback), fallback)
assert.equal(userFacingError('x'.repeat(181), fallback), fallback)

console.log('user-facing errors: 7/7 passed')
