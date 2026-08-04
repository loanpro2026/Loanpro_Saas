'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { closeLoan } from '@/app/(app)/loans/actions'
import { formatCurrency, todayIST } from '@/lib/utils'
import { userFacingError } from '@/lib/user-message'

interface Props {
  loan: { id: number; name: string; amount: number; issue_date: string }
  deposits: number
  suggestedInterest: number
  photoRequired: boolean
  hasCollectionPhoto: boolean
}

export function SettlementPanel({
  loan, deposits, suggestedInterest, photoRequired, hasCollectionPhoto,
}: Props) {
  const router = useRouter()
  const [interest, setInterest] = useState(String(suggestedInterest))
  const [closureDate, setClosureDate] = useState(todayIST())
  const [pending, startTransition] = useTransition()

  const enteredInterest = Number(interest)
  const validInterest = Number.isFinite(enteredInterest) && enteredInterest >= 0
  const interestAmount = validInterest ? Math.round(enteredInterest) : 0
  const amountToReceive = loan.amount + (validInterest ? interestAmount : 0) - deposits
  const photoBlocked = photoRequired && !hasCollectionPhoto

  const settle = () => startTransition(async () => {
    if (!validInterest) {
      toast.error('Enter an interest amount of zero or more before settling this loan.')
      return
    }
    if (!closureDate) {
      toast.error('Choose the date on which this loan is being closed.')
      return
    }
    if (photoBlocked) {
      toast.error('Capture the required collection photo before settling this loan.')
      return
    }

    const result = await closeLoan(loan.id, interestAmount, closureDate)
    if (!result.ok) {
      toast.error(userFacingError(
        result.error,
        `Loan #${loan.id} could not be settled. It remains active and its cash history is unchanged.`,
      ))
      return
    }

    toast.success(
      `Loan #${loan.id} for ${loan.name} was settled on ${closureDate}. ` +
      `Amount received: ${formatCurrency(amountToReceive)}.`,
    )
    router.push('/remove-record')
    router.refresh()
  })

  return (
    <section className="card border-primary/30 p-4" aria-labelledby="settlement-title">
      <h2 id="settlement-title" className="card-title">Settle this loan</h2>
      <p className="mt-1 text-12 text-ink-muted">
        Confirm the closure date and interest before closing the record.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">Closure date</span>
          <input
            type="date"
            value={closureDate}
            min={loan.issue_date.slice(0, 10)}
            max={todayIST()}
            onChange={event => setClosureDate(event.target.value)}
            className="input"
          />
        </label>
        <label>
          <span className="label">Interest (₹)</span>
          <input
            type="number"
            min={0}
            step={1}
            value={interest}
            onChange={event => setInterest(event.target.value)}
            className="input text-right font-semibold tabular-nums"
          />
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-primary-tint px-4 py-3">
        <div>
          <p className="text-12 font-semibold text-primary">Amount to receive</p>
          {deposits > 0 && (
            <p className="mt-0.5 text-11 text-ink-muted">
              Includes adjustment of {formatCurrency(deposits)} already deposited.
            </p>
          )}
        </div>
        <p className="text-xl font-bold tabular-nums text-primary">{formatCurrency(amountToReceive)}</p>
      </div>

      {amountToReceive < 0 && (
        <p className="note-amber mt-3">
          Deposits exceed the loan and interest. Return {formatCurrency(Math.abs(amountToReceive))} to the customer.
        </p>
      )}
      {photoBlocked && (
        <p className="note-amber mt-3">
          A new collection photo is required. Capture it below before settling.
        </p>
      )}

      <Button
        className="mt-4 w-full"
        onClick={settle}
        loading={pending}
        disabled={!validInterest || !closureDate || photoBlocked}
      >
        Settle and close loan
      </Button>
    </section>
  )
}
