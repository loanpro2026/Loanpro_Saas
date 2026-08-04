import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { HelpWorkspace } from '@/components/help/HelpWorkspace'
import { PageHeader } from '@/components/ui/Page'

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
    <div className="max-w-5xl space-y-3.5">
      <PageHeader
        title="Help & Support"
        subtitle="Guides for daily work, plus direct support when you need it."
      />

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
