import { isLikelyMobileCaptureDevice } from '../../lib/capture-device'
import { isPublicCameraRoute } from '../../lib/public-route'

const cases: Array<[string, Parameters<typeof isLikelyMobileCaptureDevice>[0], boolean]> = [
  ['Android phone', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile' }, true],
  ['iPhone', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }, true],
  ['iPad desktop UA', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 5 }, true],
  ['Windows touchscreen laptop', { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 10, coarsePointer: true, viewportWidth: 900 }, false],
  ['Mac desktop', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 0, viewportWidth: 1440 }, false],
  ['Client hint wins', { userAgent: 'desktop-looking UA', userAgentDataMobile: true }, true],
]

let failed = 0
for (const [name, input, expected] of cases) {
  const actual = isLikelyMobileCaptureDevice(input)
  if (actual !== expected) {
    failed++
    console.error(`FAIL ${name}: expected ${expected}, got ${actual}`)
  }
}

const routeCases: Array<[string, boolean]> = [
  ['/camera', true],
  ['/camera?key=abc', true],
  ['/api/camera', true],
  ['/api/camera/push', false],
  ['/api/photos/upload-url', false],
]
for (const [pathname, expected] of routeCases) {
  const actual = isPublicCameraRoute(pathname.split('?')[0])
  if (actual !== expected) {
    failed++
    console.error(`FAIL public route ${pathname}: expected ${expected}, got ${actual}`)
  }
}

if (failed) process.exit(1)
console.log(`capture device and route selection: ${cases.length + routeCases.length}/${cases.length + routeCases.length} passed`)
