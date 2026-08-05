import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { LoanDetailPayload } from '@/types/rpc'
import { formatCurrency } from '@/lib/utils'
import { formatDateSetting, photoCaptureEnabled, withDefaults } from '@/lib/settings'
import { Card } from '@/components/ui/Page'
import { MetalBadge } from '@/components/ui/Badge'
import { DepositHistory } from '@/components/loans/DepositHistory'
import { LoanPhoto } from '@/components/loans/LoanPhoto'
import { SettlementPanel } from '@/components/records/SettlementPanel'

export const dynamic = 'force-dynamic'

export default async function SettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const loanId = Number(id)
  if (!Number.isInteger(loanId) || loanId <= 0) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [detailResult, photoPolicyResult, settingsResult] = await Promise.all([
    supabase.rpc('loan_detail', { p_loan_id: loanId }),
    supabase.rpc('photo_required', { p_stage: 'closure' }),
    supabase.rpc('my_settings'),
  ])

  const detail = (detailResult.data ?? null) as LoanDetailPayload | null
  if (!detail?.loan) notFound()
  if (detail.loan.status === 'closed') redirect(`/loans/${loanId}`)

  const loan = detail.loan
  const settings = withDefaults(settingsResult.data)
  const formatDate = (date: string | Date) => formatDateSetting(date, settings.date_display_format)
  const deposits = detail.deposits ?? []
  const totalDeposits = Number(detail.total_deposits ?? 0)
  const suggestedInterest = Number(detail.suggested_interest ?? 0)
  const photoRequired = photoPolicyResult.data === true
  const collectionPhoto = detail.photos?.collection ?? null
  const pledgePhoto = detail.photos?.pledge ?? null

  return (
    <div className="page-stack">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            href="/remove-record"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-surface-border
                       bg-surface-card text-15 text-ink-muted hover:border-primary hover:text-primary"
            aria-label="Back to Remove Record"
          >
            ←
          </Link>
          <div className="min-w-0">
            <p className="text-11.5 font-semibold uppercase tracking-wide text-primary">Remove Record</p>
            <h1 className="truncate text-xl font-bold text-ink">{loan.name}</h1>
            <p className="mt-0.5 text-12.5 text-ink-muted">
              {loan.father_name ? `S/o ${loan.father_name}` : 'Father’s name not recorded'} · Loan #{loan.id}
            </p>
          </div>
        </div>
        <Link href={`/loans/${loan.id}`} className="btn-secondary">View read-only record</Link>
      </header>

      <Card>
        <dl className="grid grid-cols-2 gap-4 text-13 sm:grid-cols-5">
          <Detail label="Loan amount" value={formatCurrency(loan.amount)} strong />
          <Detail label="Jewellery type" value={loan.detailed_type || '—'} />
          <Detail label="Metal" value={<MetalBadge metal={loan.category_type} />} />
          <Detail label="Weight" value={weightLabel(loan.category_type, loan.weight)} />
          <Detail label="Issued" value={formatDate(loan.issue_date)} />
        </dl>
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="page-stack lg:col-span-2">
          <DepositHistory
            loanId={loan.id}
            deposits={deposits}
            readOnly={false}
            principal={loan.amount}
            canAdd
            summary={deposits.length
              ? `${formatCurrency(totalDeposits)} received in ${deposits.length} part-payment${deposits.length === 1 ? '' : 's'}`
              : 'No part-payments received'}
          />

          {photoCaptureEnabled(settings) && (
            <Card>
              <h2 className="card-title mb-3">
                {photoRequired ? 'Collection photo' : 'Customer photo on file'}
              </h2>
              <LoanPhoto
                loanId={loan.id}
                hasPhoto={photoRequired ? !!collectionPhoto : !!pledgePhoto}
                verifiedBy={loan.face_verified_by}
                readOnly={!photoRequired}
                stage={photoRequired ? 'collection' : 'pledge'}
                bare
              />
            </Card>
          )}
        </div>

        <SettlementPanel
          loan={{ id: loan.id, name: loan.name, amount: loan.amount, issue_date: loan.issue_date }}
          deposits={totalDeposits}
          suggestedInterest={suggestedInterest}
          photoRequired={photoRequired}
          hasCollectionPhoto={!!collectionPhoto}
        />
      </div>
    </div>
  )
}

function Detail({ label, value, strong = false }: {
  label: string
  value: React.ReactNode
  strong?: boolean
}) {
  return (
    <div>
      <dt className="text-11 font-bold uppercase tracking-[0.07em] text-ink-faint">{label}</dt>
      {/* Was `text-16`, which this project has never defined — so every field
          marked `strong` here has been rendering at the same size as the rest
          and only the weight was doing any work. */}
      <dd className={`mt-1.5 ${strong ? 'text-15 font-bold' : 'font-semibold'} text-ink`}>{value}</dd>
    </div>
  )
}

function weightLabel(category: string, weight: number | null): string {
  if (weight == null) return '—'
  return category === 'Silver'
    ? `${(Number(weight) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 })} kg`
    : `${Number(weight).toLocaleString('en-IN', { maximumFractionDigits: 3 })} g`
}
