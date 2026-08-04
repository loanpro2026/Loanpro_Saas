/**
 * One loan, in the design's two modes.
 *
 * Arriving from Active or Closed Records this is a read-only record: what was
 * pledged, what has been paid, what is on file. Arriving from Remove Record
 * (`?from=remove-record`) it becomes the settlement workspace and grows the two
 * controls that move money — add deposit and settle.
 *
 * The mode is carried in the URL rather than inferred from the loan's status,
 * because it is about intent, not state: the same active loan is a reference on
 * one screen and a transaction on the other, and a shop should not be one
 * mis-click from settling something they only meant to look up.
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { LoanDetailPayload } from '@/types/rpc'
import { formatCurrency, formatDate, formatDuration } from '@/lib/utils'
import { Badge, MetalBadge } from '@/components/ui/Badge'
import { Card, StatStrip, StatStripCell } from '@/components/ui/Page'
import { Icon } from '@/components/ui/Icon'
import { ICON } from '@/lib/nav'
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
  const interest = isClosed ? chargedInterest : suggestedInterest
  const outstanding = Math.max(0, Number(loan.amount) - totalDeposits)
  const customerPays = outstanding + interest

  // Settlement mode. Only ever reached from Remove Record, and never for a loan
  // that is already closed.
  const settleMode = query.from === 'remove-record' && !isClosed
  const backHref = settleMode ? '/remove-record' : isClosed ? '/view-records/closed' : '/view-records/active'
  const backLabel = settleMode ? 'Back to search results' : isClosed ? 'Back to closed records' : 'Back to active records'
  const context = settleMode ? 'Settlement workspace' : isClosed ? 'Archived record' : 'Read-only record'

  const collectionPhoto = detail.photos?.collection ?? null
  const depositShare = Number(loan.amount) > 0 ? (totalDeposits / Number(loan.amount)) * 100 : 0

  return (
    <div className="space-y-3.5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <Link
            href={backHref}
            aria-label={backLabel}
            title={backLabel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-surface-border
                       bg-surface-card text-15 text-ink-muted transition-colors hover:border-primary hover:text-primary"
          >
            ←
          </Link>

          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full
                          border border-surface-border bg-surface-muted text-ink-faint">
            <Icon d={ICON.person} size={22} strokeWidth={1.6} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-19 font-bold text-ink">{loan.name}</h1>
              <Badge variant={isClosed ? 'closed' : 'active'}>{isClosed ? 'Closed' : 'Active'}</Badge>
              <span className="text-11.5 text-ink-faint">#{loan.id} · {context}</span>
            </div>
            <p className="mt-0.5 truncate text-12.5 text-ink-muted">
              {[
                loan.father_name ? `S/o ${loan.father_name}` : null,
                loan.location,
                loan.address,
              ].filter(Boolean).join(' · ') || 'No address on file'}
            </p>
          </div>
        </div>

        <LoanActions
          loan={loan}
          totalDeposits={totalDeposits}
          daysHeld={daysHeld}
          suggestedInterest={suggestedInterest}
          canManage={userResult.data?.role === 'owner'}
          photoRequiredAtClosure={photoPolicyResult.data === true}
          hasCollectionPhoto={!!collectionPhoto}
          settleMode={settleMode}
        />
      </header>

      <StatStrip columns={4}>
        <StatStripCell label="Loan amount" value={formatCurrency(loan.amount)} />
        <StatStripCell label="Deposits paid" value={formatCurrency(totalDeposits)} tone="green" />
        <StatStripCell
          label={isClosed ? 'Interest collected' : 'Interest if closed today'}
          value={formatCurrency(interest)}
          tone="amber"
        />
        <StatStripCell
          highlight
          label={isClosed ? 'Duration held' : 'Days held'}
          value={
            <span className="flex items-baseline gap-1.5">
              <span className="text-primary">{daysHeld}</span>
              <span className="text-12.5 font-semibold text-primary">days · {formatDuration(daysHeld)}</span>
            </span>
          }
          sub={`${formatDate(loan.issue_date)} → ${loan.closed_date ? `${formatDate(loan.closed_date)} (closed)` : 'today'}`}
        />
      </StatStrip>

      <div className="grid items-start gap-3.5 lg:grid-cols-3">
        <div className="flex flex-col gap-3.5 lg:col-span-2">
          <Card className="p-4">
            <h2 className="card-title mb-3">Collateral</h2>
            <dl className="grid grid-cols-2 gap-3.5 text-13 sm:grid-cols-4">
              <Field label="Metal"><MetalBadge metal={loan.category_type} /></Field>
              <Field label="Jewellery type">{loan.detailed_type || '—'}</Field>
              <Field label="Weight">{collateralWeight(loan.category_type, loan.weight)}</Field>
              <Field label="Issue date">{formatDate(loan.issue_date)}</Field>
            </dl>

            {(loan.additional_information || loan.closed_date) && (
              <div className="mt-3.5 grid gap-3 border-t border-surface-border pt-3 sm:grid-cols-2">
                {loan.additional_information && (
                  <div>
                    <p className="text-11.5 text-ink-faint">Additional information</p>
                    <p className="mt-0.5 text-13 leading-relaxed text-ink-muted">{loan.additional_information}</p>
                  </div>
                )}
                {loan.closed_date && (
                  <div>
                    <p className="text-11.5 text-ink-faint">Closed on</p>
                    <p className="mt-0.5 text-13 font-semibold text-ink">{formatDate(loan.closed_date)}</p>
                  </div>
                )}
              </div>
            )}
          </Card>

          <DepositHistory
            loanId={loan.id}
            deposits={deposits}
            readOnly={isClosed}
            principal={loan.amount}
            canAdd={settleMode}
            summary={
              deposits.length === 0
                ? 'No part-payments received yet'
                : `${formatCurrency(totalDeposits)} received across ${deposits.length} part-payment` +
                  `${deposits.length === 1 ? '' : 's'} · ${depositShare.toFixed(0)}% of the loan amount`
            }
          />

          <RemarksLog loanId={loan.id} remarks={loan.remarks} />
        </div>

        <aside className="flex flex-col gap-3.5">
          <Card className="p-4">
            <h2 className="card-title mb-3">Identity on file</h2>
            <LoanPhoto
              loanId={loan.id}
              hasPhoto={!!detail.photos?.pledge}
              verifiedBy={loan.face_verified_by}
              readOnly={isClosed}
              stage="pledge"
              bare
            />
            <div className="mt-3 flex items-center gap-2.5 border-t border-surface-border pt-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border
                              border-surface-border bg-surface-muted text-ink-faint">
                <Icon d={ICON.camera} size={18} strokeWidth={1.6} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-12.5 font-semibold text-ink">Collection photo</p>
                <p className={`text-11.5 ${collectionPhoto ? 'text-green' : 'text-ink-faint'}`}>
                  {collectionPhoto
                    ? `Captured ${loan.closed_date ? formatDate(loan.closed_date) : ''} at settlement`.trim()
                    : 'Captured at settlement'}
                </p>
              </div>
            </div>
            {(collectionPhoto || settleMode) && (
              <div className="mt-3">
                <LoanPhoto
                  loanId={loan.id}
                  hasPhoto={!!collectionPhoto}
                  verifiedBy={null}
                  readOnly={isClosed}
                  stage="collection"
                  bare
                />
              </div>
            )}
          </Card>

          {/* The settlement figure only appears where settling is possible. On a
              read-only record it would invite an action this screen cannot take. */}
          {(settleMode || isClosed) && (
            <Card accent={settleMode} className="p-4">
              <p className="text-12 text-ink-muted">
                {isClosed ? 'Paid at settlement' : 'Customer pays if settled today'}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{formatCurrency(customerPays)}</p>
              <p className="mt-1 text-11.5 leading-relaxed text-ink-faint">
                {formatCurrency(loan.amount)} loan − {formatCurrency(totalDeposits)} deposits
                {' '}+ {formatCurrency(interest)} interest
              </p>
            </Card>
          )}
        </aside>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-11.5 text-ink-faint">{label}</dt>
      <dd className="mt-0.5 font-semibold text-ink">{children}</dd>
    </div>
  )
}

function collateralWeight(category: string, weight: number | null): string {
  if (weight == null) return '—'
  if (category === 'Silver') return `${(weight / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 })} kg`
  return `${Number(weight).toLocaleString('en-IN', { maximumFractionDigits: 3 })} g`
}
