/**
 * Razorpay Webhook Handler
 * Handles: payment.captured, subscription.charged, subscription.cancelled
 */
import { createServiceClient } from '@/lib/supabase/server'
import { verifyWebhookSignature } from '@/lib/razorpay'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-razorpay-signature') ?? ''

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn('[webhook] Invalid Razorpay signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const event = JSON.parse(rawBody)
  const service = createServiceClient()

  try {
    switch (event.event) {
      case 'payment.captured': {
        const payment = event.payload?.payment?.entity
        if (!payment?.order_id) break

        await service.from('subscriptions')
          .update({ razorpay_payment_id: payment.id, status: 'active' })
          .eq('razorpay_order_id', payment.order_id)
          .eq('status', 'pending')
        break
      }

      case 'subscription.charged': {
        const sub = event.payload?.subscription?.entity
        if (!sub?.id) break

        // Extend expiry by 1 month
        const { data: existing } = await service
          .from('subscriptions')
          .select('expires_at')
          .eq('razorpay_subscription_id', sub.id)
          .single()

        const base = existing?.expires_at ? new Date(existing.expires_at) : new Date()
        base.setMonth(base.getMonth() + 1)

        await service.from('subscriptions')
          .update({ status: 'active', expires_at: base.toISOString() })
          .eq('razorpay_subscription_id', sub.id)
        break
      }

      case 'subscription.cancelled':
      case 'subscription.completed': {
        const sub = event.payload?.subscription?.entity
        if (!sub?.id) break

        const { data: existing } = await service
          .from('subscriptions')
          .select('tenant_id')
          .eq('razorpay_subscription_id', sub.id)
          .single()

        if (existing) {
          await service.from('subscriptions')
            .update({ status: 'cancelled' })
            .eq('razorpay_subscription_id', sub.id)

          await service.from('tenants')
            .update({ plan_status: 'expired' })
            .eq('id', existing.tenant_id)
        }
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('[webhook]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
