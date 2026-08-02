import { createClient } from '@/lib/supabase/server'
import type { LoanDetailPayload } from '@/types/rpc'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { formatCurrency, formatDate, formatWeight, formatDuration } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { LoanActions } from '@/components/loans/LoanActions'
import { DepositHistory } from '@/components/loans/DepositHistory'
import { RemarksLog } from '@/components/loans/RemarksLog'
import { LoanPhoto } from '@/components/loans/LoanPhoto'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LoanDetailPage({ params }: Props) {
  const { id } = await params
  const loanId = Number(id)
  if (!Number.isInteger(loanId) || loanId <= 0) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: appUser } = await supabase
    .from('users').select('role').eq('auth_id', user.id).single()

  // One round trip for loan + deposits + archived deposits + photo (see
  // migration 008). RLS scopes it, so another shop's loan simply returns null.
  const { data } = await supabase.rpc('loan_detail', { p_loan_id: loanId })

  // loan_detail() is `RETURNS jsonb`, so its generated type is the Json union.
  // The shape it builds is declared in types/rpc.ts, read off the
  // jsonb_build_object() in migration 012.
  const detail = (data ?? null) as LoanDetailPayload | null
  if (!detail?.loan) notFound()

  const loan = detail.loan
  const isClosed = loan.status === 'closed'
  const deposits = isClosed ? detail.archived_deposits ?? [] : detail.deposits ?? []
  const totalDeposits = Number(detail.total_deposits ?? 0)
  const daysHeld = Number(detail.days_held ?? 0)
  // Computed server-side by calculate_interest() so the figure here and the
  // one in the closing dialog always agree.
  const suggestedInterest = Number(detail.suggested_interest ?? 0)

  // Outstanding is principal less what the customer has already paid in.
  // Interest is settled at closing, so it is not part of this figure.
  const outstanding = loan.amount - totalDeposits

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/view-records/active" className="btn-icon mt-1 shrink-0" aria-label="Back to records">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="page-title truncate">{loan.name}</h1>
            <Badge variant={isClosed ? 'closed' : 'active'}>{loan.status}</Badge>
          </div>
          <p className="page-subtitle">
            Loan #{loan.id}
            {loan.father_name && <> · S/o {loan.father_name}</>}
            {loan.location && <> · {loan.location}</>}
          </p>
        </div>
        <LoanActions
          loan={loan}
          totalDeposits={totalDeposits}
          daysHeld={daysHeld}
          suggestedInterest={suggestedInterest}
          canManage={appUser?.role === 'owner'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left: the numbers */}
        <div className="lg:col-span-2 space-y-5">
          <div className="card">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Principal" value={formatCurrency(loan.amount)} />
              <Stat label="Deposits paid" value={formatCurrency(totalDeposits)} />
              <Stat
                label="Outstanding"
                value={formatCurrency(outstanding)}
                tone={outstanding <= 0 ? 'good' : undefined}
              />
              <Stat
                label={isClosed ? 'Held for' : 'Held so far'}
                value={formatDuration(daysHeld)}
              />
            </div>
          </div>

          <div className="card space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Collateral</h2>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <Field label="Metal">
                <Badge variant={loan.category_type === 'Gold' ? 'gold' : 'silver'}>
                  {loan.category_type}
                </Badge>
              </Field>
              <Field label="Item">{loan.detailed_type || '—'}</Field>
              <Field label="Weight">{formatWeight(loan.weight)}</Field>
              {/* Interest is the amount charged at closing, not a per-loan
                  rate. While a loan is active it is NULL, so show what it
                  would come to today at the shop's rate. */}
              <Field label={isClosed ? 'Interest charged' : 'Interest so far'}>
                {isClosed
                  ? (loan.interest != null ? formatCurrency(loan.interest) : '—')
                  : <span className="text-slate-500">
                      {formatCurrency(suggestedInterest)}
                      <span className="text-xs text-slate-400"> if closed today</span>
                    </span>}
              </Field>
              <Field label="Issued">{formatDate(loan.issue_date)}</Field>
              <Field label="Closed">
                {loan.closed_date ? formatDate(loan.closed_date) : '—'}
              </Field>
            </dl>
            {(loan.address || loan.additional_information) && (
              <div className="pt-3 border-t border-surface-border space-y-2 text-sm">
                {loan.address && <Field label="Address">{loan.address}</Field>}
                {loan.additional_information && (
                  <Field label="Notes">{loan.additional_information}</Field>
                )}
              </div>
            )}
          </div>

          <DepositHistory
            loanId={loan.id}
            deposits={deposits}
            readOnly={isClosed}
            principal={loan.amount}
          />

          <RemarksLog loanId={loan.id} remarks={loan.remarks} />
        </div>

        {/* Right: identity */}
        <div className="space-y-5">
          <LoanPhoto
            loanId={loan.id}
            hasPhoto={!!detail.photo}
            verifiedBy={loan.face_verified_by}
            readOnly={isClosed}
          />
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${
        tone === 'good' ? 'text-emerald-600' : 'text-slate-900'
      }`}>
        {value}
      </p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-slate-900 mt-0.5">{children}</dd>
    </div>
  )
}
