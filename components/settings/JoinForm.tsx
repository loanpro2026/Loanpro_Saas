'use client'
/**
 * Accept a staff invitation.
 *
 * The whole check lives in `accept_invitation()` (migration 005): the token
 * must be unused and unexpired, and the signed-in email must match the invited
 * one. That last rule is what stops a forwarded link letting whoever finds it
 * into someone's loan book.
 */
import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { UserPlus, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

export function JoinForm({ token }: { token: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setEmail(user?.email ?? null)
      setChecking(false)
    })()
  }, [])

  const onAccept = () => startTransition(async () => {
    const supabase = createClient()
    const { error } = await supabase.rpc('accept_invitation', { p_token: token })

    if (error) { setError(error.message); return }

    toast.success(`Invitation accepted for ${email}. This account can now open the shop dashboard.`)
    router.push('/dashboard')
    router.refresh()
  })

  if (!token) {
    return (
      <Card icon={AlertCircle} tone="bad" title="Invitation link is incomplete">
        <p>Ask whoever invited you to send the full link again.</p>
      </Card>
    )
  }

  if (checking) {
    return <Card icon={UserPlus} title="Checking your invitation"><p>One moment…</p></Card>
  }

  if (!email) {
    // Sign-up rather than sign-in: an invited person almost never has an
    // account yet, and the redirect brings them straight back here.
    const back = encodeURIComponent(`/join?token=${token}`)
    return (
      <Card icon={UserPlus} title="You have been invited">
        <p>
          Create an account with the email address the invitation was sent to,
          then you will be brought back here.
        </p>
        <div className="flex gap-2 pt-1">
          <Button onClick={() => router.push(`/register?next=${back}`)} className="flex-1">
            Create account
          </Button>
          <Button variant="secondary" onClick={() => router.push(`/login?next=${back}`)}>
            Sign in
          </Button>
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card icon={AlertCircle} tone="bad" title="This invitation cannot be used">
        <p>{error}</p>
        <p className="text-xs text-slate-400">
          You are signed in as <strong>{email}</strong>. If the invitation was
          sent to a different address, sign out and use that one instead.
        </p>
        <Button variant="secondary" onClick={() => router.push('/login')} className="w-full">
          Sign in as someone else
        </Button>
      </Card>
    )
  }

  return (
    <Card icon={UserPlus} title="Join this shop">
      <p>
        You are signed in as <strong>{email}</strong>. Accepting will give this
        account access to the shop&rsquo;s loan records.
      </p>
      <Button onClick={onAccept} loading={pending} className="w-full">
        Accept invitation
      </Button>
    </Card>
  )
}

function Card({
  icon: Icon, title, tone, children,
}: {
  icon: React.ElementType
  title: string
  tone?: 'bad'
  children: React.ReactNode
}) {
  return (
    <div className="card space-y-3 text-center">
      <span className={`mx-auto h-11 w-11 rounded-2xl flex items-center justify-center ${
        tone === 'bad' ? 'bg-red-100 text-red-600' : 'bg-primary-100 text-primary-700'
      }`}>
        <Icon className="h-5 w-5" />
      </span>
      <h1 className="text-base font-semibold text-slate-900">{title}</h1>
      <div className="text-sm text-slate-600 space-y-3">{children}</div>
    </div>
  )
}
