'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Camera, Smartphone, Upload, X, CheckCircle2, Loader2, QrCode, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { isLikelyMobileCaptureDevice } from '@/lib/capture-device'
import Image from 'next/image'
import toast from 'react-hot-toast'

interface Props {
  onPhoto:           (file: File | null) => void
  existingPhotoUrl?: string
  loanId?:           string            // UUID of the loan (if already saved)
}

type Mode = 'idle' | 'camera' | 'push-wait' | 'qr-wait'

// ── Supabase browser client (lightweight — only used for Realtime) ─────────
export function PhotoCapture({ onPhoto, existingPhotoUrl, loanId }: Props) {
  const [mode,       setMode]      = useState<Mode>('idle')
  const [preview,    setPreview]   = useState<string | null>(existingPhotoUrl ?? null)
  const [isMobile,   setIsMobile]  = useState<boolean | null>(null)
  const [hasPaired,  setHasPaired] = useState<boolean | null>(null)  // null = loading
  const [cameraReady, setCameraReady] = useState(false)

  // Push-wait state
  const [sessionKey, setSessionKey] = useState<string | null>(null)
  const [sessionId,  setSessionId]  = useState<string | null>(null)
  const [qrUrl,      setQrUrl]      = useState<string | null>(null)
  const [showQr,     setShowQr]     = useState(false)

  const videoRef   = useRef<HTMLVideoElement>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const objectUrlRef = useRef<string | null>(null)
  const [supabase] = useState(() => createClient())

  // ── Detect device type + paired devices ───────────────────────────────────
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } }
    const mobile = isLikelyMobileCaptureDevice({
      userAgent: navigator.userAgent,
      userAgentDataMobile: nav.userAgentData?.mobile,
      maxTouchPoints: navigator.maxTouchPoints,
      viewportWidth: window.innerWidth,
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    })
    setIsMobile(mobile)
    if (!mobile) {
      // Check if user has a paired phone
      fetch('/api/devices')
        .then(r => r.json())
        .then(d => setHasPaired(d.devices?.length > 0))
        .catch(() => setHasPaired(false))
    }
  }, [])

  // getUserMedia resolves before React has rendered the camera view. Attach
  // the stream after that video element exists, otherwise mobile shows a black
  // preview even though camera permission was granted.
  useEffect(() => {
    if (mode !== 'camera' || !videoRef.current || !streamRef.current) return
    videoRef.current.srcObject = streamRef.current
    void videoRef.current.play().catch(() => undefined)
  }, [mode])

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
  }, [])

  const showLocalPreview = (file: File | Blob) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = URL.createObjectURL(file)
    setPreview(objectUrlRef.current)
  }

  // ── Supabase Realtime — listen for photo on push-wait ─────────────────────
  useEffect(() => {
    if (mode !== 'push-wait' || !sessionId) return

    const channel = supabase
      .channel(`camera_session_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'camera_sessions',
          filter: `id=eq.${sessionId}`,
        },
        async (payload: any) => {
          const row = payload.new
          if (row.status === 'captured' && row.r2_key) {
            channel.unsubscribe()
            // The Realtime row carries an R2 object key, not a URL — the bucket
            // is private. Ask the API for a short-lived signed URL to fetch it.
            try {
              const res = await fetch(`/api/camera?key=${encodeURIComponent(sessionKey!)}`)
              const { photo_url } = await res.json()
              if (!photo_url) throw new Error('No photo URL returned')
              setPreview(photo_url)
              const blob = await fetch(photo_url).then(r => r.blob())
              onPhoto(new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
            } catch {
              onPhoto(null) // parent can retry
            }
            setMode('idle')
            setSessionKey(null)
            setSessionId(null)
          }
        },
      )
      .subscribe()

    // Expire after 10 min if phone never responds
    const timer = setTimeout(() => {
      channel.unsubscribe()
      setMode('idle')
      setSessionKey(null)
      setSessionId(null)
    }, 10 * 60 * 1000)

    return () => { channel.unsubscribe(); clearTimeout(timer) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, sessionId, sessionKey])

  // ── Direct camera (mobile) ────────────────────────────────────────────────
  const startCamera = async () => {
    try {
      setCameraReady(false)
      if (!navigator.mediaDevices?.getUserMedia) {
        fileInputRef.current?.click()
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      })
      streamRef.current = stream
      setMode('camera')
    } catch (error) {
      const denied = error instanceof DOMException && error.name === 'NotAllowedError'
      toast.error(denied
        ? 'Camera permission is blocked. Allow it in your browser settings or choose a photo.'
        : 'Could not open the camera. Choose a photo instead.')
      fileInputRef.current?.click()
    }
  }

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraReady(false)
    setMode('idle')
  }, [])

  const capturePhoto = () => {
    if (!videoRef.current || !videoRef.current.videoWidth || !videoRef.current.videoHeight) return
    const canvas = document.createElement('canvas')
    canvas.width  = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0)
    canvas.toBlob(blob => {
      if (!blob) return
      const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' })
      showLocalPreview(blob)
      onPhoto(file)
      stopCamera()
    }, 'image/jpeg', 0.88)
  }

  // ── File upload fallback ──────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    showLocalPreview(file)
    onPhoto(file)
    e.target.value = ''
  }

  // ── Push capture (desktop → phone) ────────────────────────────────────────
  const startPushCapture = async () => {
    setMode('push-wait')
    setShowQr(false)
    try {
      const res  = await fetch('/api/camera/push', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ loan_id: loanId ?? null }),
      })
      const data = await res.json()

      setSessionKey(data.session_key)
      setSessionId(data.session_id)

      // Build QR as fallback (user can show it manually)
      const cameraUrl = `${window.location.origin}/camera?key=${data.session_key}`
      setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(cameraUrl)}`)

      if (!data.pushed || data.reason === 'no_paired_device') {
        // No paired device — immediately surface QR
        setShowQr(true)
      }
    } catch {
      alert('Failed to send capture request. Try again or use Upload.')
      setMode('idle')
    }
  }

  const cancelPush = () => {
    setMode('idle')
    setSessionKey(null)
    setSessionId(null)
    setQrUrl(null)
    setShowQr(false)
  }

  const removePhoto = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = null
    setPreview(null)
    onPhoto(null)
    setMode('idle')
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  if (preview) {
    return (
      <div className="flex items-center gap-4">
        <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-surface-border flex-shrink-0 shadow-sm">
          <Image src={preview} alt="Customer photo" fill className="object-cover" unoptimized />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            Photo captured
          </div>
          <Button variant="ghost" size="sm" onClick={removePhoto}>
            <X className="h-3.5 w-3.5" /> Remove
          </Button>
        </div>
      </div>
    )
  }

  // ── Camera view (mobile direct) ───────────────────────────────────────────
  if (mode === 'camera') {
    return (
      <div className="space-y-3">
        <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] max-w-sm border border-surface-border">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onCanPlay={() => setCameraReady(true)}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={capturePhoto} disabled={!cameraReady}>
            <Camera className="h-4 w-4" /> Take Photo
          </Button>
          <Button variant="secondary" onClick={stopCamera}>
            <X className="h-4 w-4" /> Cancel
          </Button>
        </div>
      </div>
    )
  }

  // ── Push-wait (desktop → phone push sent) ─────────────────────────────────
  if (mode === 'push-wait') {
    return (
      <div className="space-y-4 max-w-sm">
        {/* Sent push notification — waiting for photo */}
        {!showQr && (
          <div className="flex flex-col items-center gap-3 py-6 px-4 bg-primary-50 rounded-xl border border-primary-100 text-center">
            <div className="relative">
              <Smartphone className="h-10 w-10 text-primary-600" />
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-primary-600" />
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-primary-900">Notification sent to your phone</p>
              <p className="text-xs text-primary-600 mt-1">
                Tap the notification on your phone to open the camera. Photo will appear here instantly.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-primary-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Waiting for photo…
            </div>
          </div>
        )}

        {/* QR fallback (no paired device or user toggled it) */}
        {showQr && qrUrl && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600 font-medium">Scan with your phone to open camera:</p>
            <div className="inline-block p-3 bg-white border border-surface-border rounded-xl shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt="Camera QR" width={160} height={160} />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Waiting for photo from phone…
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!showQr && (
            <Button variant="ghost" size="sm" onClick={() => setShowQr(true)}>
              <QrCode className="h-3.5 w-3.5" /> Show QR instead
            </Button>
          )}
          {showQr && (
            <Button variant="ghost" size="sm" onClick={() => setShowQr(false)}>
              <Wifi className="h-3.5 w-3.5" /> Use push notification
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={cancelPush}>
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
        </div>
      </div>
    )
  }

  // ── Idle — choose method ──────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
      {/* Mobile: direct camera */}
      {isMobile === true && (
        <Button onClick={startCamera}>
          <Camera className="h-4 w-4" /> Take Photo
        </Button>
      )}

      {/* Desktop: push to phone (primary if paired, else shows QR) */}
      {isMobile === false && (
        <Button
          variant="secondary"
          onClick={startPushCapture}
          disabled={hasPaired === null}  // still loading
        >
          <Smartphone className="h-4 w-4" />
          {hasPaired === null
            ? 'Checking devices…'
            : hasPaired
              ? 'Send to Phone'
              : 'Scan with Phone'}
        </Button>
      )}

      {isMobile === null && (
        <Button variant="secondary" disabled>
          <Loader2 className="h-4 w-4 animate-spin" /> Checking camera…
        </Button>
      )}

      {/* Upload fallback — always available */}
      <label className="btn btn-secondary cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-surface-border bg-surface-card hover:bg-surface-hover transition-colors">
        <Upload className="h-4 w-4" /> Choose Photo
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
      </label>
      </div>
      <p className="text-xs text-slate-500">
        {isMobile === true
          ? 'Uses this device’s camera directly. You do not need to pair it first.'
          : isMobile === false
            ? 'Desktop capture continues through your paired phone. You can also choose an existing image.'
            : 'Choosing the best capture method for this device…'}
      </p>
    </div>
  )
}
