'use client'
/**
 * DeviceRegistrationBridge
 *
 * Mount this once inside the authenticated layout.
 * It listens for the 'loanpro-native-ready' event dispatched by
 * WebViewActivity (Android) after the page loads, reads the FCM token
 * from window.__LOANPRO_FCM_TOKEN__, and registers the device via
 * /api/devices — without any user interaction required.
 *
 * For iOS PWA, it does nothing here (push subscription is requested
 * separately via usePushNotifications hook).
 */
import { useEffect } from 'react'

export function DeviceRegistrationBridge() {
  useEffect(() => {
    const register = async (fcmToken: string, deviceType: string) => {
      try {
        const deviceName = (window as any).__LOANPRO_DEVICE_NAME__ ?? 'Android Device'
        const res = await fetch('/api/devices', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            device_name: deviceName,
            device_type: deviceType === 'android' ? 'android' : 'pwa',
            fcm_token:   deviceType === 'android' ? fcmToken : undefined,
          }),
        })

        if (res.ok) {
          // Notify native side that registration succeeded
          (window as any).LoanProNative?.onDeviceRegistered?.()
          console.log('[LoanPro] Device registered for push notifications')
        }
      } catch (err) {
        console.warn('[LoanPro] Device registration failed:', err)
      }
    }

    // Case 1: Page loaded after native-ready was dispatched — check globals immediately
    const w = window as any
    if (w.__LOANPRO_FCM_TOKEN__) {
      register(w.__LOANPRO_FCM_TOKEN__, w.__LOANPRO_DEVICE_TYPE__ ?? 'android')
      return
    }

    // Case 2: Event fires after this component mounts
    const handler = (e: Event) => {
      const { fcmToken, deviceType } = (e as CustomEvent).detail ?? {}
      if (fcmToken) register(fcmToken, deviceType ?? 'android')
    }

    window.addEventListener('loanpro-native-ready', handler)
    return () => window.removeEventListener('loanpro-native-ready', handler)
  }, [])

  return null  // Renders nothing
}
