export interface CaptureDeviceSignals {
  userAgent: string
  userAgentDataMobile?: boolean
  maxTouchPoints?: number
  viewportWidth?: number
  coarsePointer?: boolean
}

/**
 * Choose the capture experience, not an authorization policy.
 *
 * User-agent detection alone misses iPadOS when it requests a desktop site.
 * The touch/viewport fallback catches that case without classifying a normal
 * Windows touchscreen laptop as a phone.
 */
export function isLikelyMobileCaptureDevice(signals: CaptureDeviceSignals): boolean {
  if (typeof signals.userAgentDataMobile === 'boolean') return signals.userAgentDataMobile

  const ua = signals.userAgent
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true
  if (/Windows/i.test(ua)) return false

  const ipadDesktopMode = /Macintosh/i.test(ua) && (signals.maxTouchPoints ?? 0) > 1
  if (ipadDesktopMode) return true

  return Boolean(
    signals.coarsePointer &&
    (signals.maxTouchPoints ?? 0) > 0 &&
    (signals.viewportWidth ?? Number.POSITIVE_INFINITY) <= 1024
  )
}
