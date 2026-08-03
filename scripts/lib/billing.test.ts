import { strict as assert } from 'node:assert'
import { assertCheckoutEnabled, getBillingMode } from '../../lib/razorpay'

const original = {
  mode: process.env.BILLING_MODE,
  key: process.env.RAZORPAY_KEY_ID,
  secret: process.env.RAZORPAY_KEY_SECRET,
}

function restore() {
  if (original.mode === undefined) delete process.env.BILLING_MODE
  else process.env.BILLING_MODE = original.mode
  if (original.key === undefined) delete process.env.RAZORPAY_KEY_ID
  else process.env.RAZORPAY_KEY_ID = original.key
  if (original.secret === undefined) delete process.env.RAZORPAY_KEY_SECRET
  else process.env.RAZORPAY_KEY_SECRET = original.secret
}

try {
  delete process.env.BILLING_MODE
  assert.equal(getBillingMode(), 'disabled', 'billing must default to disabled')

  process.env.BILLING_MODE = 'unexpected'
  assert.equal(getBillingMode(), 'disabled', 'unknown modes must fail closed')

  process.env.BILLING_MODE = 'test'
  delete process.env.RAZORPAY_KEY_ID
  delete process.env.RAZORPAY_KEY_SECRET
  assert.throws(() => assertCheckoutEnabled(), /RAZORPAY_KEY_ID is not configured/)

  process.env.RAZORPAY_KEY_ID = 'rzp_live_wrong_environment'
  process.env.RAZORPAY_KEY_SECRET = 'secret'
  assert.throws(() => assertCheckoutEnabled(), /requires a rzp_test_ Razorpay key/)

  process.env.RAZORPAY_KEY_ID = 'rzp_test_example'
  assert.equal(assertCheckoutEnabled(), 'test')

  process.env.BILLING_MODE = 'live'
  assert.throws(() => assertCheckoutEnabled(), /requires a rzp_live_ Razorpay key/)

  console.log('billing mode: 6/6 passed')
} finally {
  restore()
}
