import { redirect } from 'next/navigation'

/**
 * Deposits belong to a specific active loan. Keep the old URL as a safe
 * redirect for bookmarks, but do not present a second, context-free workflow.
 */
export default function DepositsPage() {
  redirect('/remove-record')
}
