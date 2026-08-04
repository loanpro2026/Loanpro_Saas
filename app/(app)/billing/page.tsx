'use client'
import { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle2, FlaskConical, Star } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PLANS } from '@/lib/razorpay'
import toast from 'react-hot-toast'
import { userFacingError } from '@/lib/user-message'

declare global { interface Window { Razorpay: any } }

const PLAN_FEATURES: Record<string, string[]> = {
  basic: ['Unlimited active loans', 'Customer photo capture', 'Deposits & cash tracking', 'Daily reports', 'Mobile PWA'],
  pro:   ['Everything in Basic', 'Advanced analytics', 'CSV/PDF export', 'Multi-staff accounts', 'Priority support', 'Google Drive backup'],
}

export default function BillingPage() {
  const [loading, setLoading] = useState<string | null>(null)
  const [billingMode, setBillingMode] = useState<'loading' | 'disabled' | 'test' | 'live' | 'error'>('loading')
  const [billingError, setBillingError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let script: HTMLScriptElement | null = null
    let cancelled = false

    setBillingError(null)
    fetch('/api/billing')
      .then(async r => {
        if (!r.ok) throw new Error(`Configuration request failed (${r.status})`)
        return r.json()
      })
      .then(({ mode, enabled }) => {
        if (cancelled) return
        const safeMode = mode === 'test' || mode === 'live' ? mode : 'disabled'
        setBillingMode(safeMode)
        if (!enabled) return

        script = document.createElement('script')
        script.src = 'https://checkout.razorpay.com/v1/checkout.js'
        script.async = true
        document.head.appendChild(script)
      })
      .catch(error => {
        if (cancelled) return
        setBillingError(error instanceof Error ? error.message : 'Please try again.')
        setBillingMode('error')
      })

    return () => {
      cancelled = true
      script?.remove()
    }
  }, [retryKey])

  const handleSubscribe = async (planId: string) => {
    if (billingMode === 'disabled' || billingMode === 'loading' || billingMode === 'error') {
      toast('Payments are disabled during testing. Your free trial remains active.')
      return
    }
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
            toast.success('Payment confirmed. Your LoanPro subscription is now active.')
            window.location.href = '/dashboard'
          } else {
            toast.error('Your payment was received, but the subscription could not be confirmed. Do not pay again; contact support with your payment receipt.')
          }
        },
        prefill:  {},
        theme:    { color: '#312e81' },
        modal:    { ondismiss: () => setLoading(null) },
      }

      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', (r: any) => {
        toast.error(userFacingError(
          r.error?.description,
          'The payment was not completed. No subscription change was made; check the payment details and try again.',
        ))
        setLoading(null)
      })
      rzp.open()
    } catch (err: any) {
      toast.error(userFacingError(
        err,
        'Checkout could not be opened. No payment was taken; wait a moment and try again.',
      ))
      setLoading(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="page-title">Plan &amp; billing</h1>
        <p className="page-subtitle mt-1">Upgrade to continue using LoanPro after your trial ends.</p>
      </div>

      {billingMode === 'error' && (
        <div className="card flex flex-col gap-3 border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center" role="alert">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Billing options could not be loaded</p>
            <p className="mt-0.5 text-xs">{billingError}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setBillingMode('loading'); setRetryKey(key => key + 1) }}
          >
            Try again
          </Button>
        </div>
      )}

      {billingMode === 'disabled' && (
        <div className="card flex items-start gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <FlaskConical className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Checkout is disabled during testing</p>
            <p className="mt-1 text-amber-800">
              No payment can be created or accepted. Your 60-day trial continues normally.
            </p>
          </div>
        </div>
      )}

      {billingMode === 'test' && (
        <div className="card flex items-center gap-2 border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-800">
          <FlaskConical className="h-4 w-4" /> Razorpay test mode — no real money will be charged.
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-5">
        {(Object.entries(PLANS) as [string, typeof PLANS[keyof typeof PLANS]][]).map(([planId, plan]) => {
          const isPro = planId === 'pro'
          return (
            <div key={planId} className={`card relative flex flex-col p-5 ${isPro ? 'border-2 border-primary-600 shadow-lg' : ''}`}>
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
              <ul className="mb-6 flex-1 space-y-2.5">
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
                disabled={billingMode === 'disabled' || billingMode === 'loading' || billingMode === 'error'}
                onClick={() => handleSubscribe(planId)}
              >
                {loading === planId
                  ? ''
                  : billingMode === 'disabled'
                    ? 'Checkout disabled during testing'
                    : billingMode === 'loading'
                      ? 'Checking availability…'
                      : billingMode === 'error'
                        ? 'Billing unavailable'
                        : `Subscribe to ${plan.name}`}
              </Button>
            </div>
          )
        })}
      </div>

      {billingMode !== 'disabled' && (
        <p className="text-xs text-center text-slate-400">
          Payments are processed securely by Razorpay. Cancel anytime from your settings.
        </p>
      )}
    </div>
  )
}
