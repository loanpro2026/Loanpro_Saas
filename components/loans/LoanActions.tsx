'use client'
/**
 * Close / reopen / delete controls for a loan.
 *
 * Closing is the important one: it settles the money, so the dialog shows the
 * exact figure the customer pays before anything is committed. The desktop app
 * makes the operator compute interest in their head; showing the arithmetic
 * here removes a whole class of counter mistakes.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { MoreVertical, Archive, RotateCcw, Trash2, Pencil } from 'lucide-react'
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
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
  }
  totalDeposits: number
  daysHeld: number
  /** From calculate_interest() server-side — the shop's annual rate applied
   *  over the days held. Not a per-loan property. */
  suggestedInterest: number
  canManage: boolean
}

export function LoanActions({ loan, totalDeposits, daysHeld, suggestedInterest, canManage }: Props) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pending, startTransition] = useTransition()

  const isClosed = loan.status === 'closed'

  // Pre-filled from the shop's annual rate over the days held, exactly as the
  // desktop computes it. Fully editable — settlements get negotiated, rounded
  // or waived for regulars, and the app should not fight that.
  const [interest, setInterest] = useState(String(suggestedInterest))
  const [closedDate, setClosedDate] = useState(todayIST())
  const [confirmText, setConfirmText] = useState('')

  const interestNum = Number(interest) || 0
  const customerPays = loan.amount + interestNum - totalDeposits

  const onClose = () => startTransition(async () => {
    const res = await closeLoan(loan.id, interestNum, closedDate)
    if (res.ok) {
      toast.success(`Loan #${loan.id} for ${loan.name} was settled. Customer payment: ${formatCurrency(customerPays)}.`)
      setClosing(false)
      router.refresh()
    } else toast.error(`Loan #${loan.id} was not settled. ${res.error ?? 'Please reload the record and try again.'}`)
  })

  const onReopen = () => startTransition(async () => {
    const res = await reopenLoan(loan.id)
    if (res.ok) { toast.success(`Loan #${loan.id} for ${loan.name} is active again.`); router.refresh() }
    else toast.error(`Loan #${loan.id} was not reopened. ${res.error ?? 'Its historical cash entries were left unchanged.'}`)
  })

  const onDelete = () => startTransition(async () => {
    const res = await deleteLoan(loan.id)
    if (res.ok) {
      toast.success(`Mistaken loan #${loan.id} for ${loan.name} was permanently deleted.`)
      router.push(isClosed ? '/view-records/closed' : '/view-records/active')
    }
    else toast.error(`Loan #${loan.id} was not deleted. ${res.error ?? 'No record or photo was removed.'}`)
  })

  return (
    <>
      <div className="relative shrink-0">
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="btn-icon"
          aria-label="Loan actions"
          aria-expanded={menuOpen}
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-10 z-20 w-52 rounded-xl border border-surface-border bg-white shadow-lg py-1">
              {!isClosed && (
                <>
                  <Link
                    href={`/loans/${loan.id}/edit`}
                    className="menu-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Pencil className="h-4 w-4" /> Edit details
                  </Link>
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); setClosing(true) }}
                  >
                    <Archive className="h-4 w-4" /> Close loan
                  </button>
                </>
              )}

              {isClosed && canManage && (
                <button className="menu-item" onClick={() => { setMenuOpen(false); onReopen() }}>
                  <RotateCcw className="h-4 w-4" /> Reopen loan
                </button>
              )}

              {canManage && (
                <button
                  className="menu-item text-red-600 hover:bg-red-50"
                  onClick={() => { setMenuOpen(false); setDeleting(true) }}
                >
                  <Trash2 className="h-4 w-4" /> Delete permanently
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Close ─────────────────────────────────────────────────────────── */}
      <Modal open={closing} onClose={() => setClosing(false)} title={`Close loan #${loan.id}`}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {loan.name} has held this loan for <strong>{formatDuration(daysHeld)}</strong>.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Interest charged"
              type="number"
              min={0}
              value={interest}
              onChange={e => setInterest(e.target.value)}
              helper={`${formatCurrency(suggestedInterest)} at the shop's rate`}
            />
            <Input
              label="Closing date"
              type="date"
              value={closedDate}
              max={todayIST()}
              onChange={e => setClosedDate(e.target.value)}
            />
          </div>

          {/* The settlement, shown before anything is committed. */}
          <div className="rounded-xl bg-surface-muted p-4 space-y-1.5 text-sm">
            <Row label="Principal" value={formatCurrency(loan.amount)} />
            <Row label="Interest" value={`+ ${formatCurrency(interestNum)}`} />
            {totalDeposits > 0 && (
              <Row label="Deposits already paid" value={`− ${formatCurrency(totalDeposits)}`} />
            )}
            <div className="pt-2 mt-1 border-t border-surface-border flex justify-between font-semibold">
              <span>Customer pays</span>
              <span className="tabular-nums">{formatCurrency(customerPays)}</span>
            </div>
          </div>

          {customerPays < 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5">
              Deposits exceed principal plus interest — the shop owes
              {' '}{formatCurrency(Math.abs(customerPays))} back.
            </p>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => setClosing(false)}>Cancel</Button>
            <Button onClick={onClose} loading={pending}>Close loan</Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete ────────────────────────────────────────────────────────── */}
      <Modal open={deleting} onClose={() => setDeleting(false)} title="Delete this loan?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This removes loan <strong>#{loan.id}</strong> ({loan.name}), its deposits and its
            photo permanently. It cannot be undone.
          </p>
          <p className="text-sm text-slate-600">
            To close a loan a customer has repaid, use <strong>Close loan</strong> instead —
            that keeps the record and its history.
          </p>

          {/* Typing the number is deliberate friction: these are financial
              records, and a misplaced click should not be enough. */}
          <Input
            label={`Type ${loan.id} to confirm`}
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={String(loan.id)}
          />

          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDeleting(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={onDelete}
              loading={pending}
              disabled={confirmText.trim() !== String(loan.id)}
            >
              Delete permanently
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
