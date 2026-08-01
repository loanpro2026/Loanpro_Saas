/**
 * Billing API
 * POST /api/billing        — create Razorpay order for a plan
 * PUT  /api/billing        — verify payment and activate subscription
 */
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server'
import { createOrder, verifyPaymentSignature, PLANS, type PlanId } from '@/lib/razorpay'
import { NextResponse } from 'next/server'

// POST — create order
export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: appUser } = await supabase.from('users').select('tenant_id').eq('auth_id', user.id).single()
  if (!appUser) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { plan_id } = await req.json()
  if (!plan_id || !PLANS[plan_id as PlanId]) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  try {
    const order = await createOrder(plan_id as PlanId)
    const plan  = PLANS[plan_id as PlanId]

    // Create pending subscription record
    const service = createServiceClient()
    await service.from('subscriptions').insert({
      tenant_id:        appUser.tenant_id,
      razorpay_order_id: order.id,
      plan:             plan_id,
      amount:           plan.price,
      currency:         plan.currency,
      status:           'pending',
    })

    return NextResponse.json({
      order_id:       order.id,
      amount:         order.amount,
      currency:       order.currency,
      key_id:         process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      plan_name:      plan.name,
    })
  } catch (err: any) {
    console.error('[billing/create-order]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT — verify payment signature and activate
export async function PUT(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: appUser } = await supabase.from('users').select('tenant_id').eq('auth_id', user.id).single()
  if (!appUser) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json()

  const valid = verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature })
  if (!valid) return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 })

  const service = createServiceClient()

  // Update subscription
  const startsAt  = new Date()
  const expiresAt = new Date(startsAt)
  expiresAt.setMonth(expiresAt.getMonth() + 1)

  const { data: sub } = await service
    .from('subscriptions')
    .update({
      razorpay_payment_id,
      status:     'active',
      starts_at:  startsAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .eq('razorpay_order_id', razorpay_order_id)
    .eq('tenant_id', appUser.tenant_id)
    .select('plan')
    .single()

  if (sub) {
    // Update tenant plan
    await service.from('tenants').update({
      plan:        sub.plan,
      plan_status: 'active',
    }).eq('id', appUser.tenant_id)
  }

  return NextResponse.json({ success: true })
}
