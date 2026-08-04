import 'server-only'

const REQUEST_TIMEOUT_MS = 15_000

export interface CloudCaptureDevice {
  deviceId: string
  deviceName: string
  isDefault: boolean
  pairedAt: string | null
  lastActive: string | null
  online: boolean
}

export interface PairingSession {
  pairingToken: string
  expiresAt: string
}

export interface CaptureSession {
  sessionId: string
  deviceId: string | null
  expiresAt: string | null
}

export interface CaptureStatus {
  status: 'pending' | 'captured' | 'failed' | 'expired'
  deviceId: string | null
  expiresAt: string | null
  imageBase64?: string
  imageContentType?: string
}

export class MobileCaptureError extends Error {
  status: number

  constructor(message: string, status = 502) {
    super(message)
    this.name = 'MobileCaptureError'
    this.status = status
  }
}

function configuration() {
  const baseUrl = String(process.env.MOBILE_CAPTURE_API_BASE_URL ?? '')
    .trim()
    .replace(/\/+$/, '')
  const apiKey = String(process.env.MOBILE_CAPTURE_API_KEY ?? '').trim()

  if (!baseUrl || !apiKey) {
    throw new MobileCaptureError(
      'Paired-phone capture is not configured. Set MOBILE_CAPTURE_API_BASE_URL and MOBILE_CAPTURE_API_KEY.',
      503,
    )
  }

  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new MobileCaptureError('MOBILE_CAPTURE_API_BASE_URL is not a valid URL.', 503)
  }

  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  if (parsed.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && local)) {
    throw new MobileCaptureError('The mobile capture service must use HTTPS.', 503)
  }

  return { baseUrl, apiKey }
}

export function mobileCaptureConfigured(): boolean {
  return Boolean(
    String(process.env.MOBILE_CAPTURE_API_BASE_URL ?? '').trim()
    && String(process.env.MOBILE_CAPTURE_API_KEY ?? '').trim(),
  )
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl, apiKey } = configuration()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      cache: 'no-store',
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>

    if (!response.ok) {
      const message = typeof payload.error === 'string'
        ? payload.error
        : `Mobile capture service returned ${response.status}.`
      throw new MobileCaptureError(message, response.status >= 500 ? 502 : response.status)
    }

    return payload as T
  } catch (error) {
    if (error instanceof MobileCaptureError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new MobileCaptureError('Mobile capture service timed out.', 504)
    }
    throw new MobileCaptureError('Could not reach the mobile capture service.', 502)
  } finally {
    clearTimeout(timer)
  }
}

function toIso(value: unknown): string | null {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function mapDevice(raw: Record<string, unknown>): CloudCaptureDevice {
  const lastActive = toIso(raw.lastActiveAt ?? raw.lastActive ?? raw.updatedAt)
  return {
    deviceId: String(raw.deviceId ?? ''),
    deviceName: String(raw.deviceName ?? 'Android phone'),
    isDefault: Boolean(raw.isDefault),
    pairedAt: toIso(raw.createdAt ?? raw.pairedAt),
    lastActive,
    online: Boolean(lastActive && Date.now() - new Date(lastActive).getTime() < 2 * 60 * 1000),
  }
}

export async function listCloudCaptureDevices(tenantId: string): Promise<CloudCaptureDevice[]> {
  const payload = await request<{ devices?: Record<string, unknown>[] }>(
    `/api/devices?shopId=${encodeURIComponent(tenantId)}`,
  )
  return Array.isArray(payload.devices)
    ? payload.devices.map(mapDevice).filter(device => device.deviceId)
    : []
}

export async function createCloudPairingSession(tenantId: string): Promise<PairingSession> {
  const payload = await request<{ pairingToken?: string; expiresAt?: string }>(
    '/api/generate-pair-token',
    { method: 'POST', body: JSON.stringify({ shopId: tenantId }) },
  )
  if (!payload.pairingToken || !payload.expiresAt) {
    throw new MobileCaptureError('Mobile capture service returned an invalid pairing session.')
  }
  return { pairingToken: payload.pairingToken, expiresAt: payload.expiresAt }
}

export function cloudPairingQrPayload(tenantId: string, pairingToken: string): string {
  const { baseUrl, apiKey } = configuration()
  return JSON.stringify({ shopId: tenantId, pairingToken, backendUrl: baseUrl, apiKey })
}

export async function updateCloudCaptureDevice(
  tenantId: string,
  deviceId: string,
  patch: { deviceName?: string; isDefault?: boolean },
): Promise<void> {
  await request(`/api/devices/${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    body: JSON.stringify({ shopId: tenantId, ...patch }),
  })
}

export async function removeCloudCaptureDevice(tenantId: string, deviceId: string): Promise<void> {
  await request(
    `/api/devices/${encodeURIComponent(deviceId)}?shopId=${encodeURIComponent(tenantId)}`,
    { method: 'DELETE' },
  )
}

export async function createCloudCaptureSession(
  tenantId: string,
  deviceId?: string,
): Promise<CaptureSession> {
  const payload = await request<{ sessionId?: string; deviceId?: string; expiresAt?: string }>(
    '/api/capture-request',
    {
      method: 'POST',
      body: JSON.stringify({ shopId: tenantId, ...(deviceId ? { deviceId } : {}) }),
    },
  )
  if (!payload.sessionId) {
    throw new MobileCaptureError('Mobile capture service did not create a capture session.')
  }
  return {
    sessionId: payload.sessionId,
    deviceId: payload.deviceId ?? deviceId ?? null,
    expiresAt: toIso(payload.expiresAt),
  }
}

export async function getCloudCaptureStatus(
  tenantId: string,
  sessionId: string,
): Promise<CaptureStatus> {
  const payload = await request<Record<string, unknown>>(
    `/api/capture-status?sessionId=${encodeURIComponent(sessionId)}&shopId=${encodeURIComponent(tenantId)}`,
  )
  const rawStatus = String(payload.status ?? 'pending')
  const status: CaptureStatus['status'] = rawStatus === 'completed'
    ? 'captured'
    : rawStatus === 'failed'
      ? 'failed'
      : rawStatus === 'expired'
        ? 'expired'
        : 'pending'

  return {
    status,
    deviceId: payload.deviceId ? String(payload.deviceId) : null,
    expiresAt: toIso(payload.expiresAt),
    imageBase64: status === 'captured' && typeof payload.imageBase64 === 'string'
      ? payload.imageBase64
      : undefined,
    imageContentType: status === 'captured' && typeof payload.imageContentType === 'string'
      ? payload.imageContentType
      : undefined,
  }
}

export async function deleteCloudCaptureSession(tenantId: string, sessionId: string): Promise<void> {
  await request(
    `/api/capture-session/${encodeURIComponent(sessionId)}?shopId=${encodeURIComponent(tenantId)}`,
    { method: 'DELETE' },
  )
}
