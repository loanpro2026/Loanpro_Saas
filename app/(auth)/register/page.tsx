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
  full_name:  z.string().min(2, 'Enter your full name'),
  shop_name:  z.string().min(2, 'Enter your shop name'),
  email:      z.string().email('Enter a valid email'),
  password:   z.string().min(8, 'Password must be at least 8 characters'),
})
type FormData = z.infer<typeof schema>

function destination() {
  const requested = new URLSearchParams(window.location.search).get('next')
  return requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard'
}

export default function RegisterPage() {
  const router = useRouter()
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const supabase = createClient()

      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: { full_name: data.full_name, shop_name: data.shop_name },
          emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(destination())}`,
        },
      })
      if (authError) throw authError
      if (!authData.user) throw new Error('Registration failed')

      // If email confirmation is on, there is no session yet, so the tenant
      // cannot be provisioned until the user confirms and signs in.
      if (!authData.session) {
        toast.success('Check your email to confirm your account, then sign in.')
        router.push('/login')
        return
      }

      // 2. Provision tenant + owner. auth_id and email are taken from the
      //    session server-side — deliberately not sent from here.
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: data.full_name,
          shop_name: data.shop_name,
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || 'Setup failed')
      }

      toast.success('Account created! Welcome to LoanPro.')
      router.push(destination())
      router.refresh()
    } catch (err: any) {
      toast.error(err?.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-17 font-bold text-ink">Create your account</h1>
        <p className="mt-1 text-12.5 text-ink-muted">Start your 60-day free trial. No credit card needed.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="Your Full Name"
          type="text"
          placeholder="Rajan Sharma"
          autoComplete="name"
          required
          error={errors.full_name?.message}
          {...register('full_name')}
        />
        <Input
          label="Shop Name"
          type="text"
          placeholder="Sharma Gold House"
          required
          error={errors.shop_name?.message}
          {...register('shop_name')}
        />
        <Input
          label="Email Address"
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
            placeholder="At least 8 characters"
            autoComplete="new-password"
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

        <Button type="submit" loading={loading} className="w-full mt-2">
          Create Account & Start Free Trial
        </Button>
      </form>

      <p className="mt-4 text-xs text-slate-400 text-center">
        By creating an account you agree to our{' '}
        <Link href="/terms" className="underline">Terms</Link> and{' '}
        <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </p>

      <p className="mt-5 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-primary-700 hover:text-primary-800">
          Log in
        </Link>
      </p>
    </div>
  )
}
