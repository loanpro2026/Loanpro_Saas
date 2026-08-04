'use client'
/**
 * The edit and delete buttons at the end of a records row.
 *
 * Deleting a record is not the same as settling one: it removes the loan, its
 * deposit history and the matching cash entries, and it exists for records
 * entered by mistake. The design gates it behind typing DELETE, and that is
 * kept — a mis-click in a dense table should not be able to erase a pledge.
 *
 * Both buttons stop propagation: the row itself is a link to the record, and
 * clicking "delete" must not also navigate.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { ICON } from '@/lib/nav'
import { formatCurrency } from '@/lib/utils'
import { deleteLoan } from '@/app/(app)/loans/actions'
import { userFacingError } from '@/lib/user-message'

interface Props {
  loan: {
    id: number
    name: string
    amount: number
    category_type: string
    detailed_type: string | null
  }
  totalDeposits?: number
}

export function RecordRowActions({ loan, totalDeposits = 0 }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [pending, startTransition] = useTransition()

  const stop = (event: React.MouseEvent) => { event.preventDefault(); event.stopPropagation() }

  const onDelete = () => startTransition(async () => {
    const result = await deleteLoan(loan.id)
    if (result.ok) {
      toast.success(`Record #${loan.id} for ${loan.name} was permanently deleted.`)
      setOpen(false)
      setConfirmText('')
      router.refresh()
      return
    }
    toast.error(userFacingError(
      result.error,
      `Record #${loan.id} was not deleted. No loan, deposit, cash entry, or customer photo was removed.`,
    ))
  })

  const item = [loan.category_type?.toLowerCase(), loan.detailed_type?.toLowerCase()]
    .filter(Boolean).join(' ')

  return (
    <>
      <div className="flex justify-end gap-1">
        <button
          type="button"
          title="Edit record"
          aria-label={`Edit record ${loan.id}`}
          onClick={event => { stop(event); router.push(`/loans/${loan.id}/edit`) }}
          className="btn-row-edit"
        >
          <Icon d={ICON.edit} size={14} />
        </button>
        <button
          type="button"
          title="Delete record"
          aria-label={`Delete record ${loan.id}`}
          onClick={event => { stop(event); setOpen(true) }}
          className="btn-row-delete"
        >
          <Icon d={ICON.trash} size={14} />
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => { setOpen(false); setConfirmText('') }}
        title="Delete this record?"
        danger
        subtitle={
          <>
            {loan.name} · {formatCurrency(loan.amount)}{item ? ` · ${item}` : ''}. Deleting removes the
            record{totalDeposits > 0 ? ` and its ${formatCurrency(totalDeposits)} deposit history` : ' and its deposit history'},
            and adjusts the cash book. This cannot be undone.
          </>
        }
      >
        <div className="mt-3.5">
          <label htmlFor={`confirm-delete-${loan.id}`} className="label">Type DELETE to confirm</label>
          <input
            id={`confirm-delete-${loan.id}`}
            value={confirmText}
            onChange={event => setConfirmText(event.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            className="input"
          />
        </div>

        <div className="modal-actions">
          <Button variant="secondary" onClick={() => { setOpen(false); setConfirmText('') }}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={pending}
            disabled={confirmText.trim().toUpperCase() !== 'DELETE'}
            onClick={onDelete}
          >
            Delete record
          </Button>
        </div>
      </Modal>
    </>
  )
}
