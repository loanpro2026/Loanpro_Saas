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
import { ArrowLeft } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { LoanDetailPayload } from '@/types/rpc'
import { formatCurrency, formatDuration } from '@/lib/utils'
import { formatDateSetting, photoCaptureEnabled, withDefaults } from '@/lib/settings'
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
}

export default async function LoanDetailPage({ params }: Props) {
  const { id } = await params
  const loanId = Number(id)
  if (!Number.isInteger(loanId) || loanId <= 0) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [userResult, detailResult, settingsResult] = await Promise.all([
    supabase.from('users').select('role').eq('auth_id', user.id).single(),
    supabase.rpc('loan_detail', { p_loan_id: loanId }),
    supabase.rpc('my_settings'),
  ])

  const detail = (detailResult.data ?? null) as LoanDetailPayload | null
  if (!detail?.loan) notFound()

  const loan = detail.loan
  const settings = withDefaults(settingsResult.data)
  const showAddress = settings.add_record_address_field_enabled
  const showAdditionalInformation = settings.add_record_additional_information_field_enabled
  const photosEnabled = photoCaptureEnabled(settings)
  const formatDate = (date: string | Date) => formatDateSetting(date, settings.date_display_format)
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
  const backHref = isClosed ? '/view-records/closed' : '/view-records/active'
  const backLabel = isClosed ? 'Back to closed records' : 'Back to active records'
  const context = isClosed ? 'Archived record' : 'Read-only record'

  const collectionPhoto = detail.photos?.collection ?? null
  const displayedPhotoStage = isClosed && collectionPhoto
      ? 'collection'
      : 'pledge'
  const displayedPhoto = displayedPhotoStage === 'collection'
    ? collectionPhoto
    : detail.photos?.pledge ?? null
  const depositShare = Number(loan.amount) > 0 ? (totalDeposits / Number(loan.amount)) * 100 : 0

  return (
    <div className="page-stack">
      {/**
        * The back link is its own line above the title.
        *
        * It used to be a bordered arrow button inline with the avatar, the
        * name, the status badge, the loan number and the context label — six
        * objects on one line, so the customer's name, which is the thing you
        * navigated here to confirm, carried no more weight than the word
        * "Read-only". Breaking navigation out leaves the title line with two
        * things on it: who this is, and whether the loan is open.
        */}
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-12 font-medium text-ink-muted
                     transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {backLabel}
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full
                          border border-surface-border bg-surface-muted text-ink-faint">
            <Icon d={ICON.person} size={24} strokeWidth={1.6} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl font-bold tracking-[-0.015em] text-ink">{loan.name}</h1>
              <Badge variant={isClosed ? 'closed' : 'active'}>{isClosed ? 'Closed' : 'Active'}</Badge>
            </div>
            <p className="mt-1 truncate text-13 text-ink-muted">
              {[
                `Loan #${loan.id}`,
                loan.father_name ? `S/o ${loan.father_name}` : null,
                loan.location,
                showAddress ? loan.address : null,
              ].filter(Boolean).join(' · ')}
            </p>
            <p className="mt-0.5 text-12 text-ink-faint">{context}</p>
          </div>
        </div>

        <LoanActions
          loan={loan}
          totalDeposits={totalDeposits}
          daysHeld={daysHeld}
          suggestedInterest={suggestedInterest}
          canManage={userResult.data?.role === 'owner'}
          hasCollectionPhoto={!!collectionPhoto}
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
        {/* The value is one figure, not a figure plus a restatement of it in a
            second size on the same line. "127 days" is the number; "4 months"
            and the date range are context and belong underneath. */}
        <StatStripCell
          highlight
          tone="primary"
          label={isClosed ? 'Duration held' : 'Days held'}
          value={`${daysHeld} ${daysHeld === 1 ? 'day' : 'days'}`}
          sub={
            <>
              {formatDuration(daysHeld)}
              <br />
              {formatDate(loan.issue_date)} → {loan.closed_date ? `${formatDate(loan.closed_date)} (closed)` : 'today'}
            </>
          }
        />
      </StatStrip>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card>
            <h2 className="card-title mb-4">Collateral</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-5 text-13 sm:grid-cols-4">
              <Field label="Metal"><MetalBadge metal={loan.category_type} /></Field>
              <Field label="Jewellery type">{loan.detailed_type || '—'}</Field>
              <Field label="Weight">{collateralWeight(loan.category_type, loan.weight)}</Field>
              <Field label="Issue date">{formatDate(loan.issue_date)}</Field>
            </dl>

            {((showAdditionalInformation && loan.additional_information) || loan.closed_date) && (
              <div className="mt-5 grid gap-4 border-t border-surface-border pt-4 sm:grid-cols-2">
                {showAdditionalInformation && loan.additional_information && (
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
            canAdd={false}
            summary={
              deposits.length === 0
                ? 'No part-payments received yet'
                : `${formatCurrency(totalDeposits)} received across ${deposits.length} part-payment` +
                  `${deposits.length === 1 ? '' : 's'} · ${depositShare.toFixed(0)}% of the loan amount`
            }
          />

          <RemarksLog loanId={loan.id} remarks={loan.remarks} />
        </div>

        <aside className="flex flex-col gap-5">
          {photosEnabled && <Card>
            <h2 className="card-title mb-4">Identity on file</h2>
            <LoanPhoto
              loanId={loan.id}
              hasPhoto={!!displayedPhoto}
              verifiedBy={loan.face_verified_by}
              readOnly={isClosed}
              stage={displayedPhotoStage}
              bare
            />
          </Card>}

          {/* The settlement figure only appears where settling is possible. On a
              read-only record it would invite an action this screen cannot take. */}
          {isClosed && (
            <Card>
              <p className="stat-label">Paid at settlement</p>
              <p className="mt-2 text-22 font-bold tabular-nums tracking-[-0.015em] text-primary">
                {formatCurrency(customerPays)}
              </p>
              <p className="mt-2 text-12 leading-relaxed text-ink-faint">
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
      <dt className="text-11 font-bold uppercase tracking-[0.07em] text-ink-faint">{label}</dt>
      <dd className="mt-1.5 font-semibold text-ink">{children}</dd>
    </div>
  )
}

function collateralWeight(category: string, weight: number | null): string {
  if (weight == null) return '—'
  if (category === 'Silver') return `${(weight / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 })} kg`
  return `${Number(weight).toLocaleString('en-IN', { maximumFractionDigits: 3 })} g`
}
