'use client'
/**
 * Add New Record — issue a loan against pledged gold or silver.
 *
 * One card, two sections, exactly as the design lays it out: who the customer
 * is and what they look like on the top row, then the money and the item below
 * a rule. The photo sits beside the personal details rather than after the
 * loan fields because it is captured while the customer is still being
 * identified, not while the item is being weighed.
 *
 * The footer states cash in hand after this loan is issued. A shop's real
 * constraint at the counter is the drawer, and working that out in your head
 * while a customer waits is how a shop ends up unable to make change.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { CheckCircle2, WifiOff } from 'lucide-react'

import { createLoan } from '@/app/(app)/loans/actions'
import { createClient } from '@/lib/supabase/client'
import { asObject, numberAt, objectAt } from '@/lib/json'
import { PhotoCapture } from '@/components/loans/PhotoCapture'
import { useOffline } from '@/components/offline/OfflineProvider'
import { useSettings } from '@/components/settings/SettingsProvider'
import { AutoSuggest } from '@/components/ui/AutoSuggest'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Page'
import { photoCaptureEnabled, photoRequiredAtCreation } from '@/lib/settings'
import { compressImage, uploadLoanPhoto } from '@/lib/storage'
import { cn, formatCurrency, todayIST } from '@/lib/utils'

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
  const [cashInHand, setCashInHand] = useState<number | null>(null)

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

  // The drawer balance, for the footer projection. Read once on mount and
  // allowed to fail quietly — it is context, not something the form depends on.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('dashboard_snapshot')
      if (cancelled || error) return
      setCashInHand(numberAt(objectAt(asObject(data), 'cash'), 'cash_in_hand'))
    })()
    return () => { cancelled = true }
  }, [])

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
      if (!result.ok || !result.data) {
        throw new Error(result.error ?? 'The database did not create a loan number.')
      }
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
  const isGold = category === 'Gold'
  const remaining = cashInHand === null ? null : cashInHand - amount

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="Add New Record"
        subtitle="Issue a new loan against pledged gold or silver. Fields marked * are required."
        actions={
          <span className="hidden items-center gap-2 text-12 text-ink-muted sm:flex">
            {online
              ? <><CheckCircle2 className="h-4 w-4 text-green" /> Ready to save</>
              : <><WifiOff className="h-4 w-4 text-amber" /> Will save on this device</>}
          </span>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="card max-w-[1180px] p-5">
        <div className="grid gap-6 xl:grid-cols-[2fr_300px] xl:items-start">
          <div>
            <h2 className="section-kicker mb-3">Personal information</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <AutoSuggest
                field="name" label="Customer name" required placeholder="Enter customer name"
                error={errors.name?.message}
                value={customerName}
                onChange={value => setValue('name', value, { shouldValidate: true })}
              />
              <AutoSuggest
                field="father_name" label="Father&rsquo;s name" placeholder="Enter father's name"
                value={watch('father_name') ?? ''}
                onChange={value => setValue('father_name', value)}
              />
              <AutoSuggest
                field="location" label="Location" placeholder="Area or bazaar"
                value={watch('location') ?? ''}
                onChange={value => setValue('location', value)}
              />
              {showAddress && (
                <Input label="Address" optional placeholder="House no., street, city" {...register('address')} />
              )}
              {showNotes && (
                <div className={showAddress ? 'sm:col-span-2' : ''}>
                  <label htmlFor="additional_information" className="label">
                    Additional customer information<span className="label-optional"> (optional)</span>
                  </label>
                  <input
                    id="additional_information"
                    className="input"
                    placeholder="Optional customer note"
                    {...register('additional_information')}
                  />
                </div>
              )}
            </div>
          </div>

          <div>
            <h2 className="section-kicker mb-3">
              Customer photo{photoNeeded && <span className="ml-0.5 text-red">*</span>}
            </h2>
            {captureEnabled ? (
              <>
                <PhotoCapture onPhoto={setPhotoFile} />
                <p className="mt-2 text-11.5 leading-relaxed text-ink-muted">
                  Stored securely and never shared. Change the capture device under
                  {' '}<Link href="/settings" className="text-primary hover:underline">Settings → Devices &amp; capture</Link>.
                </p>
                {photoNeeded && !photoFile && (
                  <p className="mt-2 text-11.5 text-amber">
                    A photo must be attached before this record can be saved.
                  </p>
                )}
              </>
            ) : (
              <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-xl border
                              border-dashed border-surface-border bg-surface-muted p-3 text-center text-12 text-ink-faint">
                <CheckCircle2 className="h-6 w-6" />
                <p className="text-13 font-semibold text-ink">Photo capture is off</p>
                <p className="text-11.5">Enable it under Settings → Identity.</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 border-t border-surface-border pt-4">
          <h2 className="section-kicker mb-3">Loan details</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label htmlFor="amount" className="label">Loan amount (₹)<span className="ml-0.5 text-red">*</span></label>
              <input
                id="amount" type="number" inputMode="decimal" placeholder="50,000"
                className={cn('input-money', errors.amount && 'input-error')}
                {...register('amount')}
              />
              {errors.amount && <p className="error-msg">{errors.amount.message}</p>}
            </div>

            {/* Two buttons rather than a dropdown: there are exactly two metals,
                and the choice changes the weight unit below it. */}
            <div>
              <span className="label">Metal<span className="ml-0.5 text-red">*</span></span>
              <div className="flex h-10 overflow-hidden rounded-lg border border-surface-border">
                <button
                  type="button"
                  aria-pressed={isGold}
                  onClick={() => setValue('category_type', 'Gold', { shouldValidate: true })}
                  className={cn(
                    'flex-1 text-13 font-semibold transition-colors',
                    isGold ? 'bg-gold-bg text-gold' : 'bg-surface-card text-ink-muted'
                  )}
                >
                  Gold
                </button>
                <button
                  type="button"
                  aria-pressed={!isGold}
                  onClick={() => setValue('category_type', 'Silver', { shouldValidate: true })}
                  className={cn(
                    'flex-1 border-l border-surface-border text-13 font-semibold transition-colors',
                    !isGold ? 'bg-silver-bg text-silver' : 'bg-surface-card text-ink-muted'
                  )}
                >
                  Silver
                </button>
              </div>
              <input type="hidden" {...register('category_type')} />
            </div>

            <AutoSuggest
              field="detailed_type" label="Jewellery type" placeholder="Chain, kada, payal…"
              value={watch('detailed_type') ?? ''}
              onChange={value => setValue('detailed_type', value)}
            />

            {/* Weight is stored in grams for both metals; silver is displayed in
                kilos everywhere it is read back. Entering it in grams here keeps
                one unit in the database and one conversion in one place. */}
            <Input
              label="Weight (grams)" type="number" step="0.001" inputMode="decimal"
              placeholder="24.600" fieldSize="lg" {...register('weight')}
            />

            <Input
              label="Loan date" required type="date" fieldSize="lg"
              error={errors.issue_date?.message} {...register('issue_date')}
            />

            <div className="sm:col-span-1 xl:col-span-3">
              <label htmlFor="remarks" className="label">
                Additional information<span className="label-optional"> (optional)</span>
              </label>
              <input
                id="remarks" className="input-lg"
                placeholder="Any note about the item or terms"
                {...register('remarks')}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-surface-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-12 text-ink-faint">
            {remaining === null ? (
              <>Interest is calculated when the loan is settled, not now.</>
            ) : (
              <>
                Cash in hand after issuing this loan:{' '}
                <span className={cn('font-semibold', remaining < 0 ? 'text-red' : 'text-ink')}>
                  {formatCurrency(remaining)}
                </span>
                {remaining < 0 && ' — more than the drawer holds'}
              </>
            )}
          </p>
          <div className="flex gap-2.5 sm:justify-end">
            <Link href="/dashboard" className="flex-1 sm:flex-none">
              <Button variant="secondary" size="lg" type="button" className="w-full">Cancel</Button>
            </Link>
            <Button type="submit" size="lg" loading={loading} className="flex-1 sm:flex-none sm:px-5">
              {loading ? 'Creating loan record…' : 'Create loan record'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
