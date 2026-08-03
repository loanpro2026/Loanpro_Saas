'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/reset-password`,
    })
    setLoading(false)
    if (resetError) { setError(resetError.message); return }
    // Keep this response the same whether the address exists or not.
    setSent(true)
  }

  if (sent) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Check your email</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          If an account exists for <span className="font-medium">{email}</span>, we sent a secure password-reset link.
        </p>
        <Button className="mt-6 w-full" variant="secondary" onClick={() => setSent(false)}>Send another link</Button>
        <p className="mt-5 text-center text-sm"><Link href="/login" className="font-semibold text-primary-700">Back to sign in</Link></p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Reset your password</h1>
      <p className="mb-7 mt-1.5 text-sm text-slate-500">We’ll email you a secure link to choose a new password.</p>
      <form onSubmit={submit} className="space-y-4">
        <Input label="Email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} error={error || undefined} />
        <Button type="submit" className="w-full" loading={loading}>Send reset link</Button>
      </form>
      <p className="mt-5 text-center text-sm"><Link href="/login" className="font-semibold text-primary-700">Back to sign in</Link></p>
    </div>
  )
}
