'use client'
/**
 * Append-only remarks, matching the desktop app.
 *
 * Each entry is timestamped and added to the end; there is no editing. Shop
 * owners use this as an audit trail of what happened with a customer — "said
 * he'd come back Friday", "brought a second chain" — and an editable text box
 * is not an audit trail. Individual entries can be removed if one was added by
 * mistake.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { MessageSquarePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { appendRemark, deleteRemark } from '@/app/(app)/loans/actions'

interface Props {
  loanId: number
  remarks: string | null
}

export function RemarksLog({ loanId, remarks }: Props) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const entries = remarks ? remarks.split('\n').filter(Boolean) : []

  const onAdd = () => startTransition(async () => {
    const res = await appendRemark(loanId, text)
    if (res.ok) { setText(''); setOpen(false); router.refresh() }
    else toast.error(res.error ?? 'Could not add the remark')
  })

  const onRemove = (index: number) => startTransition(async () => {
    const res = await deleteRemark(loanId, index)
    if (res.ok) router.refresh()
    else toast.error(res.error ?? 'Could not remove')
  })

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Remarks</h2>
        {!open && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            <MessageSquarePlus className="h-4 w-4" /> Add note
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-2">
          <textarea
            className="input min-h-20 resize-y"
            value={text}
            autoFocus
            maxLength={2000}
            placeholder="What happened? This is added to the log with today's date."
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              // Ctrl/Cmd+Enter to save — these get typed at a busy counter.
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onAdd()
            }}
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="secondary" onClick={() => { setOpen(false); setText('') }}>
              Cancel
            </Button>
            <Button size="sm" onClick={onAdd} loading={pending} disabled={!text.trim()}>
              Add
            </Button>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        !open && <p className="text-sm text-slate-400">No remarks yet.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry, i) => {
            // Entries look like "[01 Mar 2026, 09:00] text"
            const m = entry.match(/^\[([^\]]+)\]\s*(.*)$/)
            const stamp = m?.[1]
            const body = m?.[2] ?? entry
            return (
              <li
                key={i}
                className="group flex gap-2 text-sm rounded-lg bg-surface-muted px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  {stamp && <p className="text-xs text-slate-400">{stamp}</p>}
                  <p className="text-slate-700 whitespace-pre-wrap break-words">{body}</p>
                </div>
                <button
                  onClick={() => onRemove(i)}
                  disabled={pending}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-slate-400 hover:text-red-600 shrink-0"
                  aria-label="Remove this remark"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
