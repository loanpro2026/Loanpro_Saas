import type { PhotoStage } from '@/lib/r2'
/**
 * Photo storage — client-side helpers.
 *
 * Photos live in Cloudflare R2 in a private bucket. The browser never holds R2
 * credentials; it asks our API for a short-lived presigned URL and uses that.
 *
 * Upload is a three-step handshake:
 *   1. POST /api/photos/upload-url  → { key, uploadUrl }
 *   2. PUT the file straight to R2 at uploadUrl   (bypasses our server)
 *   3. POST /api/photos/confirm     → writes the loan_photos row
 *
 * Step 2 going direct to R2 is the point: a 4 MB photo never passes through a
 * Vercel function, so we avoid both the payload limit and the bandwidth cost.
 */

export interface UploadedPhoto {
  key: string
  byteSize: number
  mimeType: string
}

/** Ask the server for a presigned upload URL scoped to this loan. */
async function requestUploadUrl(loanId: number, contentType: string, stage: PhotoStage) {
  const res = await fetch('/api/photos/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loan_id: loanId, content_type: contentType, stage }),
  })
  if (!res.ok) {
    throw new Error((await res.json().catch(() => ({}))).error || 'Could not start upload')
  }
  return res.json() as Promise<{ key: string; uploadUrl: string }>
}

/**
 * Upload a customer photo for a loan.
 *
 * `file` should already be compressed — see `compressImage` below. Uploading a
 * 12 MP photo straight from the camera wastes the shop's mobile data and our
 * storage quota for no visible benefit.
 */
export async function uploadLoanPhoto(
  loanId: number,
  file: File | Blob,
  /**
   * Which photo this is. A loan holds at most one of each, so uploading a
   * second `pledge` replaces the first rather than accumulating.
   */
  stage: PhotoStage = 'pledge'
): Promise<UploadedPhoto> {
  const mimeType = file.type || 'image/jpeg'
  const { key, uploadUrl } = await requestUploadUrl(loanId, mimeType, stage)

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: file,
  })
  if (!put.ok) throw new Error(`Upload to storage failed (${put.status})`)

  const confirm = await fetch('/api/photos/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      loan_id: loanId,
      key,
      stage,
      byte_size: file.size,
      mime_type: mimeType,
    }),
  })
  if (!confirm.ok) {
    throw new Error((await confirm.json().catch(() => ({}))).error || 'Could not save photo')
  }

  return { key, byteSize: file.size, mimeType }
}

/**
 * URL to display a photo.
 *
 * This is our own route, not an R2 URL — it checks the session, confirms the
 * photo belongs to the caller's tenant, then redirects to a 5-minute presigned
 * URL. Safe to drop straight into <img src>.
 */
export function photoUrl(loanId: number, stage: PhotoStage = 'pledge'): string {
  return `/api/photos/${loanId}?stage=${stage}`
}

/**
 * Delete one stage's photo.
 *
 * The stage is required rather than defaulted, deliberately. A caller that
 * forgets it would silently remove the pledge photo — the record of who handed
 * the item over, and the one you are least able to recreate.
 */
export async function deleteLoanPhoto(loanId: number, stage: PhotoStage): Promise<void> {
  const res = await fetch(`/api/photos/${loanId}?stage=${stage}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Could not delete photo')
}

/**
 * Downscale and re-encode before upload.
 *
 * 1600px on the long edge at quality 0.8 keeps a face clearly identifiable
 * while landing around 150–300 KB. Shops photograph customers under poor
 * lighting on cheap phones; going much below this starts to lose detail that
 * matters when verifying someone months later.
 */
export async function compressImage(
  file: File | Blob,
  maxEdge = 1600,
  quality = 0.8
): Promise<Blob> {
  const bitmap = await createImageBitmap(file)

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file          // no canvas support — upload the original
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', quality)
  })
}
