'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { AutoSuggest } from '@/components/ui/AutoSuggest'
import { Button } from '@/components/ui/Button'
import { PhotoCapture } from '@/components/loans/PhotoCapture'
import { uploadLoanPhoto, compressImage } from '@/lib/storage'
import { createLoan } from '@/app/(app)/loans/actions'
import toast from 'react-hot-toast'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { todayIST } from '@/lib/utils'
import { useSettings } from '@/components/settings/SettingsProvider'
import { photoRequiredAtCreation } from '@/lib/settings'
import { useOffline } from '@/components/offline/OfflineProvider'

const schema = z.object({
  name:                   z.string().min(1, 'Name is required'),
  father_name:            z.string().optional(),
  location:               z.string().optional(),
  address:                z.string().optional(),
  additional_information: z.string().optional(),
  category_type:          z.enum(['Gold', 'Silver']),
  detailed_type:          z.string().optional(),
  weight:                 z.coerce.number().positive().optional().or(z.literal('')),
  amount:                 z.coerce.number().positive('Amount is required'),
  remarks:                z.string().optional(),
  issue_date:             z.string().min(1, 'Date is required'),
})
type FormData = z.infer<typeof schema>

export default function NewLoanPage() {
  const router = useRouter()
  const settings = useSettings()
  const { online } = useOffline()
  const [loading,      setLoading]     = useState(false)
  const [photoFile,    setPhotoFile]   = useState<File | null>(null)

  // Ported from the desktop's general settings. Most shops do not collect an
  // address for a pawn loan, so both of these are off by default — showing
  // them to a migrated shop that had them hidden would look like a regression.
  const showAddress = settings.add_record_address_field_enabled
  const showNotes   = settings.add_record_additional_information_field_enabled
  const photoNeeded = photoRequiredAtCreation(settings)

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      category_type: (settings.default_category ?? 'Gold') as 'Gold' | 'Silver',
      // IST, not UTC: an evening entry must not be dated tomorrow.
      issue_date: todayIST(),
    },
  })

  const onSubmit = async (data: FormData) => {
    // The desktop refuses to save without a photo when this is on. Match that
    // on the normal path — but the loan is still created if the upload later
    // fails, and flagged, so a customer's gold is never taken in with no
    // record of it at all. See migration 013.
    if (photoNeeded && !photoFile) {
      toast.error('This shop requires a customer photo before saving a loan')
      return
    }

    setLoading(true)
    try {
      // Goes through create_loan (migration 007), which stamps tenant_id from
      // the session, writes the activity entry and recalculates that day's
      // cash summary in one transaction.
      const res = await createLoan({
        name:                   data.name,
        father_name:            data.father_name || null,
        location:               data.location || null,
        address:                data.address || null,
        additional_information: data.additional_information || null,
        category_type:          data.category_type,
        detailed_type:          data.detailed_type || null,
        weight:                 data.weight || null,
        amount:                 data.amount,
        remarks:                data.remarks || null,
        issue_date:             data.issue_date,
        has_photo:              !!photoFile,
      })

      if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to create loan')
      const loanId = res.data

      // The loan is saved either way — a failed photo upload must not lose it.
      if (photoFile) {
        try {
          // Explicit rather than relying on the default: this is the photo of
          // whoever handed the item over.
          await uploadLoanPhoto(loanId, await compressImage(photoFile), 'pledge')
        } catch (photoErr: any) {
          toast.error(`Loan saved, but the photo did not upload: ${photoErr.message}`)
        }
      }

      toast.success('Loan created')
      router.push(`/loans/${loanId}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create loan')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/loans" className="btn-icon">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="page-title">New Loan</h1>
          <p className="page-subtitle">Add a new gold or silver loan record</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Customer info */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-slate-900 text-sm uppercase tracking-wide text-slate-500">Customer</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Autosuggest rather than a plain input: shops re-lend to the same
                families for years, and picking an existing spelling stops
                "Ramesh Kumar" fragmenting across records. */}
            <AutoSuggest
              field="name" label="Customer Name" required placeholder="Full name"
              error={errors.name?.message}
              value={watch('name') ?? ''}
              onChange={v => setValue('name', v, { shouldValidate: true })}
            />
            <AutoSuggest
              field="father_name" label="Father's Name" placeholder="S/o ..."
              value={watch('father_name') ?? ''}
              onChange={v => setValue('father_name', v)}
            />
          </div>
          <div className={showAddress ? 'grid sm:grid-cols-2 gap-4' : ''}>
            <AutoSuggest
              field="location" label="Location / Village" placeholder="City or village"
              value={watch('location') ?? ''}
              onChange={v => setValue('location', v)}
            />
            {showAddress && (
              <Input label="Address" placeholder="Full address" {...register('address')} />
            )}
          </div>
          {showNotes && (
            <div>
              <label className="label">Additional Information</label>
              <textarea
                className="input h-16 resize-none"
                placeholder="Any extra notes about the customer…"
                {...register('additional_information')}
              />
            </div>
          )}
        </div>

        {/* Collateral */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm uppercase tracking-wide text-slate-500 font-semibold">Collateral</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <Select
              label="Category"
              required
              options={[{ value: 'Gold', label: 'Gold' }, { value: 'Silver', label: 'Silver' }]}
              error={errors.category_type?.message}
              {...register('category_type')}
            />
            <Input label="Item Type" placeholder="e.g. 22K Necklace" {...register('detailed_type')} />
            <Input label="Weight (g)" type="number" step="0.001" placeholder="0.000" {...register('weight')} />
          </div>
        </div>

        {/* Loan terms */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm uppercase tracking-wide text-slate-500 font-semibold">Loan Terms</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {/* No interest field — matching the desktop. Interest is not a
                property of a loan; it is calculated at closing from the
                shop-wide annual rate in Settings. */}
            <Input label="Loan Amount (₹)" required type="number" placeholder="0" error={errors.amount?.message} {...register('amount')} />
            <Input label="Issue Date" required type="date" error={errors.issue_date?.message} {...register('issue_date')} />
          </div>
          <div>
            <label className="label">Remarks</label>
            <textarea className="input h-16 resize-none" placeholder="Any notes about the loan…" {...register('remarks')} />
          </div>
        </div>

        {/* Photo capture */}
        <div className="card p-5">
          <h2 className="text-sm uppercase tracking-wide text-slate-500 font-semibold mb-1">
            Customer Photo
            {photoNeeded && <span className="text-red-500 ml-0.5">*</span>}
          </h2>
          {photoNeeded && !photoFile && (
            <p className="text-xs text-amber-700 mb-3">
              Required by this shop&rsquo;s settings. Change it under Settings &rarr; Identity.
            </p>
          )}
          <PhotoCapture onPhoto={setPhotoFile} />
        </div>

        <div className="flex gap-3">
          <Link href="/loans"><Button variant="secondary">Cancel</Button></Link>
          <Button type="submit" loading={loading} className="flex-1">Save Loan</Button>
        </div>
      </form>
    </div>
  )
}
