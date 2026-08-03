'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { ArrowLeft, CalendarDays, CheckCircle2, Gem, Save, UserRound, WifiOff } from 'lucide-react'

import { createLoan } from '@/app/(app)/loans/actions'
import { PhotoCapture } from '@/components/loans/PhotoCapture'
import { useOffline } from '@/components/offline/OfflineProvider'
import { useSettings } from '@/components/settings/SettingsProvider'
import { AutoSuggest } from '@/components/ui/AutoSuggest'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { photoCaptureEnabled, photoRequiredAtCreation } from '@/lib/settings'
import { compressImage, uploadLoanPhoto } from '@/lib/storage'
import { formatCurrency, todayIST } from '@/lib/utils'

const schema = z.object({
  name: z.string().min(1, 'Customer name is required'),
  father_name: z.string().optional(),
  location: z.string().optional(),
  address: z.string().optional(),
  additional_information: z.string().optional(),
  category_type: z.enum(['Gold', 'Silver']),
  detailed_type: z.string().optional(),
  weight: z.coerce.number().positive().optional().or(z.literal('')),
  amount: z.coerce.number().positive('Loan amount is required'),
  remarks: z.string().optional(),
  issue_date: z.string().min(1, 'Loan date is required'),
})
type FormData = z.infer<typeof schema>

