import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { LoanEditForm } from '@/components/loans/LoanEditForm'

export const dynamic = 'force-dynamic'

export default async function EditLoanPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const loanId = Number(id)
  if (!Number.isInteger(loanId) || loanId <= 0) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: loan, error } = await supabase
    .from('loans')
    .select('*')
    .eq('id', loanId)
    .single()

  if (error?.code === 'PGRST116') notFound()
  if (error) throw new Error(`Loan #${loanId} could not be loaded for editing: ${error.message}`)
  if (!loan) notFound()

  // Closed loans ARE editable — the desktop allows it (updateClosedRecord),
  // and a shop needs to fix a misspelled name or a mistyped interest figure
  // without reopening the loan and rewriting cash history. The form shows
  // different fields and warns about the consequences.
  const isClosed = loan.status === 'closed'

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-start gap-3">
        <Link href={`/loans/${loanId}`} className="btn-icon mt-1" aria-label="Back to loan">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="page-title">
            {isClosed ? 'Correct closed loan' : 'Edit loan'} #{loan.id}
          </h1>
          <p className="page-subtitle">{loan.name}</p>
        </div>
      </div>

      <LoanEditForm loan={loan} isClosed={isClosed} />
    </div>
  )
}
