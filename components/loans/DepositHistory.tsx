'use client'
/**
 * Deposit history for one loan, with add, edit and delete.
 *
 * Laid out as the design's four-column grid — amount, date, who entered it,
 * status — because a part-payment is a committed cash entry and a shop reading
 * this is auditing, not browsing.
 *
 * Read-only once the loan is closed: the rows then come from
 * closed_record_deposits, the preserved archive historical reports are computed
 * from. Editing it after the fact would silently change figures the shop has
 * already reported.
 *
 * Adding is offered only in the settlement workspace (`canAdd`). On a
 * read-only record the button would invite a transaction that screen is not
 * meant to take.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { formatCurrency, todayIST } from '@/lib/utils'
import { addDeposit, deleteDeposit, updateDeposit } from '@/app/(app)/loans/actions'
import { useOffline } from '@/components/offline/OfflineProvider'
import { useAppDate } from '@/components/settings/SettingsProvider'
import { userFacingError } from '@/lib/user-message'

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
  /** Show the "+ Add deposit" control. Settlement workspace only. */
  canAdd?: boolean
  /** One line beside the heading — the design puts the totals there. */
  summary?: React.ReactNode
}

export function DepositHistory({
  loanId, deposits, readOnly, principal, canAdd = false, summary,
}: Props) {
  const formatDate = useAppDate()
  const router = useRouter()
  const { online, queueWrite } = useOffline()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Deposit | null>(null)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIST())
  const [pending, startTransition] = useTransition()

  const total = deposits.reduce((sum, deposit) => sum + Number(deposit.amount), 0)
  const afterSaving = total + (Number(amount) || 0)

  const onAdd = () => startTransition(async () => {
    const value = Number(amount)
    if (!value || value <= 0) {
      toast.error(`Enter a deposit amount greater than zero for loan #${loanId}.`)
      return
    }

    // A customer standing at the counter having just handed over cash cannot be
    // told to come back when the internet works. Queue it instead — the write
    // carries a UUID, so replaying it later cannot double-post.
    if (!online) {
      await queueWrite('deposit', { loan_id: loanId, amount: value, date })
      toast.success(
        `${formatCurrency(value)} saved on this device — it will sync when you are back online`,
        { duration: 6000 }
      )
      setAdding(false); setAmount(''); setDate(todayIST())
      return
    }

    const result = await addDeposit(loanId, value, date)
    if (result.ok) {
      toast.success(`${formatCurrency(value)} deposit recorded on loan #${loanId} for ${formatDate(date)}.`)
      setAdding(false); setAmount(''); setDate(todayIST())
      router.refresh()
      return
    }
    toast.error(userFacingError(
      result.error,
      `The ${formatCurrency(value)} deposit was not recorded on loan #${loanId}. The cash book is unchanged.`,
    ))
  })

  const openEdit = (deposit: Deposit) => {
    setEditing(deposit)
    setAmount(String(deposit.amount))
    setDate(deposit.deposit_date.slice(0, 10))
  }

  const onEdit = () => startTransition(async () => {
    if (!editing) return
    const value = Number(amount)
    if (!value || value <= 0) {
      toast.error(`Enter a deposit amount greater than zero for loan #${loanId}.`)
      return
    }

    const result = await updateDeposit(editing.id, loanId, value, date)
    if (result.ok) {
      toast.success(`Deposit on loan #${loanId} updated to ${formatCurrency(value)} on ${formatDate(date)}.`)
      setEditing(null); setAmount(''); setDate(todayIST())
      router.refresh()
      return
    }
    toast.error(userFacingError(
      result.error,
      `The deposit on loan #${loanId} could not be updated. The original entry is unchanged.`,
    ))
  })

  const onDelete = (id: number) => startTransition(async () => {
    const result = await deleteDeposit(id, loanId)
    if (result.ok) {
      toast.success(`Deposit entry removed from loan #${loanId}; its cash history was recalculated.`)
      router.refresh()
      return
    }
    toast.error(userFacingError(
      result.error,
      `The deposit was not removed from loan #${loanId}. The original entry is unchanged.`,
    ))
  })

  return (
    <section id="deposits" className="card-flush" aria-labelledby="deposits-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2.5">
          <h2 id="deposits-title" className="card-title">Deposits</h2>
          <span className="text-12 text-ink-muted">
            {summary ?? (
              deposits.length === 0
                ? 'Nothing paid in yet'
                : `${formatCurrency(total)} across ${deposits.length} part-payment${deposits.length === 1 ? '' : 's'}`
            )}
          </span>
        </div>
        {canAdd && !readOnly && (
          <button type="button" onClick={() => setAdding(true)} className="btn-setting-primary">
            + Add deposit
          </button>
        )}
      </div>

      {deposits.length === 0 ? (
        <p className="px-4 py-6 text-13 text-ink-faint">No deposits recorded.</p>
      ) : (
        <>
          <div className="grid grid-cols-[110px_1fr_auto] gap-2.5 border-b border-surface-border
                          bg-surface-muted px-4 py-2 text-11 font-bold uppercase tracking-[0.04em]
                          text-ink-faint sm:grid-cols-[110px_1fr_130px_120px]">
            <span>Amount</span>
            <span>Date</span>
            <span className="hidden sm:block">Entered by</span>
            <span className="text-right sm:text-left">Status</span>
          </div>

          {deposits.map(deposit => (
            <div
              key={deposit.id}
              className="grid grid-cols-[110px_1fr_auto] items-center gap-2.5 border-b border-surface-border
                         px-4 py-2.5 text-12.5 last:border-0 sm:grid-cols-[110px_1fr_130px_120px]"
            >
              <span className="font-semibold tabular-nums text-ink">
                {formatCurrency(Number(deposit.amount))}
              </span>
              <span className="text-ink-muted">{formatDate(deposit.deposit_date)}</span>
              <span className="hidden text-ink-muted sm:block">Shop</span>
              <div className="flex items-center justify-end gap-1 sm:justify-start">
                <span className="badge-active">Committed</span>
                {!readOnly && (
                  <>
                    <button
                      type="button"
                      onClick={() => openEdit(deposit)}
                      disabled={pending}
                      className="btn-row-edit ml-1"
                      aria-label={`Edit deposit of ${formatCurrency(Number(deposit.amount))}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(deposit.id)}
                      disabled={pending}
                      className="btn-row-delete"
                      aria-label={`Remove deposit of ${formatCurrency(Number(deposit.amount))}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {readOnly && deposits.length > 0 && (
        <p className="border-t border-surface-border px-4 py-2.5 text-11.5 text-ink-faint">
          This loan is closed — its deposit history is preserved and cannot be edited.
        </p>
      )}

      {/* ── Add ────────────────────────────────────────────────────────────── */}
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        size="sm"
        title="Add deposit"
        subtitle={`${formatCurrency(principal)} loan · ${formatCurrency(total)} already received`}
      >
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="deposit-amount" className="label">Amount (₹)</label>
            <input
              id="deposit-amount" type="number" min={1} autoFocus
              value={amount} onChange={event => setAmount(event.target.value)}
              placeholder="5,000" className="input-money"
            />
          </div>
          <div>
            <label htmlFor="deposit-date" className="label">Date</label>
            <input
              id="deposit-date" type="date" value={date} max={todayIST()}
              onChange={event => setDate(event.target.value)} className="input-lg"
            />
          </div>
        </div>

        {Number(amount) > 0 && (
          <p className="note-green mt-3">
            Deposits after saving: <b>{formatCurrency(afterSaving)}</b> of {formatCurrency(principal)}
          </p>
        )}

        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
          <Button onClick={onAdd} loading={pending}>Save deposit</Button>
        </div>
      </Modal>

      {/* ── Edit ───────────────────────────────────────────────────────────── */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="sm"
        title="Edit deposit"
        subtitle="Changing the amount or date adjusts the cash book for both the old and the new day."
      >
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edit-deposit-amount" className="label">Amount (₹)</label>
            <input
              id="edit-deposit-amount" type="number" min={1} autoFocus
              value={amount} onChange={event => setAmount(event.target.value)} className="input-money"
            />
          </div>
          <div>
            <label htmlFor="edit-deposit-date" className="label">Date</label>
            <input
              id="edit-deposit-date" type="date" max={todayIST()}
              value={date} onChange={event => setDate(event.target.value)} className="input-lg"
            />
          </div>
        </div>

        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
          <Button onClick={onEdit} loading={pending}>Save changes</Button>
        </div>
      </Modal>
    </section>
  )
}
