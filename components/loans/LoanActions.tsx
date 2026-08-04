'use client'
/**
 * The controls at the top right of a loan.
 *
 * Two sets, as in the design. Looking a record up gives Edit and Delete;
 * working through a settlement gives Add deposit and Settle loan. Nothing else
 * is offered in either mode — the point of splitting them is that the screen
 * you are on can only do the thing you came to do.
 *
 * The settlement dialog shows the arithmetic before anything is committed. The
 * desktop app makes the operator work out interest in their head, which is a
 * whole class of counter mistake this removes.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { userFacingError } from '@/lib/user-message'
import Link from 'next/link'
import { RotateCcw } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { ICON } from '@/lib/nav'
import { formatCurrency, formatDuration, todayIST } from '@/lib/utils'
import { closeLoan, reopenLoan, deleteLoan } from '@/app/(app)/loans/actions'

interface Props {
  loan: {
    id: number
    name: string
    amount: number
    interest: number | null
    issue_date: string
    status: string
    category_type?: string
    detailed_type?: string | null
    weight?: number | null
  }
  totalDeposits: number
  daysHeld: number
  /** From calculate_interest() server-side — the shop's rate over the days
   *  held. Not a per-loan property. */
  suggestedInterest: number
  canManage: boolean
  photoRequiredAtClosure?: boolean
  hasCollectionPhoto?: boolean
  /** Reached from Remove Record: show the money controls instead of Edit/Delete. */
  settleMode?: boolean
}

