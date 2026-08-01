import { OfflineWorkspace } from '@/components/offline/OfflineWorkspace'

/**
 * The page the service worker serves when a navigation fails.
 *
 * Deliberately outside the (app) route group: that layout hits Supabase for
 * the session and tenant, which is exactly what is unavailable here. This page
 * must render from static output and IndexedDB alone.
 *
 * It is not a dead end. The shop can still search their cached loans and see
 * what is queued — which covers the counter task that matters most when the
 * internet is down.
 */
export const dynamic = 'force-static'

export const metadata = {
  title: 'Offline — LoanPro',
}

export default function OfflinePage() {
  return <OfflineWorkspace />
}
