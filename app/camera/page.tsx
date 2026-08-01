'use client'
import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Camera, CheckCircle2, AlertCircle, Loader2, RefreshCw } from 'lucide-react'

/**
 * Standalone camera page — opened on mobile via QR code.
 * Does not require authentication.
 * Flow: validate session key → open camera → capture photo → upload → done.
 */

function CameraPageInner() {
  const searchParams = useSearchParams()
  const key = searchParams.get('key')

  const [status,   setStatus]   = useState<'loading' | 'ready' | 'capturing' | 'uploading' | 'done' | 'error'>('loading')
  const [error,    setError]    = useState<string | null>(null)
  const [preview,  setPreview]  = useState<string | null>(null)
  const videoRef   = useRef<HTMLVideoElement>(null)
  const streamRef  = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!key) { setError('Invalid link. Scan the QR code again.'); setStatus('error'); return }
    // Validate session
    fetch(`/api/camera?key=${key}`)
      .then(r => r.json())
      .then(d => {
        if (d.status === 'expired') { setError('This QR code has expired. Please generate a new one.'); setStatus('error') }
        else if (d.status === 'captured') { setStatus('done') }
        else startCamera()
      })
      .catch(() => { setError('Could not connect. Check your internet connection.'); setStatus('error') })
  }, [key])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setStatus('ready')
    } catch {
      setError('Could not open camera. Please allow camera access and try again.')
      setStatus('error')
    }
  }

  const captureAndUpload = async () => {
    if (!videoRef.current || !key) return
    setStatus('capturing')

    const canvas = document.createElement('canvas')
    canvas.width  = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0)

    // Stop camera
    streamRef.current?.getTracks().forEach(t => t.stop())

    canvas.toBlob(async (blob) => {
      if (!blob) { setError('Failed to capture photo. Try again.'); setStatus('ready'); return }
      setPreview(URL.createObjectURL(blob))
      setStatus('uploading')

      const form = new FormData()
      form.append('photo', blob, 'photo.jpg')

      try {
        const res = await fetch(`/api/camera?key=${key}`, { method: 'PUT', body: form })
        if (!res.ok) {
          const e = await res.json()
          throw new Error(e.error || 'Upload failed')
        }
        setStatus('done')
      } catch (err: any) {
        setError(err.message || 'Upload failed. Please try again.')
        setStatus('error')
      }
    }, 'image/jpeg', 0.85)
  }

  const retry = () => {
    setError(null)
    setPreview(null)
    startCamera()
  }

  return (
    <div className="min-h-dvh bg-slate-950 flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="mb-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-gold-500 flex items-center justify-center mx-auto mb-3">
          <span className="text-primary-950 font-black text-lg">LP</span>
        </div>
        <p className="text-white font-semibold">LoanPro Camera</p>
        <p className="text-slate-400 text-sm">Customer photo capture</p>
      </div>

      {/* States */}
      {status === 'loading' && (
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 text-primary-400 animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Preparing camera…</p>
        </div>
      )}

      {(status === 'ready') && (
        <div className="w-full max-w-sm space-y-4">
          <div className="rounded-2xl overflow-hidden bg-black aspect-[3/4]">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          </div>
          <button
            onClick={captureAndUpload}
            className="w-full py-4 rounded-2xl bg-gold-500 text-primary-950 font-bold text-lg
                       flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
          >
            <Camera className="h-6 w-6" /> Take Photo
          </button>
        </div>
      )}

      {status === 'capturing' && (
        <div className="text-center space-y-3">
          {preview && (
            <img src={preview} alt="Captured" className="w-48 h-48 object-cover rounded-2xl mx-auto border-2 border-white/20" />
          )}
          <p className="text-slate-300 text-sm">Processing…</p>
        </div>
      )}

      {status === 'uploading' && (
        <div className="text-center space-y-3">
          {preview && (
            <img src={preview} alt="Captured" className="w-48 h-48 object-cover rounded-2xl mx-auto border-2 border-white/20" />
          )}
          <Loader2 className="h-6 w-6 text-primary-400 animate-spin mx-auto" />
          <p className="text-slate-300 text-sm">Uploading photo…</p>
        </div>
      )}

      {status === 'done' && (
        <div className="text-center space-y-4">
          {preview && (
            <img src={preview} alt="Captured" className="w-48 h-48 object-cover rounded-2xl mx-auto border-2 border-emerald-500/40" />
          )}
          <div className="flex items-center justify-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
            <span className="font-semibold">Photo sent!</span>
          </div>
          <p className="text-slate-400 text-sm">You can close this page. The photo has been sent to the desktop.</p>
        </div>
      )}

      {status === 'error' && (
        <div className="text-center space-y-4 max-w-xs">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto" />
          <p className="text-slate-300 text-sm">{error}</p>
          {error?.includes('expired') ? null : (
            <button
              onClick={retry}
              className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 mx-auto"
            >
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function CameraPage() {
  return (
    <Suspense fallback={
      <div className="min-h-dvh bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary-400 animate-spin" />
      </div>
    }>
      <CameraPageInner />
    </Suspense>
  )
}
