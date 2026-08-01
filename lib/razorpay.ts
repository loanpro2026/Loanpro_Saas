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

export function getRazorpayInstance() {
  return new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
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
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest('hex')
  return expected === razorpay_signature
}

export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(payload)
    .digest('hex')
  return expected === signature
}
