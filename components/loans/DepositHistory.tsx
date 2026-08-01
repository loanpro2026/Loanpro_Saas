'use client'
/**
 * Deposit history for one loan, with add and delete.
 *
 * Read-only once the loan is closed: the rows then come from
 * closed_record_deposits, which is the preserved archive that historical
 * reports are computed from. Editing it after the fact would silently change
 * figures the shop has already reported.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Plus, Trash2, ArrowDownCircle, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { formatCurrency, formatDate, todayIST } from '@/lib/utils'
import { addDeposit, deleteDeposit, updateDeposit } from '@/app/(app)/loans/actions'
import { useOffline } from '@/components/offline/OfflineProvider'

interface Deposit {
  id: number
  amount: number
  deposit_date: string
}

interface Props {
  loanId: number
  deposits: Deposit[]
  readOnly: boolean
  principal: number
}

export function DepositHistory({ loanId, deposits, readOnly, principal }: Props) {
  const router = useRouter()
  const { online, queueWrite } = useOffline()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Deposit | null>(null)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIST())
  const [pending, startTransition] = useTransition()

  const total = deposits.reduce((sum, d) => sum + Number(d.amount), 0)
  const pctRepaid = principal > 0 ? Math.min(100, (total / principal) * 100) : 0

  const onAdd = () => startTransition(async () => {
    const value = Number(amount)
    if (!value || value <= 0) { toast.error('Enter an amount'); return }

    // A customer standing at the counter having just handed over cash cannot
    // be told to come back when the internet works. Queue it instead — the
    // write carries a UUID, so replaying it later cannot double-post.
    if (!online) {
      await queueWrite('deposit', { loan_id: loanId, amount: value, date })
      toast.success(
        `${formatCurrency(value)} saved on this device — it will sync when you are back online`,
        { duration: 6000 }
      )
      setAdding(false); setAmount(''); setDate(todayIST())
      return
    }

    const res = await addDeposit(loanId, value, date)
    if (res.ok) {
      toast.success(`${formatCurrency(value)} recorded`)
      setAdding(false); setAmount(''); setDate(todayIST())
      router.refresh()
    } else {
      toast.error(res.error ?? 'Could not add the deposit')
    }
  })

  const openEdit = (d: Deposit) => {
    setEditing(d)
    setAmount(String(d.amount))
    setDate(d.deposit_date.slice(0, 10))
  }

  const onEdit = () => startTransition(async () => {
    if (!editing) return
    const value = Number(amount)
    if (!value || value <= 0) { toast.error('Enter an amount'); return }

    const res = await updateDeposit(editing.id, loanId, value, date)
    if (res.ok) {
      toast.success('Deposit updated')
      setEditing(null); setAmount(''); setDate(todayIST())
      router.refresh()
    } else toast.error(res.error ?? 'Could not update')
  })

  const onDelete = (id: number) => startTransition(async () => {
    const res = await deleteDeposit(id, loanId)
    if (res.ok) { toast.success('Deposit removed'); router.refresh() }
    else toast.error(res.error ?? 'Could not remove')
  })

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Deposits</h2>
          <p className="text-xs text-slate-500">
            {deposits.length === 0
              ? 'Nothing paid in yet'
              : `${formatCurrency(total)} across ${deposits.length} payment${deposits.length > 1 ? 's' : ''}`}
          </p>
        </div>
        {!readOnly && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        )}
      </div>

      {/* Progress against principal — the shop's usual question is
          "how much has this customer paid off?" */}
      {total > 0 && (
        <div>
          <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${pctRepaid}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            {pctRepaid.toFixed(0)}% of principal repaid
          </p>
        </div>
      )}

      {deposits.length === 0 ? (
        <p className="text-sm text-slate-400 py-2">No deposits recorded.</p>
      ) : (
        <ul className="divide-y divide-surface-border -mx-1">
          {deposits.map(d => (
            <li key={d.id} className="flex items-center gap-3 py-2.5 px-1">
              <ArrowDownCircle className="h-4 w-4 text-emerald-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium tabular-nums">
                  {formatCurrency(Number(d.amount))}
                </p>
                <p className="text-xs text-slate-500">{formatDate(d.deposit_date)}</p>
              </div>
              {!readOnly && (
                <>
                  <button
                    onClick={() => openEdit(d)}
                    disabled={pending}
                    className="btn-icon text-slate-400 hover:text-primary-700"
                    aria-label={`Edit deposit of ${formatCurrency(Number(d.amount))}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(d.id)}
                    disabled={pending}
                    className="btn-icon text-slate-400 hover:text-red-600"
                    aria-label={`Remove deposit of ${formatCurrency(Number(d.amount))}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {readOnly && deposits.length > 0 && (
        <p className="text-xs text-slate-400">
          This loan is closed — its deposit history is preserved and cannot be edited.
        </p>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Record a deposit" size="sm">
        <div className="space-y-4">
          <Input
            label="Amount"
            type="number"
            min={1}
            value={amount}
            autoFocus
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
          />
          <Input
            label="Date"
            type="date"
            value={date}
            max={todayIST()}
            onChange={e => setDate(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
            <Button onClick={onAdd} loading={pending}>Record deposit</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit deposit"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Changing the amount or date adjusts the cash book for both the old
            and the new day.
          </p>
          <Input
            label="Amount" type="number" min={1} autoFocus
            value={amount} onChange={e => setAmount(e.target.value)}
          />
          <Input
            label="Date" type="date" max={todayIST()}
            value={date} onChange={e => setDate(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={onEdit} loading={pending}>Save changes</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
