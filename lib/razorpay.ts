import Razorpay from 'razorpay'
import crypto from 'crypto'

export const PLANS = {
  basic: {
    id:          'basic',
    name:        'Basic',
    price:       49900,       // paise = ₹499
    currency:    'INR',
    description: 'Unlimited loans, photos, deposits & reports',
  },
  pro: {
    id:          'pro',
    name:        'Pro',
    price:       99900,       // paise = ₹999
    currency:    'INR',
    description: 'Everything in Basic + analytics, export, multi-staff',
  },
} as const

export type PlanId = keyof typeof PLANS
export type BillingMode = 'disabled' | 'test' | 'live'

export function getBillingMode(): BillingMode {
  const mode = String(process.env.BILLING_MODE ?? 'disabled').toLowerCase()
  return mode === 'test' || mode === 'live' ? mode : 'disabled'
}

function requireSecret(name: 'RAZORPAY_KEY_ID' | 'RAZORPAY_KEY_SECRET' | 'RAZORPAY_WEBHOOK_SECRET') {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export function assertCheckoutEnabled() {
  const mode = getBillingMode()
  if (mode === 'disabled') {
    throw new Error('Payments are disabled while LoanPro is in testing')
  }

  const keyId = requireSecret('RAZORPAY_KEY_ID')
  requireSecret('RAZORPAY_KEY_SECRET')
  const expectedPrefix = mode === 'live' ? 'rzp_live_' : 'rzp_test_'
  if (!keyId.startsWith(expectedPrefix)) {
    throw new Error(`BILLING_MODE=${mode} requires a ${expectedPrefix} Razorpay key`)
  }
  return mode
}

export function getRazorpayInstance() {
  assertCheckoutEnabled()
  return new Razorpay({
    key_id:     requireSecret('RAZORPAY_KEY_ID'),
    key_secret: requireSecret('RAZORPAY_KEY_SECRET'),
  })
}

export async function createOrder(planId: PlanId) {
  const plan = PLANS[planId]
  const rz   = getRazorpayInstance()

  const order = await rz.orders.create({
    amount:   plan.price,
    currency: plan.currency,
    notes:    { plan_id: planId },
  })

  return order
}

export function verifyPaymentSignature(params: {
  razorpay_order_id:   string
  razorpay_payment_id: string
  razorpay_signature:  string
}): boolean {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = params
  const body = `${razorpay_order_id}|${razorpay_payment_id}`
  const expected = crypto
    .createHmac('sha256', requireSecret('RAZORPAY_KEY_SECRET'))
    .update(body)
    .digest('hex')
  const actual = Buffer.from(razorpay_signature, 'utf8')
  const wanted = Buffer.from(expected, 'utf8')
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted)
}

export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', requireSecret('RAZORPAY_WEBHOOK_SECRET'))
    .update(payload)
    .digest('hex')
  const actual = Buffer.from(signature, 'utf8')
  const wanted = Buffer.from(expected, 'utf8')
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted)
}
