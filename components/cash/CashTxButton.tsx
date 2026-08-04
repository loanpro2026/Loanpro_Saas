'use client'
/**
 * Record cash going into or out of the drawer.
 *
 * Two buttons rather than one with a type dropdown, as the design has it: money
 * in and money out are different intentions, and picking the wrong one from a
 * select is a mistake that silently doubles an error in the closing balance.
 * The direction is fixed by the button you pressed and shown in the dialog.
 *
 * Goes through `record_cash_transaction` rather than inserting directly: cash
 * is a running balance, so a new entry changes every subsequent day's closing
 * figure. Inserting straight into the table leaves `daily_cash_summary` stale
 * until something else recalculates it.
 */
import { useState, useTransition } from 'react'
import { CloudOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { userFacingError } from '@/lib/user-message'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { formatCurrency, todayIST } from '@/lib/utils'
import { recordCash } from '@/app/(app)/loans/actions'
import { useOffline } from '@/components/offline/OfflineProvider'

type TxType = 'add' | 'remove'

export function CashTxButton() {
  const router = useRouter()
  const { online, queueWrite } = useOffline()
  const [type, setType] = useState<TxType | null>(null)
  const [pending, startTransition] = useTransition()

  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(todayIST())

  const close = () => {
    setType(null); setAmount(''); setReason(''); setDate(todayIST())
  }

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!type) return
    const value = Number(amount)

    if (!value || value <= 0) {
      toast.error('Enter a cash amount greater than zero. No transaction was recorded.')
      return
    }
    if (!reason.trim()) {
      toast.error('Add a reason so this transaction can be identified in the cash book.')
      return
    }

    startTransition(async () => {
      if (!online) {
        await queueWrite('cash', { type, amount: value, reason: reason.trim(), date })
        toast.success(
          `${formatCurrency(value)} saved on this device — it will sync when you are back online`,
          { duration: 6000 }
        )
        close()
        return
      }

      const result = await recordCash(type, value, reason.trim(), date)
      if (result.ok) {
        toast.success(
          `${formatCurrency(value)} ${type === 'add' ? 'added to' : 'removed from'} the cash drawer ` +
          `for “${reason.trim()}” on ${date}.`
        )
        close()
        router.refresh()
        return
      }
      toast.error(userFacingError(
        result.error,
        `The ${formatCurrency(value)} cash ${type === 'add' ? 'addition' : 'removal'} was not recorded. The cash book is unchanged.`,
      ))
    })
  }

  const adding = type === 'add'

  return (
    <>
      <div className="flex gap-2">
        <Button variant="success" onClick={() => setType('add')}>+ Add cash</Button>
        <Button variant="warn" onClick={() => setType('remove')}>− Remove cash</Button>
      </div>

      <Modal
        open={type !== null}
        onClose={close}
        size="sm"
        title={adding ? 'Add cash to drawer' : 'Remove cash from drawer'}
        subtitle={
          adding
            ? "Increases today's cash in hand with a reason on record."
            : "Reduces today's cash in hand with a reason on record."
        }
      >
        <form onSubmit={onSubmit}>
          {!online && (
            <p className="note-amber mt-4 flex items-start gap-2">
              <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              No internet. This will be saved on this device and sent when the connection returns.
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cash-amount" className="label">Amount (₹)</label>
              <input
                id="cash-amount" type="number" min={1} required autoFocus placeholder="10,000"
                value={amount} onChange={event => setAmount(event.target.value)}
                className="input-money"
              />
            </div>
            <div>
              <label htmlFor="cash-date" className="label">Date</label>
              <input
                id="cash-date" type="date" required max={todayIST()}
                value={date} onChange={event => setDate(event.target.value)}
                className="input-lg"
              />
            </div>
          </div>

          <div className="mt-3">
            <label htmlFor="cash-reason" className="label">Reason</label>
            <textarea
              id="cash-reason" rows={2} required
              placeholder={adding ? 'Morning opening float…' : 'Bank deposit, shop rent…'}
              value={reason} onChange={event => setReason(event.target.value)}
              className="textarea resize-none"
            />
            <p className="mt-1 text-11.5 text-ink-faint">
              This shows in the cash book and the daily report.
            </p>
          </div>

          <div className="modal-actions">
            <Button variant="secondary" type="button" onClick={close}>Cancel</Button>
            <Button
              type="submit"
              variant={adding ? 'primary' : 'danger'}
              loading={pending}
              className={adding ? 'bg-green hover:brightness-110' : 'bg-amber hover:brightness-110'}
            >
              {online ? (adding ? 'Add cash' : 'Remove cash') : 'Save on this device'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
