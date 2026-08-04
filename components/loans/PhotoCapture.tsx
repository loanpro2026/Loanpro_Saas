'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Camera, Smartphone, Upload, X, CheckCircle2, Loader2, QrCode, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { isLikelyMobileCaptureDevice } from '@/lib/capture-device'
import Image from 'next/image'
import toast from 'react-hot-toast'
import { useSettings } from '@/components/settings/SettingsProvider'
import { userFacingError } from '@/lib/user-message'

interface Props {
  onPhoto:           (file: File | null) => void
  existingPhotoUrl?: string
  loanId?:           string            // UUID of the loan (if already saved)
}

type Mode = 'idle' | 'camera' | 'push-wait' | 'qr-wait'
type CaptureSource = 'cloud-companion' | 'browser-qr'

// ── Supabase browser client (lightweight — only used for Realtime) ─────────
export function PhotoCapture({ onPhoto, existingPhotoUrl, loanId }: Props) {
  const settings = useSettings()
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
  const [captureSource, setCaptureSource] = useState<CaptureSource | null>(null)

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
    if (!mobile && settings.photo_capture_mode === 'mobile') {
      // Check if user has a paired phone
      fetch('/api/mobile-capture/devices')
        .then(r => r.json())
        .then(d => setHasPaired(d.devices?.length > 0))
        .catch(() => setHasPaired(false))
    } else if (!mobile) {
      setHasPaired(false)
    }
  }, [settings.photo_capture_mode])

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
    if (mode !== 'push-wait' || captureSource !== 'browser-qr' || !sessionId) return

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
  }, [mode, sessionId, sessionKey, captureSource])

  // The Android app sends the image to Cloud Run only as a temporary relay.
  // This converts the completed relay payload back into the same File used by
  // direct camera/upload, so the existing loan save path remains responsible
  // for permanent R2 storage.
  useEffect(() => {
    if (mode !== 'push-wait' || captureSource !== 'cloud-companion' || !sessionId) return

    let stopped = false
    let polling = false
    const poll = async () => {
      if (stopped || polling) return
      polling = true
      try {
        const response = await fetch(`/api/mobile-capture/capture?session_id=${encodeURIComponent(sessionId)}`, {
          cache: 'no-store',
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Could not check the phone capture')

        if (data.status === 'captured' && data.image_base64) {
          stopped = true
          const binary = atob(data.image_base64)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
          const mimeType = data.image_content_type || 'image/jpeg'
          const file = new File([bytes], 'phone-capture.jpg', { type: mimeType })
          showLocalPreview(file)
          onPhoto(file)
          setMode('idle')
          setCaptureSource(null)
          setSessionId(null)
          void fetch(`/api/mobile-capture/capture?session_id=${encodeURIComponent(sessionId)}`, {
            method: 'DELETE',
          }).catch(() => undefined)
          toast.success('Photo received from your phone.')
          return
        }

        if (data.status === 'failed' || data.status === 'expired') {
          throw new Error('The phone capture expired. Please try again.')
        }
      } catch (error) {
        stopped = true
        setMode('idle')
        setCaptureSource(null)
        setSessionId(null)
        toast.error(userFacingError(
          error,
          'The photo was not received from the phone. Ask the customer to keep the companion app open, then try again.',
        ))
      } finally {
        polling = false
      }
    }

    void poll()
    const timer = setInterval(() => void poll(), 1500)
    return () => { stopped = true; clearInterval(timer) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, captureSource, sessionId])

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
  const startBrowserQrCapture = async () => {
    setMode('push-wait')
    setCaptureSource('browser-qr')
    setShowQr(true)
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
      toast.error('A camera QR code could not be created. Try again or choose a photo from this device.')
      setMode('idle')
      setCaptureSource(null)
    }
  }

  const startPushCapture = async () => {
    if (!hasPaired) {
      await startBrowserQrCapture()
      return
    }

    setMode('push-wait')
    setCaptureSource('cloud-companion')
    setShowQr(false)
    setQrUrl(null)
    try {
      const response = await fetch('/api/mobile-capture/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.session_id) {
        throw new Error(data.error || 'Could not send the capture request')
      }
      setSessionId(data.session_id)
      setSessionKey(null)
    } catch (error) {
      toast.error(userFacingError(
        error,
        'The paired phone could not be reached. Check that it is online and the companion app is open.',
      ))
      setMode('idle')
      setCaptureSource(null)
    }
  }

  const cancelPush = () => {
    if (captureSource === 'cloud-companion' && sessionId) {
      void fetch(`/api/mobile-capture/capture?session_id=${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      }).catch(() => undefined)
    }
    setMode('idle')
    setCaptureSource(null)
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
        {captureSource === 'cloud-companion' && !showQr && (
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
          {captureSource === 'cloud-companion' && !showQr && (
            <Button variant="ghost" size="sm" onClick={() => { cancelPush(); void startBrowserQrCapture() }}>
              <QrCode className="h-3.5 w-3.5" /> Show QR instead
            </Button>
          )}
          {captureSource === 'browser-qr' && showQr && hasPaired && (
            <Button variant="ghost" size="sm" onClick={() => { cancelPush(); void startPushCapture() }}>
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

      {/* Desktop local mode: use the attached webcam/browser camera. */}
      {isMobile === false && settings.photo_capture_mode === 'local' && (
        <Button onClick={startCamera}>
          <Camera className="h-4 w-4" /> Use Local Camera
        </Button>
      )}

      {/* Desktop mobile mode: use the paired Android companion. */}
      {isMobile === false && settings.photo_capture_mode === 'mobile' && (
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
            ? settings.photo_capture_mode === 'mobile'
              ? 'Desktop capture continues through your paired phone. You can also choose an existing image.'
              : 'Uses the camera attached to this computer. You can also choose an existing image.'
            : 'Choosing the best capture method for this device…'}
      </p>
    </div>
  )
}
