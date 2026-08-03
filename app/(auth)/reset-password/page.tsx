'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [ready, setReady] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    void createClient().auth.getUser().then(({ data }) => setReady(Boolean(data.user)))
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) { setError(updateError.message); setLoading(false); return }
    // Password recovery should invalidate existing sessions if the account may
    // have been compromised. Supabase clears this browser too after the update.
    await supabase.auth.signOut({ scope: 'global' })
    setDone(true)
    setLoading(false)
  }

  if (ready === null) return <p className="text-sm text-slate-500">Checking your reset link…</p>
  if (!ready) return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Reset link expired</h1>
      <p className="mt-2 text-sm text-slate-600">Request a fresh link and use the newest email we send.</p>
      <Link href="/forgot-password" className="mt-6 inline-block font-semibold text-primary-700">Request another link</Link>
    </div>
  )
  if (done) return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Password updated</h1>
      <p className="mt-2 text-sm text-slate-600">All devices have been signed out. Sign in again with your new password.</p>
      <Link href="/login" className="mt-6 inline-block font-semibold text-primary-700">Go to sign in</Link>
    </div>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Choose a new password</h1>
      <p className="mb-7 mt-1.5 text-sm text-slate-500">Use at least 8 characters.</p>
      <form onSubmit={submit} className="space-y-4">
        <Input label="New password" type="password" autoComplete="new-password" required value={password} onChange={event => setPassword(event.target.value)} />
        <Input label="Confirm password" type="password" autoComplete="new-password" required value={confirm} onChange={event => setConfirm(event.target.value)} error={error || undefined} />
        <Button type="submit" className="w-full" loading={loading}>Update password</Button>
      </form>
    </div>
  )
}
