'use client'
/**
 * Finishes provisioning a shop for an account that already exists.
 *
 * Posts to the same /api/auth/register endpoint the signup flow uses, so there
 * is one path that creates a tenant rather than two that can drift apart.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export function SetupForm({
  defaultShopName,
  defaultFullName,
  email,
}: {
  defaultShopName: string
  defaultFullName: string
  email: string
}) {
  const router = useRouter()
  const [shopName, setShopName] = useState(defaultShopName)
  const [fullName, setFullName] = useState(defaultFullName)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!shopName.trim() || !fullName.trim()) {
      toast.error('Both fields are needed')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_name: shopName.trim(), full_name: fullName.trim() }),
      })
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({}))).error || 'Setup failed')
      }
      toast.success('All set.')
      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Signed in as <span className="font-medium text-slate-900">{email}</span>
      </p>

      <Input
        label="Your name"
        value={fullName}
        onChange={e => setFullName(e.target.value)}
        required
        maxLength={120}
      />
      <Input
        label="Shop name"
        value={shopName}
        onChange={e => setShopName(e.target.value)}
        placeholder="e.g. Sharma Jewellers"
        required
        maxLength={120}
      />

      <Button type="submit" loading={loading} className="w-full">
        Finish setup
      </Button>
    </form>
  )
}
