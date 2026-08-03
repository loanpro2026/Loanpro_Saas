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
      router.push('/dashboard')
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
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/dashboard` },
    })
    toast[error ? 'error' : 'success'](
      error ? error.message : 'Sent. It can take a minute to arrive.'
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
        <p className="text-slate-500 mt-1.5 text-sm">Log in to your shop account</p>
      </div>

      {/* A toast vanishes; this is the one error where the next step is not
          obvious, so it stays on screen until they act on it. */}
      {unconfirmed && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900"
        >
          <p className="font-medium">This account is not confirmed yet</p>
          <p className="mt-0.5 text-amber-800">
            We sent a link to <span className="font-medium">{unconfirmed}</span>.
            Open it, then sign in. Check the spam folder too.
          </p>
          <button
            type="button"
            onClick={resendConfirmation}
            className="mt-1.5 text-amber-900 underline underline-offset-2 hover:no-underline"
          >
            Send it again
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
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
            className="absolute right-3 top-8 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label={showPass ? 'Hide password' : 'Show password'}
          >
            {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <div className="-mt-1 text-right">
          <Link href="/forgot-password" className="text-xs font-medium text-primary-700 hover:text-primary-800">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" loading={loading} className="w-full">
          Log in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="font-semibold text-primary-700 hover:text-primary-800">
          Create one free
        </Link>
      </p>
    </div>
  )
}
