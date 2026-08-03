import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { LoanDetailPayload } from '@/types/rpc'
import { formatCurrency, formatDate, formatDuration } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { DepositHistory } from '@/components/loans/DepositHistory'
import { LoanActions } from '@/components/loans/LoanActions'
import { LoanPhoto } from '@/components/loans/LoanPhoto'
import { RemarksLog } from '@/components/loans/RemarksLog'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string }>
}

export default async function LoanDetailPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const loanId = Number(id)
  if (!Number.isInteger(loanId) || loanId <= 0) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [userResult, detailResult, photoPolicyResult] = await Promise.all([
    supabase.from('users').select('role').eq('auth_id', user.id).single(),
    supabase.rpc('loan_detail', { p_loan_id: loanId }),
    supabase.rpc('photo_required', { p_stage: 'closure' }),
  ])

  const detail = (detailResult.data ?? null) as LoanDetailPayload | null
  if (!detail?.loan) notFound()

  const loan = detail.loan
  const isClosed = loan.status === 'closed'
  const deposits = isClosed ? detail.archived_deposits ?? [] : detail.deposits ?? []
  const totalDeposits = Number(detail.total_deposits ?? 0)
  const daysHeld = Number(detail.days_held ?? 0)
  const suggestedInterest = Number(detail.suggested_interest ?? 0)
  const chargedInterest = Number(loan.interest ?? 0)
  const outstanding = Math.max(0, Number(loan.amount) - totalDeposits)
  const customerPays = outstanding + (isClosed ? chargedInterest : suggestedInterest)
  const fromRemove = query.from === 'remove-record'
  const backHref = fromRemove ? '/remove-record' : isClosed ? '/view-records/closed' : '/view-records/active'
  const backLabel = fromRemove ? 'Back to results' : isClosed ? 'Back to closed records' : 'Back to active records'
  const collectionPhoto = detail.photos?.collection ?? null

  return (
    <div className="space-y-3.5" style={{ fontFamily: "'IBM Plex Sans', Inter, system-ui, sans-serif" }}>
      <header className="sticky top-[61px] z-20 -mx-3 flex flex-wrap items-start gap-3 border-b border-surface-border bg-surface/95 px-3 py-3 backdrop-blur-xl sm:-mx-4 sm:px-4 lg:-mx-5 lg:px-5">
        <Link href={backHref} className="btn-icon mt-0.5 shrink-0" aria-label={backLabel}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={backHref} className="text-[11px] font-medium text-primary-700 hover:underline">{backLabel}</Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-bold text-slate-900">#{loan.id} · {loan.name}</h1>
            <Badge variant={isClosed ? 'closed' : 'active'}>{loan.status}</Badge>
            <span className="text-[11px] text-slate-400">{fromRemove ? 'Settlement workspace' : isClosed ? 'Archived record' : 'Active record'}</span>
          </div>
          <p className="truncate text-xs text-slate-500">
            {loan.father_name && <>S/o {loan.father_name} · </>}
            {loan.location || 'Location not recorded'}
          </p>
        </div>
        <LoanActions
          loan={loan}
          totalDeposits={totalDeposits}
          daysHeld={daysHeld}
          suggestedInterest={suggestedInterest}
          canManage={userResult.data?.role === 'owner'}
          photoRequiredAtClosure={photoPolicyResult.data === true}
          hasCollectionPhoto={!!collectionPhoto}
        />
      </header>

      <section className="card overflow-hidden p-0" aria-label="Loan financial summary">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <Summary label="Original principal" value={formatCurrency(loan.amount)} />
          <Summary label="Deposits paid" value={formatCurrency(totalDeposits)} tone="good" />
          <Summary label="Outstanding principal" value={formatCurrency(outstanding)} emphasis />
          <Summary label={isClosed ? 'Interest collected' : 'Suggested interest'} value={formatCurrency(isClosed ? chargedInterest : suggestedInterest)} tone="attention" />
          <Summary label={isClosed ? 'Paid at settlement' : 'Total due today'} value={formatCurrency(customerPays)} emphasis />
          <Summary label="Days held" value={formatDuration(daysHeld)} />
        </div>
      </section>

      <div className="grid items-start gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <section className="card space-y-4" aria-labelledby="collateral-title">
            <h2 id="collateral-title" className="text-sm font-bold text-slate-900">Overview</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm sm:grid-cols-4">
              <Field label="Customer">{loan.name}</Field>
              <Field label="Father&rsquo;s name">{loan.father_name || '—'}</Field>
              <Field label="Location">{loan.location || '—'}</Field>
              <Field label="Issued">{formatDate(loan.issue_date)}</Field>
              <Field label="Metal"><Badge variant={loan.category_type === 'Gold' ? 'gold' : 'silver'}>{loan.category_type}</Badge></Field>
              <Field label="Jewellery type">{loan.detailed_type || '—'}</Field>
              <Field label="Weight">{collateralWeight(loan.category_type, loan.weight)}</Field>
              <Field label="Closed">{loan.closed_date ? formatDate(loan.closed_date) : '—'}</Field>
            </dl>
            {(loan.address || loan.additional_information) && (
              <div className="grid gap-3 border-t border-surface-border pt-4 sm:grid-cols-2">
                {loan.address && <Field label="Address">{loan.address}</Field>}
                {loan.additional_information && <Field label="Additional information">{loan.additional_information}</Field>}
              </div>
            )}
          </section>

          <DepositHistory loanId={loan.id} deposits={deposits} readOnly={isClosed} principal={loan.amount} />
          <RemarksLog loanId={loan.id} remarks={loan.remarks} />
        </div>

        <aside className="space-y-3 lg:sticky lg:top-[142px]">
          <section className="card">
            <p className="text-xs text-slate-500">{isClosed ? 'Paid at settlement' : 'Customer pays if settled today'}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-primary-700">{formatCurrency(customerPays)}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              {formatCurrency(loan.amount)} principal − {formatCurrency(totalDeposits)} deposits + {formatCurrency(isClosed ? chargedInterest : suggestedInterest)} interest
            </p>
          </section>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-600">Pledge identity</p>
            <LoanPhoto loanId={loan.id} hasPhoto={!!detail.photos?.pledge} verifiedBy={loan.face_verified_by} readOnly={isClosed} stage="pledge" />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-600">Collection identity</p>
            <LoanPhoto loanId={loan.id} hasPhoto={!!collectionPhoto} verifiedBy={null} readOnly={isClosed} stage="collection" />
          </div>
        </aside>
      </div>
    </div>
  )
}

function Summary({ label, value, tone, emphasis }: { label: string; value: string; tone?: 'good' | 'attention'; emphasis?: boolean }) {
  return (
    <div className={`min-h-20 border-b border-r border-surface-border p-3.5 last:border-r-0 xl:border-b-0 ${emphasis ? 'bg-primary-50/60' : ''}`}>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`mt-1 text-base font-bold tabular-nums ${tone === 'good' ? 'text-emerald-700' : tone === 'attention' ? 'text-amber-700' : emphasis ? 'text-primary-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-[11px] text-slate-500">{label}</dt><dd className="mt-1 font-medium text-slate-900">{children}</dd></div>
}

function collateralWeight(category: string, weight: number | null): string {
  if (weight == null) return '—'
  if (category === 'Silver') return `${(weight / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 })} kg`
  return `${Number(weight).toLocaleString('en-IN', { maximumFractionDigits: 3 })} g`
}
