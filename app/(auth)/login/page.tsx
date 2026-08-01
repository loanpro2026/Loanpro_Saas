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

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
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
      toast.error(err?.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
        <p className="text-slate-500 mt-1.5 text-sm">Log in to your shop account</p>
      </div>

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