export default function NewLoanPage() {
  const router = useRouter()
  const settings = useSettings()
  const { online, queueWrite } = useOffline()
  const [loading, setLoading] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)

  const showAddress = settings.add_record_address_field_enabled
  const showNotes = settings.add_record_additional_information_field_enabled
  const photoNeeded = photoRequiredAtCreation(settings)
  const captureEnabled = photoCaptureEnabled(settings)

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      category_type: (settings.default_category ?? 'Silver') as 'Gold' | 'Silver',
      issue_date: todayIST(),
    },
  })

  const onSubmit = async (data: FormData) => {
    if (photoNeeded && !photoFile) {
      toast.error('Attach the required customer photo before creating this loan.')
      return
    }

    setLoading(true)
    try {
      const loan = {
        name: data.name,
        father_name: data.father_name || null,
        location: data.location || null,
        address: data.address || null,
        additional_information: data.additional_information || null,
        category_type: data.category_type,
        detailed_type: data.detailed_type || null,
        weight: data.weight || null,
        amount: data.amount,
        remarks: data.remarks || null,
        issue_date: data.issue_date,
        has_photo: false,
      }

      if (!online) {
        const photo = photoFile ? await compressImage(photoFile) : undefined
        await queueWrite('loan', { loan }, photo)
        toast.success(`The loan for ${data.name} is saved on this device and waiting to sync.`)
        router.push('/offline')
        return
      }

      const result = await createLoan(loan)
      if (!result.ok || !result.data) throw new Error(result.error ?? 'The database did not create a loan number.')
      const loanId = result.data

      if (photoFile) {
        try {
          await uploadLoanPhoto(loanId, await compressImage(photoFile), 'pledge')
        } catch (photoError: unknown) {
          const detail = photoError instanceof Error ? photoError.message : 'the storage service did not respond'
          toast.error(`Loan #${loanId} was saved, but its customer photo was not attached: ${detail}`)
        }
      }

      toast.success(`Loan #${loanId} was created for ${data.name}.`)
      router.push(`/loans/${loanId}`)
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : 'No record was saved; please retry.'
      toast.error(`The loan for ${data.name} was not created. ${detail}`)
    } finally {
      setLoading(false)
    }
  }

  const customerName = watch('name') ?? ''
  const amount = Number(watch('amount') || 0)
  const category = watch('category_type') ?? settings.default_category ?? 'Silver'

  return (
    <div className="mx-auto flex min-h-0 max-w-[1500px] flex-col gap-3">
      <div className="flex min-h-10 items-center gap-2">
        <Link href="/view-records/active" className="btn-icon" aria-label="Back to active records">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="page-title">Add record</h1>
            <span className="rounded-full border border-surface-border bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
              New loan
            </span>
          </div>
          <p className="page-subtitle">Customer, item and amount in one counter-ready workspace</p>
        </div>
        <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
          {online ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-amber-500" />}
          {online ? 'Ready to save' : 'Will save on this device'}
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid gap-3 xl:h-[calc(100dvh-10rem)] xl:min-h-[500px] xl:grid-cols-[minmax(0,1fr)_320px] xl:grid-rows-[minmax(0,1fr)_auto]"
      >
        <div className="workspace-card min-w-0 p-4 sm:p-5 xl:overflow-y-auto">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <UserRound className="h-4 w-4 text-primary-600" />
              <h2 className="section-kicker">Customer identity</h2>
              <span className="ml-auto hidden text-[10px] text-slate-400 md:block">Suggestions come from this shop&rsquo;s records</span>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <AutoSuggest
                field="name" label="Customer name" required placeholder="Start typing a name"
                error={errors.name?.message}
                value={customerName}
                onChange={value => setValue('name', value, { shouldValidate: true })}
              />
              <AutoSuggest
                field="father_name" label="Father&rsquo;s name" placeholder="Start typing a name"
                value={watch('father_name') ?? ''}
                onChange={value => setValue('father_name', value)}
              />
              <AutoSuggest
                field="location" label="Location" placeholder="City, village or area"
                value={watch('location') ?? ''}
                onChange={value => setValue('location', value)}
              />
              {showAddress && (
                <div className="md:col-span-2">
                  <Input label="Address" placeholder="Street or complete address" {...register('address')} />
                </div>
              )}
              {showNotes && (
                <div className={showAddress ? '' : 'md:col-span-3'}>
                  <label className="label">Additional customer information</label>
                  <input className="input" placeholder="Optional customer note" {...register('additional_information')} />
                </div>
              )}
            </div>
          </section>

          <div className="my-4 border-t border-surface-border" />

          <section>
            <div className="mb-3 flex items-center gap-2">
              <Gem className="h-4 w-4 text-primary-600" />
              <h2 className="section-kicker">Loan and item</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <Input label="Loan date" required type="date" error={errors.issue_date?.message} {...register('issue_date')} />
              <Input
                label="Loan amount (₹)" required type="number" inputMode="decimal" placeholder="0"
                error={errors.amount?.message} {...register('amount')}
              />
              <Select
                label="Metal" required
                options={[{ value: 'Gold', label: 'Gold' }, { value: 'Silver', label: 'Silver' }]}
                error={errors.category_type?.message} {...register('category_type')}
              />
              <Input label="Weight (g)" type="number" step="0.001" inputMode="decimal" placeholder="0.000" {...register('weight')} />

              <div className="md:col-span-2">
                <AutoSuggest
                  field="detailed_type" label="Jewellery / item" placeholder="Chain, ring, anklet…"
                  value={watch('detailed_type') ?? ''}
                  onChange={value => setValue('detailed_type', value)}
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Loan remarks</label>
                <input className="input" placeholder="Condition, packet or identification note" {...register('remarks')} />
              </div>
            </div>
          </section>

          <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-surface-muted p-3 text-xs">
            <div><span className="block text-[10px] uppercase tracking-wide text-slate-400">Customer</span><strong className="block truncate text-slate-700">{customerName || 'Not entered'}</strong></div>
            <div><span className="block text-[10px] uppercase tracking-wide text-slate-400">Principal</span><strong className="block truncate tabular-nums text-slate-700">{amount > 0 ? formatCurrency(amount) : '₹0'}</strong></div>
            <div><span className="block text-[10px] uppercase tracking-wide text-slate-400">Item class</span><strong className="block truncate text-slate-700">{category}</strong></div>
          </div>
        </div>

        <aside className="workspace-card flex min-h-[220px] flex-col p-4 sm:p-5 xl:min-h-0 xl:overflow-y-auto">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary-600" />
            <h2 className="section-kicker">Identity photo</h2>
            {photoNeeded && <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Required</span>}
          </div>
          {captureEnabled ? (
            <>
              <p className="mb-4 text-xs leading-5 text-slate-500">
                On a phone, capture directly. On desktop, continue through the paired phone or choose an image.
              </p>
              <PhotoCapture onPhoto={setPhotoFile} />
              {photoNeeded && !photoFile && (
                <p className="mt-auto border-t border-surface-border pt-3 text-xs text-amber-700">
                  A photo must be attached before this record can be saved.
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-surface-border bg-surface-muted p-5 text-center">
              <div>
                <CheckCircle2 className="mx-auto h-6 w-6 text-slate-400" />
                <p className="mt-2 text-sm font-medium text-slate-700">Photo capture is off</p>
                <p className="mt-1 text-xs text-slate-500">You can enable it under Settings → Identity.</p>
              </div>
            </div>
          )}
        </aside>

        <div className="sticky bottom-[4.5rem] z-20 flex items-center justify-between gap-3 rounded-xl border border-surface-border bg-white/95 p-2.5 shadow-card backdrop-blur-xl xl:static xl:col-span-2">
          <p className="hidden px-2 text-xs text-slate-500 sm:block">
            Review the customer and principal before saving. Interest is calculated when the loan closes.
          </p>
          <div className="ml-auto flex w-full gap-2 sm:w-auto">
            <Link href="/view-records/active" className="flex-1 sm:flex-none"><Button variant="secondary" className="w-full">Cancel</Button></Link>
            <Button type="submit" loading={loading} className="flex-1 sm:min-w-44">
              {!loading && <Save className="h-4 w-4" />} {loading ? 'Creating record' : 'Create record'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
