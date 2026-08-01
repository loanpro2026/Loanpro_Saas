'use client'
import { useState, useEffect } from 'react'
import { CheckCircle2, Star, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PLANS } from '@/lib/razorpay'
import toast from 'react-hot-toast'

declare global { interface Window { Razorpay: any } }

const PLAN_FEATURES: Record<string, string[]> = {
  basic: ['Unlimited active loans', 'Customer photo capture', 'Deposits & cash tracking', 'Daily reports', 'Mobile PWA'],
  pro:   ['Everything in Basic', 'Advanced analytics', 'CSV/PDF export', 'Multi-staff accounts', 'Priority support', 'Google Drive backup'],
}

export default function BillingPage() {
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => {
    // Load Razorpay script
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [])

  const handleSubscribe = async (planId: string) => {
    setLoading(planId)
    try {
      // Create order
      const res = await fetch('/api/billing', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan_id: planId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const order = await res.json()

      // Open Razorpay checkout
      const options = {
        key:         order.key_id,
        amount:      order.amount,
        currency:    order.currency,
        name:        'LoanPro',
        description: `${order.plan_name} Plan — Monthly`,
        order_id:    order.order_id,
        handler:     async (response: any) => {
          // Verify payment
          const verifyRes = await fetch('/api/billing', {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(response),
          })
          if (verifyRes.ok) {
            toast.success('Subscription activated! Enjoy LoanPro.')
            window.location.href = '/dashboard'
          } else {
            toast.error('Payment received but verification failed. Contact support.')
          }
        },
        prefill:  {},
        theme:    { color: '#312e81' },
        modal:    { ondismiss: () => setLoading(null) },
      }

      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', (r: any) => {
        toast.error(`Payment failed: ${r.error?.description}`)
        setLoading(null)
      })
      rzp.open()
    } catch (err: any) {
      toast.error(err.message || 'Failed to initiate payment')
      setLoading(null)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="page-title">Choose a Plan</h1>
        <p className="page-subtitle mt-1">Upgrade to continue using LoanPro after your trial ends.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        {(Object.entries(PLANS) as [string, typeof PLANS[keyof typeof PLANS]][]).map(([planId, plan]) => {
          const isPro = planId === 'pro'
          return (
            <div key={planId} className={`card p-7 relative ${isPro ? 'border-2 border-primary-600 shadow-lg' : ''}`}>
              {isPro && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 bg-primary-700 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    <Star className="h-3 w-3 fill-current" /> Most Popular
                  </span>
                </div>
              )}
              <div className="mb-5">
                <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                <p className="text-sm text-slate-500 mt-1">{plan.description}</p>
                <div className="flex items-baseline gap-1 mt-4">
                  <span className="text-4xl font-extrabold text-slate-900 tabular-nums">
                    ₹{Math.round(plan.price / 100)}
                  </span>
                  <span className="text-slate-500">/month</span>
                </div>
              </div>
              <ul className="space-y-2.5 mb-7">
                {PLAN_FEATURES[planId]?.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                variant={isPro ? 'primary' : 'secondary'}
                loading={loading === planId}
                onClick={() => handleSubscribe(planId)}
              >
                {loading === planId ? '' : `Subscribe to ${plan.name}`}
              </Button>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-center text-slate-400">
        Payments are processed securely by Razorpay. Cancel anytime from your settings.
      </p>
    </div>
  )
}
