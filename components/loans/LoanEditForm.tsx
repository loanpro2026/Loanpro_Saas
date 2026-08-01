'use client'
/**
 * Edit an active loan.
 *
 * Only the fields a shop legitimately corrects are here. Status and closing
 * date are absent on purpose — those move through close_loan/reopen_loan so
 * the daily cash summary stays in step. The server action enforces the same
 * whitelist, so this is a convenience, not the security boundary.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { AutoSuggest } from '@/components/ui/AutoSuggest'
import { updateLoan, updateClosedRecord } from '@/app/(app)/loans/actions'
import { formatCurrency, todayIST } from '@/lib/utils'

interface Loan {
  id: number
  status: string
  interest: number | null
  closed_date: string | null
  name: string
  father_name: string | null
  location: string | null
  address: string | null
  additional_information: string | null
  category_type: string
  detailed_type: string | null
  weight: number | null
  amount: number
  issue_date: string
}

export function LoanEditForm({ loan, isClosed = false }: { loan: Loan; isClosed?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [form, setForm] = useState({
    name: loan.name ?? '',
    father_name: loan.father_name ?? '',
    location: loan.location ?? '',
    address: loan.address ?? '',
    additional_information: loan.additional_information ?? '',
    category_type: loan.category_type ?? 'Gold',
    detailed_type: loan.detailed_type ?? '',
    weight: loan.weight?.toString() ?? '',
    amount: loan.amount?.toString() ?? '',
    issue_date: loan.issue_date ?? '',
    // Only meaningful on a closed record — see below.
    interest: loan.interest?.toString() ?? '',
    closed_date: loan.closed_date ?? '',
  })

  const set = (k: keyof typeof form) => (v: string) =>
    setForm(f => ({ ...f, [k]: v }))

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name.trim()) { toast.error('Customer name is required'); return }
    if (!Number(form.amount)) { toast.error('Amount is required'); return }

    startTransition(async () => {
      // Two different paths. Correcting a closed record can change the
      // interest charged and the closing date, which rewrite historical
      // reports — so it goes through update_closed_record(), which re-chains
      // the cash summary from the earliest affected date.
      const res = isClosed
        ? await updateClosedRecord(loan.id, {
            ...form,
            amount: Number(form.amount),
            weight: form.weight ? Number(form.weight) : null,
            interest: form.interest === '' ? null : Number(form.interest),
          })
        : await updateLoan(loan.id, {
            ...form,
            amount: Number(form.amount),
            weight: form.weight ? Number(form.weight) : null,
          })

      if (res.ok) {
        toast.success('Changes saved')
        router.push(`/loans/${loan.id}`)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not save')
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {isClosed && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            This loan is already settled
          </p>
          <p className="text-xs text-amber-800 mt-1">
            Changing the amount, interest or dates will adjust your cash book and
            past reports. Use this to correct a mistake — not to change what a
            customer actually paid.
          </p>
        </div>
      )}

      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Customer</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <AutoSuggest
            field="name" label="Name" required
            value={form.name} onChange={set('name')}
          />
          <AutoSuggest
            field="father_name" label="Father's name"
            value={form.father_name} onChange={set('father_name')}
          />
          <AutoSuggest
            field="location" label="Place"
            value={form.location} onChange={set('location')}
          />
          <Input
            label="Address"
            value={form.address}
            onChange={e => set('address')(e.target.value)}
          />
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Collateral & terms</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Select
            label="Metal" required
            value={form.category_type}
            onChange={e => set('category_type')(e.target.value)}
            options={[
              { value: 'Gold', label: 'Gold' },
              { value: 'Silver', label: 'Silver' },
            ]}
          />
          <AutoSuggest
            field="detailed_type" label="Item"
            value={form.detailed_type} onChange={set('detailed_type')}
            placeholder="22K Necklace"
          />
          <Input
            label="Weight (g)" type="number" step="0.001" min={0}
            value={form.weight}
            onChange={e => set('weight')(e.target.value)}
          />
          <Input
            label="Amount" type="number" min={1} required
            value={form.amount}
            onChange={e => set('amount')(e.target.value)}
            helper="Changing this adjusts the cash summary for the issue date"
          />
          <Input
            label="Issue date" type="date" required
            value={form.issue_date}
            onChange={e => set('issue_date')(e.target.value)}
          />

          {/* Only on a closed record. On an active loan neither field has a
              value yet — interest is written at closing. */}
          {isClosed && (
            <>
              <Input
                label="Interest charged (₹)" type="number" min={0}
                value={form.interest}
                onChange={e => set('interest')(e.target.value)}
                helper="The amount, not a rate"
              />
              <Input
                label="Closing date" type="date" max={todayIST()}
                value={form.closed_date}
                onChange={e => set('closed_date')(e.target.value)}
              />
            </>
          )}
        </div>

        <div>
          <label htmlFor="notes" className="label">Notes</label>
          <textarea
            id="notes"
            className="input min-h-20 resize-y"
            value={form.additional_information}
            onChange={e => set('additional_information')(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button
          type="button" variant="secondary"
          onClick={() => router.push(`/loans/${loan.id}`)}
        >
          Cancel
        </Button>
        <Button type="submit" loading={pending}>Save changes</Button>
      </div>
    </form>
  )
}
