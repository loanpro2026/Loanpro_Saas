/**
 * Help & Support → Support Tickets — /help/support-tickets
 *
 * The desktop's second Help menu item. Same workspace as /help, opened on the
 * messages tab.
 *
 * Static segments win over dynamic ones in Next's router, so this does not
 * collide with /help/[id] (a single ticket).
 */
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { HelpWorkspace } from '@/components/help/HelpWorkspace'

export const dynamic = 'force-dynamic'

export default async function SupportTicketsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: tickets } = await supabase.rpc('my_tickets')

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">Support Tickets</h1>
          <p className="page-subtitle">Messages between you and us</p>
        </div>
      </div>

      <HelpWorkspace
        initialTab="tickets"
        tickets={(tickets ?? []).map(t => ({
          id:            t.id ?? '',
          subject:       t.subject ?? '(no subject)',
          category:      t.category ?? 'other',
          status:        t.status ?? 'open',
          created_at:    t.created_at ?? '',
          updated_at:    t.updated_at ?? '',
          message_count: t.message_count ?? 0,
          awaiting_you:  t.awaiting_you ?? false,
        }))}
      />
    </div>
  )
}
