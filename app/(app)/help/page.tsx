import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { HelpWorkspace } from '@/components/help/HelpWorkspace'

export const dynamic = 'force-dynamic'

/**
 * Help and support, replacing the desktop's Help and Support screens.
 *
 * Tickets are raised from inside the app rather than by email, so the shop is
 * already identified and the technical context is attached. Chasing a WhatsApp
 * message with no context is worse for both sides.
 */
export default async function HelpPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: tickets } = await supabase.rpc('my_tickets')

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">Help &amp; support</h1>
          <p className="page-subtitle">
            How things work, and a direct line to us when they don&rsquo;t
          </p>
        </div>
      </div>

      {/* my_tickets() is RETURNS TABLE — nullable columns. Normalise so the
          workspace keeps its non-null Ticket type. */}
      <HelpWorkspace
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
