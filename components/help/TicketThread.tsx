'use client'
/**
 * A support conversation.
 *
 * Laid out as a thread rather than a table — it is a conversation, and the
 * shop should be able to read it back like one.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { userFacingError } from '@/lib/user-message'
import { Send, LifeBuoy } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { replyToTicket } from '@/app/(app)/help/actions'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  body: string
  from_staff: boolean
  created_at: string
  author: string | null
}

export function TicketThread({
  ticketId, messages, closed,
}: {
  ticketId: string
  messages: Message[]
  closed: boolean
}) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()

  const onReply = () => startTransition(async () => {
    if (!body.trim()) return
    const res = await replyToTicket(ticketId, body)
    if (res.ok) { toast.success('Your reply was added to this support conversation.'); setBody(''); router.refresh() }
    else toast.error(userFacingError(
      res.error,
      'Your support reply was not sent. The text remains in the form so you can retry.',
    ))
  })

  const when = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {messages.map(m => (
          <li key={m.id} className={cn('flex gap-3', m.from_staff && 'flex-row-reverse')}>
            <span className={cn(
              'grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold',
              m.from_staff
                ? 'bg-primary-100 text-primary-700'
                : 'bg-slate-100 text-slate-600'
            )}>
              {m.from_staff ? <LifeBuoy className="h-4 w-4" /> : (m.author?.[0] ?? '?')}
            </span>

            <div className={cn('max-w-[80%]', m.from_staff && 'text-right')}>
              <div className={cn(
                'rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words text-left',
                m.from_staff
                  ? 'bg-primary-50 text-slate-800'
                  : 'bg-white border border-surface-border text-slate-800'
              )}>
                {m.body}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {m.from_staff ? 'LoanPro support' : (m.author ?? 'You')} · {when(m.created_at)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {closed ? (
        <div className="card text-center py-6">
          <p className="text-sm text-slate-500">
            This conversation is closed.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            If it comes up again, start a new message from the Help page.
          </p>
        </div>
      ) : (
        <div className="card space-y-3">
          <textarea
            className="input min-h-24 resize-y"
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Add to this conversation…"
            onKeyDown={e => {
              // Ctrl/Cmd+Enter to send, since these get typed between customers.
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onReply()
            }}
          />
          <div className="flex justify-end">
            <Button onClick={onReply} loading={pending} disabled={!body.trim()}>
              <Send className="h-4 w-4" /> Send
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