export function LoanActions({
  loan, totalDeposits, daysHeld, suggestedInterest, canManage,
  photoRequiredAtClosure = false, hasCollectionPhoto = false, settleMode = false,
}: Props) {
  const router = useRouter()
  const [closing, setClosing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pending, startTransition] = useTransition()

  const isClosed = loan.status === 'closed'

  // Pre-filled from the shop's rate over the days held, exactly as the desktop
  // computes it. Fully editable — settlements get negotiated, rounded or waived
  // for regulars, and the app should not fight that.
  const [interest, setInterest] = useState(String(suggestedInterest))
  const [closedDate, setClosedDate] = useState(todayIST())
  const [confirmText, setConfirmText] = useState('')

  const interestNum = Number(interest) || 0
  const customerPays = loan.amount + interestNum - totalDeposits
  const photoBlocked = !isClosed && photoRequiredAtClosure && !hasCollectionPhoto

  const onClose = () => startTransition(async () => {
    if (photoBlocked) return
    const result = await closeLoan(loan.id, interestNum, closedDate)
    if (result.ok) {
      toast.success(`Loan #${loan.id} for ${loan.name} was settled. Customer payment: ${formatCurrency(customerPays)}.`)
      setClosing(false)
      router.refresh()
      return
    }
    toast.error(userFacingError(
      result.error,
      `Loan #${loan.id} could not be settled. It remains active and its cash history is unchanged.`,
    ))
  })

  const onReopen = () => startTransition(async () => {
    const result = await reopenLoan(loan.id)
    if (result.ok) {
      toast.success(`Loan #${loan.id} for ${loan.name} is active again.`)
      router.refresh()
      return
    }
    toast.error(userFacingError(
      result.error,
      `Loan #${loan.id} was not reopened. Its historical cash entries are unchanged.`,
    ))
  })

  const onDelete = () => startTransition(async () => {
    const result = await deleteLoan(loan.id)
    if (result.ok) {
      toast.success(`Mistaken loan #${loan.id} for ${loan.name} was permanently deleted.`)
      router.push(isClosed ? '/view-records/closed' : '/view-records/active')
      return
    }
    toast.error(userFacingError(
      result.error,
      `Loan #${loan.id} was not deleted. No record or customer photo was removed.`,
    ))
  })

  const item = [loan.category_type?.toLowerCase(), loan.detailed_type?.toLowerCase()]
    .filter(Boolean).join(' ')

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {settleMode && !isClosed ? (
          <>
            {/* Adding a deposit is the same dialog the deposit list opens; the
                list is the source of truth, so this scrolls to it rather than
                duplicating the form. */}
            <a href="#deposits" className="btn-secondary">+ Add deposit</a>
            <Button onClick={() => setClosing(true)}>Settle loan</Button>
          </>
        ) : (
          <>
            <Link href={`/loans/${loan.id}/edit`} className="btn-secondary gap-[7px]">
              <Icon d={ICON.edit} size={14} /> Edit record
            </Link>
            {isClosed && canManage && (
              <Button variant="secondary" onClick={onReopen} loading={pending}>
                <RotateCcw className="h-3.5 w-3.5" /> Reopen
              </Button>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => setDeleting(true)}
                className="btn h-9 gap-[7px] border border-surface-border bg-surface-card px-3.5
                           text-red hover:border-red hover:bg-red-bg"
              >
                <Icon d={ICON.trashSlim} size={14} /> Delete
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Settle ─────────────────────────────────────────────────────────── */}
      <Modal
        open={closing}
        onClose={() => setClosing(false)}
        size="lg"
        title={`Settle loan · ${loan.name}`}
        subtitle={
          <>
            {item ? `${item} ` : ''}
            {loan.weight ? `${loan.weight} ` : ''}· held {formatDuration(daysHeld)}. The record moves to
            Closed Records; deposit and cash history are preserved.
          </>
        }
      >
        <div className="mt-4 flex flex-col gap-2.5 text-13">
          <SettleRow label="Loan amount" value={formatCurrency(loan.amount)} />
          {totalDeposits > 0 && (
            <SettleRow
              label="Deposits already received"
              value={`− ${formatCurrency(totalDeposits)}`}
              tone="green"
            />
          )}
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="settle-interest" className="text-ink-muted">Interest (₹, editable)</label>
            <input
              id="settle-interest"
              type="number"
              min={0}
              value={interest}
              onChange={event => setInterest(event.target.value)}
              className="h-[34px] w-[110px] rounded-md border border-surface-border bg-surface-muted px-2.5
                         text-right text-14 font-semibold text-ink focus:border-primary"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="settle-date" className="text-ink-muted">Closure date</label>
            <input
              id="settle-date"
              type="date"
              value={closedDate}
              max={todayIST()}
              onChange={event => setClosedDate(event.target.value)}
              className="h-[34px] w-[150px] rounded-md border border-surface-border bg-surface-muted px-2.5
                         text-12.5 text-ink focus:border-primary"
            />
          </div>
        </div>

        <div className="mt-3.5 flex items-baseline justify-between rounded-xl bg-primary-tint p-3.5">
          <span className="text-13 font-semibold text-primary">Customer pays now</span>
          <span className="text-22 font-bold tabular-nums text-primary">{formatCurrency(customerPays)}</span>
        </div>

        {customerPays < 0 && (
          <p className="note-amber mt-3">
            Deposits exceed principal plus interest — the shop owes
            {' '}{formatCurrency(Math.abs(customerPays))} back.
          </p>
        )}

        {photoBlocked && (
          <p className="note-amber mt-3">
            Collection photo required — capture it on this record to enable settlement.
          </p>
        )}

        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setClosing(false)}>Cancel</Button>
          <Button onClick={onClose} loading={pending} disabled={photoBlocked}>
            Settle and close loan
          </Button>
        </div>
      </Modal>

      {/* ── Delete ─────────────────────────────────────────────────────────── */}
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this record?"
        danger
        subtitle={
          <>
            {loan.name} · {formatCurrency(loan.amount)}{item ? ` · ${item}` : ''}. Deleting removes the
            record{totalDeposits > 0 ? ` and its ${formatCurrency(totalDeposits)} deposit history` : ''},
            and adjusts the cash book. This cannot be undone. To close a loan a customer has repaid, settle
            it instead — that keeps the record and its history.
          </>
        }
      >
        {/* Typing the word is deliberate friction: these are financial records,
            and a misplaced click should not be enough. */}
        <div className="mt-3.5">
          <label htmlFor="confirm-delete-loan" className="label">Type DELETE to confirm</label>
          <input
            id="confirm-delete-loan"
            value={confirmText}
            onChange={event => setConfirmText(event.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            className="input"
          />
        </div>

        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setDeleting(false)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={onDelete}
            loading={pending}
            disabled={confirmText.trim().toUpperCase() !== 'DELETE'}
          >
            Delete record
          </Button>
        </div>
      </Modal>
    </>
  )
}

function SettleRow({ label, value, tone }: { label: string; value: string; tone?: 'green' }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className={`font-semibold tabular-nums ${tone === 'green' ? 'text-green' : 'text-ink'}`}>
        {value}
      </span>
    </div>
  )
}
