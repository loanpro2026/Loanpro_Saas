'use client'
/**
 * "Download all my data".
 *
 * The desktop lets a shop export their whole database to a file whenever they
 * like. Moving to a hosted product should not quietly take that away — a shop
 * owner who cannot get their own records out is right to feel uneasy about it.
 */
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Download, HardDriveDownload } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function DataExport() {
  const [busy, setBusy] = useState(false)

  const onExport = async () => {
    setBusy(true)
    // A shop with thousands of photos will wait a while, so say so rather than
    // letting them wonder whether the click registered.
    const t = toast.loading('Collecting loans, deposits, cash records and customer photos…')

    try {
      const res = await fetch('/api/export')
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({}))).error || 'Export failed')
      }

      const blob = await res.blob()

      // Prefer the filename the server chose; it includes the shop name and date.
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? 'loanpro-export.zip'

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)

      toast.success(`Complete LoanPro backup downloaded as ${filename}.`, { id: t })
    } catch (e: any) {
      toast.error(
        `Your backup could not be prepared. ${e?.message ?? 'No data was changed; please try again.'}`,
        { id: t }
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card space-y-4">
      <div className="flex items-center gap-2">
        <HardDriveDownload className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-900">Your data</h2>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-slate-700">Download everything</p>
          <p className="text-xs text-slate-500 mt-0.5">
            A ZIP containing every loan, deposit, cash entry and customer photo,
            as plain JSON. Readable without LoanPro.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={onExport} loading={busy}>
          {!busy && <Download className="h-4 w-4" />}
          {busy ? 'Preparing backup' : 'Download'}
        </Button>
      </div>

      <p className="text-xs text-slate-400">
        Your records are also backed up continuously on our side. This is for
        keeping your own copy — take one whenever you want.
      </p>
    </section>
  )
}
