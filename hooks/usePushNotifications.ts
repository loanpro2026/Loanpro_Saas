'use client'
/**
 * usePushNotifications
 *
 * Registers the service worker, subscribes to Web Push (VAPID), and
 * sends the subscription to /api/devices so the server can push
 * camera capture requests to this device.
 *
 * Usage:
 *   const { supported, subscribed, subscribe, unsubscribe } = usePushNotifications()
 */
import { useState, useEffect, useCallback } from 'react'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

interface PushState {
  supported:   boolean
  subscribed:  boolean
  loading:     boolean
  error:       string | null
  subscribe:   (deviceName?: string) => Promise<void>
  unsubscribe: () => Promise<void>
}

export function usePushNotifications(): PushState {
  const [supported,  setSupported]  = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setSupported(true)
      // Check if already subscribed
      navigator.serviceWorker.ready.then(reg =>
        reg.pushManager.getSubscription().then(sub => {
          setSubscribed(!!sub)
        })
      )
    }
  }, [])

  const subscribe = useCallback(async (deviceName = 'My Phone') => {
    setLoading(true)
    setError(null)
    try {
      // Register SW if not already
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready

      // Request notification permission
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notification permission denied')

      // Subscribe to push
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) throw new Error('VAPID key not configured')

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      // Detect device type
      const isIos     = /iPhone|iPad|iPod/i.test(navigator.userAgent)
      const deviceType = isIos ? 'ios' : 'pwa'

      // Send to server
      const res = await fetch('/api/devices', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          device_name:       deviceName,
          device_type:       deviceType,
          push_subscription: sub.toJSON(),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Registration failed')

      setSubscribed(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
        // Optionally remove from server too (best effort)
        const { devices } = await fetch('/api/devices').then(r => r.json())
        const pwaDevice = devices?.find((d: any) => d.device_type === 'pwa' || d.device_type === 'ios')
        if (pwaDevice) {
          await fetch(`/api/devices?id=${pwaDevice.id}`, { method: 'DELETE' })
        }
      }
      setSubscribed(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  return { supported, subscribed, loading, error, subscribe, unsubscribe }
}
