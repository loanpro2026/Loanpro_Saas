'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

const schema = z.object({
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})
type FormData = z.infer<typeof schema>

function destination() {
  const requested = new URLSearchParams(window.location.search).get('next')
  return requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard'
}

export default function LoginPage() {
  const router = useRouter()
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  /** Set when the account exists but the email was never confirmed. */
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    setUnconfirmed(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })
      if (error) throw error
      router.push(destination())
      router.refresh()
    } catch (err: any) {
      // Supabase answers both "wrong password" and "never confirmed your
      // email" with a 400 on the same endpoint. Telling them apart matters:
      // one means try again, the other means the password is fine and there is
      // a link sitting unread in an inbox. Showing "invalid credentials" for
      // the second sends people round in circles retyping a correct password.
      const code = err?.code ?? ''
      const msg  = String(err?.message ?? '')

      if (code === 'email_not_confirmed' || /not confirmed/i.test(msg)) {
        setUnconfirmed(data.email)
        toast.error('Confirm your email first — check your inbox.')
      } else if (code === 'invalid_credentials' || /invalid login/i.test(msg)) {
        toast.error('That email and password do not match.')
      } else {
        toast.error(msg || 'Could not sign in')
      }
    } finally {
      setLoading(false)
    }
  }

  const resendConfirmation = async () => {
    if (!unconfirmed) return
    const supabase = createClient()
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: unconfirmed,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(destination())}` },
    })
    toast[error ? 'error' : 'success'](
      error ? error.message : 'Sent. It can take a minute to arrive.'
    )
  }

  return (
    <div>
      <h1 className="sr-only">Sign in to your shop</h1>

      {/* A toast vanishes; this is the one error where the next step is not
          obvious, so it stays on screen until they act on it. */}
      {unconfirmed && (
        <div role="status" className="note-amber mb-3.5">
          <p className="font-semibold">This account is not confirmed yet</p>
          <p className="mt-0.5">
            We sent a link to <span className="font-semibold">{unconfirmed}</span>.
            Open it, then sign in. Check the spam folder too.
          </p>
          <button
            type="button"
            onClick={resendConfirmation}
            className="mt-1.5 underline underline-offset-2 hover:no-underline"
          >
            Send it again
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3.5">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          required
          error={errors.email?.message}
          {...register('email')}
        />
        <div className="relative">
          <Input
            label="Password"
            type={showPass ? 'text' : 'password'}
            placeholder="••••••••"
            autoComplete="current-password"
            required
            error={errors.password?.message}
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPass(p => !p)}
            className="absolute right-3 top-[34px] text-ink-faint transition-colors hover:text-ink-muted"
            aria-label={showPass ? 'Hide password' : 'Show password'}
          >
            {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <Button type="submit" size="lg" loading={loading} className="mt-0.5 w-full">
          Sign in
        </Button>

        <div className="flex items-center justify-between gap-3 text-12.5">
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">
            Forgot password?
          </Link>
          {/* Stated up front: a session is bound to this device, and signing in
              elsewhere will ask for approval. Better here than as a surprise. */}
          <span className="text-ink-faint">Device-locked session</span>
        </div>
      </form>

      <p className="mt-6 text-center text-13 text-ink-muted">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          Create one free
        </Link>
      </p>
    </div>
  )
}
