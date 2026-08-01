'use client'
import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { addDeposit } from '@/app/(app)/loans/actions'
import { useOffline } from '@/components/offline/OfflineProvider'

const schema = z.object({
  loan_search:   z.string().min(1, 'Search for a customer'),
  loan_id:       z.coerce.number().positive('Select a loan'),
  amount:        z.coerce.number().positive('Enter amount'),
  deposit_date:  z.string().min(1, 'Date is required'),
})
type FormData = z.infer<typeof schema>

interface Props {
  tenantId: string
}

export function AddDepositButton({ tenantId }: Props) {
  const [open,         setOpen]        = useState(false)
  const [loading,      setLoading]     = useState(false)
  const [loanResults,  setLoanResults] = useState<any[]>([])
  const [selectedLoan, setSelectedLoan] = useState<any>(null)
  const router = useRouter()
  const { online, queueWrite } = useOffline()

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    // IST, not UTC: after 18:30 UTC a shop in India is already on the next day.
    defaultValues: {
      deposit_date: new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10),
    },
  })

  const searchQuery = watch('loan_search')

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) { setLoanResults([]); return }
    const timer = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase.from('loans')
        .select('id, name, father_name, amount, category_type')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .ilike('name', `%${searchQuery}%`)
        .limit(6)
      setLoanResults(data ?? [])
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, tenantId])

  const selectLoan = (loan: any) => {
    setSelectedLoan(loan)
    setValue('loan_id', loan.id)
    setValue('loan_search', loan.name)
    setLoanResults([])
  }

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      // Queue rather than fail when the connection is down — a customer who
      // has just handed over cash cannot be asked to come back later. The
      // queued write carries a UUID, so replaying it cannot double-post.
      if (!online) {
        await queueWrite('deposit', {
          loan_id: data.loan_id,
          amount: data.amount,
          date: data.deposit_date,
        })
        toast.success('Saved on this device — it will sync when you are back online',
          { duration: 6000 })
        reset(); setSelectedLoan(null); setOpen(false)
        return
      }

      // Goes through add_deposit(), which also writes the daily deposit record
      // and re-chains the cash summary. The previous version inserted straight
      // into the table and left both stale.
      const res = await addDeposit(data.loan_id, data.amount, data.deposit_date)
      if (!res.ok) throw new Error(res.error ?? 'Failed to record deposit')

      toast.success('Deposit recorded')
      reset()
      setSelectedLoan(null)
      setOpen(false)
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to record deposit')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add Deposit
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Record Deposit">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Loan search */}
          <div className="relative">
            <Input
              label="Customer Name"
              required
              placeholder="Type to search active loans…"
              error={errors.loan_search?.message}
              {...register('loan_search')}
              autoComplete="off"
            />
            <input type="hidden" {...register('loan_id')} />

            {loanResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white rounded-xl border border-surface-border shadow-modal overflow-hidden">
                {loanResults.map(l => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => selectLoan(l)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 text-left text-sm"
                  >
                    <div>
                      <p className="font-medium">{l.name}</p>
                      {l.father_name && <p className="text-xs text-slate-400">S/o {l.father_name}</p>}
                    </div>
                    <span className={`badge ${l.category_type === 'Gold' ? 'badge-gold' : 'badge-silver'}`}>
                      ₹{l.amount.toLocaleString('en-IN')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedLoan && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
              Selected: <strong>{selectedLoan.name}</strong> — Loan ₹{selectedLoan.amount.toLocaleString('en-IN')}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Amount (₹)"
              required
              type="number"
              placeholder="0"
              error={errors.amount?.message}
              {...register('amount')}
            />
            <Input
              label="Date"
              required
              type="date"
              error={errors.deposit_date?.message}
              {...register('deposit_date')}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={loading} className="flex-1">Save Deposit</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
