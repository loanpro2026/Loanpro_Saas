'use client'
/**
 * Record cash going into or out of the drawer.
 *
 * Goes through `record_cash_transaction` rather than inserting directly: cash
 * is a running balance, so a new entry changes every subsequent day's closing
 * figure. The previous version inserted straight into the table, which left
 * `daily_cash_summary` stale until something else recalculated it.
 */
import { useState, useTransition } from 'react'
import { Plus, CloudOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { formatCurrency, todayIST } from '@/lib/utils'
import { recordCash } from '@/app/(app)/loans/actions'
import { useOffline } from '@/components/offline/OfflineProvider'

export function CashTxButton() {
  const router = useRouter()
  const { online, queueWrite } = useOffline()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const [type, setType] = useState<'add' | 'remove'>('add')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(todayIST())

  const reset = () => {
    setType('add'); setAmount(''); setReason(''); setDate(todayIST())
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = Number(amount)

    if (!value || value <= 0) { toast.error('Enter a cash amount greater than zero. No transaction was recorded.'); return }
    if (!reason.trim()) { toast.error('Add a reason so this transaction can be identified in the cash book.'); return }

    startTransition(async () => {
      if (!online) {
        await queueWrite('cash', { type, amount: value, reason: reason.trim(), date })
        toast.success(
          `${formatCurrency(value)} saved on this device — it will sync when you are back online`,
          { duration: 6000 }
        )
        reset(); setOpen(false)
        return
      }

      const res = await recordCash(type, value, reason.trim(), date)
      if (res.ok) {
        toast.success(`${formatCurrency(value)} ${type === 'add' ? 'added to' : 'removed from'} the cash drawer for “${reason.trim()}” on ${date}.`)
        reset(); setOpen(false)
        router.refresh()
      } else {
        toast.error(`The ${formatCurrency(value)} cash ${type === 'add' ? 'addition' : 'removal'} was not recorded. ${res.error ?? 'The cash book is unchanged.'}`)
      }
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add Transaction
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Cash transaction">
        <form onSubmit={onSubmit} className="space-y-4">
          {!online && (
            <p className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 rounded-lg px-3 py-2">
              <CloudOff className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              No internet. This will be saved on this device and sent when the
              connection returns.
            </p>
          )}

          <Select
            label="Type"
            required
            value={type}
            onChange={e => setType(e.target.value as 'add' | 'remove')}
            options={[
              { value: 'add', label: 'Cash in — money into the drawer' },
              { value: 'remove', label: 'Cash out — money taken out' },
            ]}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Amount (₹)" required type="number" min={1} placeholder="0"
              value={amount} onChange={e => setAmount(e.target.value)}
            />
            <Input
              label="Date" required type="date" max={todayIST()}
              value={date} onChange={e => setDate(e.target.value)}
            />
          </div>

          <Input
            label="Reason" required
            placeholder="e.g. Withdrawn from bank, shop rent"
            value={reason} onChange={e => setReason(e.target.value)}
            helper="This shows in the cash book and the daily report"
          />

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} className="flex-1">
              {online ? 'Save' : 'Save on this device'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
