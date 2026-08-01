import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { TicketThread } from '@/components/help/TicketThread'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS scopes this — another shop's ticket simply comes back empty.
  const { data } = await supabase.rpc('ticket_detail', { p_ticket_id: id })

  // `RETURNS jsonb` — shape declared in types/rpc.ts from migration 016.
  const detail = (data ?? null) as TicketDetailPayload | null
  if (!detail?.ticket) notFound()

  const t = detail.ticket
  const closed = t.status === 'resolved' || t.status === 'closed'

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start gap-3">
        <Link href="/help" className="btn-icon mt-1 shrink-0" aria-label="Back to help">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="page-title truncate">{t.subject}</h1>
            <Badge variant={
              t.status === 'answered' ? 'active'
                : t.status === 'open' ? 'warning'
                : 'closed'
            }>
              {t.status}
            </Badge>
          </div>
          <p className="page-subtitle">
            Sent {formatDate(t.created_at)} · {t.category}
          </p>
        </div>
      </div>

      <TicketThread
        ticketId={id}
        messages={detail.messages ?? []}
        closed={closed}
      />
    </div>
  )
}
