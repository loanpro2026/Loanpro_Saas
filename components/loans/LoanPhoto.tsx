'use client'
/**
 * Customer identity photo on the loan detail page.
 *
 * The image is served by /api/photos/:loanId, which authorises the request and
 * then redirects to a 5-minute presigned R2 URL. There is no public URL for
 * these — they are identity documents.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { userFacingError } from '@/lib/user-message'
import { UserCircle2, Trash2, Camera, ShieldCheck, Clock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { PhotoCapture } from '@/components/loans/PhotoCapture'
import { uploadLoanPhoto, compressImage, deleteLoanPhoto, photoUrl } from '@/lib/storage'
import type { PhotoStage } from '@/lib/r2'
import { useOffline } from '@/components/offline/OfflineProvider'
import { useSettings } from '@/components/settings/SettingsProvider'
import { photoCaptureEnabled } from '@/lib/settings'

interface Props {
  loanId: number
  hasPhoto: boolean
  verifiedBy: string | null
  readOnly: boolean
  /**
   * Which photo this panel is for. A loan holds up to two: the pledge photo
   * from when it was created, and the collection photo from when it was
   * closed. Defaults to pledge, which is what the detail page has always
   * shown.
   */
  stage?: PhotoStage
  /** Render without the card wrapper and heading, for use inside another card. */
  bare?: boolean
}

export function LoanPhoto({
  loanId, hasPhoto, verifiedBy, readOnly, stage = 'pledge', bare = false,
}: Props) {
  const router = useRouter()
  const settings = useSettings()
  const captureEnabled = photoCaptureEnabled(settings)
  const { online, queueWrite } = useOffline()
  const [capturing, setCapturing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [queuedPhoto, setQueuedPhoto] = useState<string | null>(null)
  // Cache-buster so a replaced photo shows immediately rather than serving the
  // browser's copy of the previous one.
  const [version, setVersion] = useState(0)
  const stageLabel = stage === 'collection' ? 'Collection' : 'Pledge'

  const onPhoto = (file: File | null) => {
    if (!file) return
    startTransition(async () => {
      try {
        const compressed = await compressImage(file)

        // Queue rather than lose it. The customer is in front of the counter
        // now; asking them to come back when the internet works is not an
        // option. Compressed first so the queue holds ~250KB, not 4MB.
        if (!online) {
          await queueWrite('photo', { loan_id: loanId, stage }, compressed)
          // Show it locally so the shop can see the capture worked.
          setQueuedPhoto(URL.createObjectURL(compressed))
          toast.success(`${stageLabel} photo for loan #${loanId} is saved on this device and will upload after reconnection.`,
            { duration: 6000 })
          setCapturing(false)
          return
        }

        await uploadLoanPhoto(loanId, compressed, stage)
        toast.success(`${stageLabel} photo attached to loan #${loanId}.`)
        setCapturing(false)
        setQueuedPhoto(null)
        setVersion(v => v + 1)
        router.refresh()
      } catch (err: any) {
        toast.error(userFacingError(
          err,
          `${stageLabel} photo was not attached to loan #${loanId}. Capture or choose the photo again.`,
        ))
      }
    })
  }

  const onDelete = () => startTransition(async () => {
    try {
      await deleteLoanPhoto(loanId, stage)
      toast.success(`${stageLabel} photo removed from loan #${loanId}.`)
      setVersion(v => v + 1)
      router.refresh()
    } catch {
      toast.error(`${stageLabel} photo was not removed from loan #${loanId}; the stored image is unchanged.`)
    }
  })

  return (
    // `bare` drops the card chrome: on the loan detail this panel already sits
    // inside "Identity on file", and a card within a card reads as a mistake.
    <div className={bare ? 'space-y-3' : 'card space-y-3'}>
      {!bare && (
        <div className="flex items-center justify-between">
          <h2 className="card-title">Customer photo</h2>
          {verifiedBy && (
            <span className="inline-flex items-center gap-1 text-12 text-green">
              <ShieldCheck className="h-3.5 w-3.5" /> {verifiedBy}
            </span>
          )}
        </div>
      )}

      <div className="aspect-[3/4] rounded-xl overflow-hidden bg-surface-muted flex items-center justify-center relative">
        {queuedPhoto ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={queuedPhoto} alt="Captured photo, waiting to upload"
                 className="w-full h-full object-cover" />
            <span className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 rounded-lg bg-amber-500/90 px-2 py-1 text-[11px] font-medium text-white">
              <Clock className="h-3 w-3 shrink-0" /> Waiting to upload
            </span>
          </>
        ) : hasPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${photoUrl(loanId, stage)}&v=${version}`}
            alt="Customer identity photo"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-center px-4">
            <UserCircle2 className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="text-xs text-slate-400 mt-2">No photo on file</p>
          </div>
        )}
      </div>

      {!readOnly && captureEnabled && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => setCapturing(true)}
          >
            <Camera className="h-4 w-4" /> {hasPhoto ? 'Replace' : 'Capture'}
          </Button>
          {hasPhoto && (
            <Button size="sm" variant="ghost" onClick={onDelete} loading={pending}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {!readOnly && !captureEnabled && !hasPhoto && (
        <p className="text-xs text-slate-400">Photo capture is turned off in Settings.</p>
      )}

      {readOnly && hasPhoto && (
        <p className="text-xs text-slate-400">
          Kept for the closed record.
        </p>
      )}

      <Modal open={capturing} onClose={() => setCapturing(false)} title="Capture photo">
        <PhotoCapture onPhoto={onPhoto} />
      </Modal>
    </div>
  )
}
