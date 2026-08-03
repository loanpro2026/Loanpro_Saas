'use client'
/**
 * Help articles and support tickets.
 *
 * The articles come first deliberately — most questions are "how do I close a
 * loan" rather than "something is broken", and answering those without a round
 * trip is better for everyone.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  BookOpen, LifeBuoy, ChevronDown, Plus, MessageSquare, CheckCircle2, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { formatDate, cn } from '@/lib/utils'
import { createTicket } from '@/app/(app)/help/actions'
import { HELP_ARTICLES } from '@/lib/help'

interface Ticket {
  id: string
  subject: string
  category: string
  status: string
  created_at: string
  updated_at: string
  message_count: number
  awaiting_you: boolean
}

export function HelpWorkspace({
  tickets,
  /**
   * The desktop has Help and Support Tickets as two menu items, so
   * /help/support-tickets opens straight on the messages rather than on the
   * guide with a tab to find.
   */
  initialTab = 'guide',
}: {
  tickets: Ticket[]
  initialTab?: 'guide' | 'tickets'
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'guide' | 'tickets'>(initialTab)
  const [openArticle, setOpenArticle] = useState<string | null>(null)
  const [raising, setRaising] = useState(false)
  const [pending, startTransition] = useTransition()

  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('question')
  const [body, setBody] = useState('')

  const openCount = tickets.filter(t => t.status === 'open' || t.status === 'answered').length

  const onRaise = () => startTransition(async () => {
    if (!subject.trim()) { toast.error('Add a short subject so this support request can be identified.'); return }
    if (!body.trim())    { toast.error('Describe what happened before sending the support request.'); return }

    // Technical context, gathered automatically. Saves the first reply being
    // "what browser are you using?".
    const context = {
      user_agent: navigator.userAgent,
      screen: `${window.screen.width}x${window.screen.height}`,
      online: navigator.onLine,
      language: navigator.language,
      time: new Date().toISOString(),
    }

    const res = await createTicket(subject, body, category, context)
    if (res.ok) {
      toast.success(`Support request “${subject.trim()}” was sent. We usually reply within a few hours.`)
      setRaising(false); setSubject(''); setBody(''); setCategory('question')
      setTab('tickets')
      router.refresh()
    } else {
      toast.error(`Support request “${subject.trim()}” was not sent. ${res.error ?? 'Your message remains in the form.'}`)
    }
  })

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2">
        {([
          ['guide',   'How it works', BookOpen],
          ['tickets', `Your messages${openCount ? ` (${openCount})` : ''}`, LifeBuoy],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
              tab === key
                ? 'bg-primary-700 text-white border-primary-700'
                : 'bg-white text-slate-600 border-surface-border hover:border-slate-300'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'guide' ? (
        <div className="space-y-5">
          {HELP_ARTICLES.map(group => (
            <section key={group.title} className="card">
              <h2 className="text-sm font-semibold text-slate-900">{group.title}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{group.description}</p>

              <div className="mt-3 divide-y divide-surface-border border-t border-surface-border">
                {group.articles.map(a => (
                  <div key={a.q}>
                    <button
                      onClick={() => setOpenArticle(openArticle === a.q ? null : a.q)}
                      className="flex w-full items-start justify-between gap-4 py-3 text-left"
                      aria-expanded={openArticle === a.q}
                    >
                      <span className="text-sm font-medium text-slate-800">{a.q}</span>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 shrink-0 text-slate-400 transition-transform mt-0.5',
                          openArticle === a.q && 'rotate-180'
                        )}
                      />
                    </button>
                    {openArticle === a.q && (
                      <div className="pb-4 -mt-1 text-sm text-slate-600 leading-relaxed space-y-2">
                        {a.a.split('\n\n').map((para, i) => <p key={i}>{para}</p>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}

          <div className="card flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-900">Still stuck?</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Send us a message from here and we&rsquo;ll pick it up with your
                shop already identified.
              </p>
            </div>
            <Button size="sm" onClick={() => setRaising(true)}>
              <Plus className="h-4 w-4" /> Ask us
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              {tickets.length === 0
                ? 'You have not sent us anything yet.'
                : `${tickets.length} message${tickets.length === 1 ? '' : 's'}`}
            </p>
            <Button size="sm" onClick={() => setRaising(true)}>
              <Plus className="h-4 w-4" /> New message
            </Button>
          </div>

          {tickets.length === 0 ? (
            <div className="card text-center py-12">
              <LifeBuoy className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                Nothing here yet. That is usually a good sign.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {tickets.map(t => (
                <li key={t.id}>
                  <a
                    href={`/help/${t.id}`}
                    className="card flex items-start gap-3 hover:border-slate-300 transition-colors"
                  >
                    <span className={cn(
                      'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full',
                      t.status === 'resolved' || t.status === 'closed'
                        ? 'bg-slate-100 text-slate-500'
                        : t.awaiting_you
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-amber-100 text-amber-600'
                    )}>
                      {t.status === 'resolved' || t.status === 'closed'
                        ? <CheckCircle2 className="h-4 w-4" />
                        : t.awaiting_you
                          ? <MessageSquare className="h-4 w-4" />
                          : <Clock className="h-4 w-4" />}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{t.subject}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatDate(t.created_at)} · {t.message_count} message
                        {t.message_count === 1 ? '' : 's'}
                      </p>
                    </div>

                    <Badge variant={
                      t.awaiting_you ? 'active'
                        : t.status === 'open' ? 'warning'
                        : 'closed'
                    }>
                      {t.awaiting_you ? 'replied' : t.status}
                    </Badge>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* New ticket */}
      <Modal open={raising} onClose={() => setRaising(false)} title="Send us a message">
        <div className="space-y-4">
          <Input
            label="Subject" required autoFocus maxLength={200}
            value={subject} onChange={e => setSubject(e.target.value)}
            placeholder="Short summary"
          />
          <Select
            label="What kind of thing is it?"
            value={category}
            onChange={e => setCategory(e.target.value)}
            options={[
              { value: 'question', label: 'A question about how to do something' },
              { value: 'problem',  label: 'Something is not working' },
              { value: 'billing',  label: 'Billing or subscription' },
              { value: 'feature',  label: 'A suggestion' },
              { value: 'other',    label: 'Something else' },
            ]}
          />
          <div>
            <label htmlFor="ticket-body" className="label">
              Tell us what is happening<span className="text-red-500 ml-0.5">*</span>
            </label>
            <textarea
              id="ticket-body"
              className="input min-h-36 resize-y"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="What were you doing, what did you expect, and what happened instead? Loan numbers help."
            />
          </div>

          <p className="text-xs text-slate-500">
            Your shop name and some technical details about this device are sent
            along automatically. No customer records are included.
          </p>

          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setRaising(false)}>Cancel</Button>
            <Button onClick={onRaise} loading={pending}>Send</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
