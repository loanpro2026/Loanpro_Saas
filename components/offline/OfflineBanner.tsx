'use client'
/**
 * The connection indicator.
 *
 * Deliberately not alarming. A shop with patchy internet will see this often,
 * and a red flashing warning every twenty minutes teaches people to ignore
 * warnings. It states the situation and what still works.
 */
import { useState } from 'react'
import { CloudOff, RefreshCw, Clock, Check } from 'lucide-react'
import { useOffline } from './OfflineProvider'
import { getQueue, type QueuedWrite } from '@/lib/offline/db'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'

export function OfflineBanner() {
  const { online, pending, syncNow } = useOffline()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<QueuedWrite[]>([])
  const [syncing, setSyncing] = useState(false)

  // Nothing to say when everything is normal.
  if (online && pending === 0) return null

  const showQueue = async () => {
    setItems(await getQueue())
    setOpen(true)
  }

  const onSync = async () => {
    setSyncing(true)
    try { await syncNow() } finally { setSyncing(false); setItems(await getQueue()) }
  }

  return (
    <>
      <button
        onClick={showQueue}
        className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
          online
            ? 'bg-primary-50 text-primary-800 hover:bg-primary-100'
            : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
        }`}
      >
        {online ? <Clock className="h-4 w-4 shrink-0" /> : <CloudOff className="h-4 w-4 shrink-0" />}
        <span className="flex-1 text-left">
          {!online && pending === 0 && (
            <>No internet — you can still look up loans</>
          )}
          {!online && pending > 0 && (
            <>No internet — {pending} {pending === 1 ? 'entry' : 'entries'} waiting to save</>
          )}
          {online && pending > 0 && (
            <>Saving {pending} queued {pending === 1 ? 'entry' : 'entries'}…</>
          )}
        </span>
        <span className="text-xs underline shrink-0">Details</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Pending entries">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {online
              ? 'These are saved on this device and are being sent to the server.'
              : 'These are saved on this device and will be sent when the internet comes back. Do not clear your browser data until they have.'}
          </p>

          {items.filter(i => !i.syncedAt).length === 0 ? (
            <p className="text-sm text-slate-400">Nothing waiting.</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {items.filter(i => !i.syncedAt).map(i => (
                <li key={i.key} className="py-2.5 flex items-start gap-3">
                  <Clock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800">{describe(i)}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(i.createdAt).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                      {i.attempts > 0 && <> · {i.attempts} attempt{i.attempts > 1 ? 's' : ''}</>}
                    </p>
                    {i.lastError && (
                      <p className="text-xs text-red-600 mt-0.5">{i.lastError}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {items.some(i => i.syncedAt) && (
            <div className="pt-2 border-t border-surface-border">
              <p className="text-xs text-slate-400 mb-2">Recently saved</p>
              <ul className="space-y-1">
                {items.filter(i => i.syncedAt).slice(0, 5).map(i => (
                  <li key={i.key} className="flex items-center gap-2 text-xs text-slate-500">
                    <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                    {describe(i)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Close</Button>
            <Button onClick={onSync} loading={syncing} disabled={!online}>
              <RefreshCw className="h-4 w-4" /> Try now
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function describe(w: QueuedWrite): string {
  const p = w.payload as any
  switch (w.kind) {
    case 'deposit':
      return `Deposit of ${formatCurrency(Number(p.amount))} on loan #${p.loan_id}`
    case 'loan':
      return `New loan for ${p.loan?.name ?? 'a customer'} — ${formatCurrency(Number(p.loan?.amount ?? 0))}`
    case 'cash':
      return `Cash ${p.type === 'add' ? 'added' : 'removed'}: ${formatCurrency(Number(p.amount))} (${p.reason})`
    case 'photo': {
      const kb = w.blob ? ` (${Math.round(w.blob.size / 1024)} KB)` : ''
      return `Customer photo for loan #${p.loan_id}${kb}`
    }
    default:
      return 'Pending entry'
  }
}
