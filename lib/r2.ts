/**
 * Cloudflare R2 — server-side object storage client.
 *
 * SERVER ONLY. This module reads secret credentials; importing it into a
 * client component will leak them into the browser bundle. Everything the
 * browser needs goes through the route handlers in app/api/photos/.
 *
 * Why R2 over Supabase Storage: 10 GB free forever and zero egress charges,
 * against Supabase's 500 MB free tier. Customer photos are read far more often
 * than they are written, so egress is the cost that would have grown.
 *
 * The bucket is PRIVATE. These are customer identity photos — they must never
 * have a permanent public URL. Reads go through short-lived presigned URLs.
 */
import 'server-only'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const R2_BUCKET = process.env.R2_BUCKET_NAME || 'loanpro-photos'

/** Max accepted upload. Photos are compressed client-side well below this. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024 // 5 MB

export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const
export type AllowedMime = (typeof ALLOWED_MIME)[number]

let _client: S3Client | null = null

export function r2(): S3Client {
  if (_client) return _client

  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and ' +
      'R2_SECRET_ACCESS_KEY (see .env.example).'
    )
  }

  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
  return _client
}

// ─── Key layout ─────────────────────────────────────────────────────────────
// Tenant id is the first path segment so that a whole shop's photos can be
// listed or deleted with a single prefix operation.
//
//   {tenant_id}/loans/{loan_id}/{uuid}.jpg      identity photo on a loan
//   {tenant_id}/camera/{session_id}.jpg         transient capture-session photo

export function loanPhotoKey(tenantId: string, loanId: number | string, ext = 'jpg') {
  return `${tenantId}/loans/${loanId}/${crypto.randomUUID()}.${ext}`
}

export function cameraSessionKey(tenantId: string, sessionId: string, ext = 'jpg') {
  return `${tenantId}/camera/${sessionId}.${ext}`
}

/**
 * Guard against a caller reaching outside its own tenant. Every read/write
 * path must run this before touching an object — RLS protects Postgres rows,
 * but nothing protects R2 except this check.
 */
export function keyBelongsToTenant(key: string, tenantId: string): boolean {
  if (!key || !tenantId) return false
  if (key.includes('..')) return false
  return key.startsWith(`${tenantId}/`)
}

// ─── Writes ─────────────────────────────────────────────────────────────────

/**
 * Presigned PUT so the browser (or a phone) uploads straight to R2.
 * This keeps large image bodies off the Vercel function payload limit and off
 * our bandwidth bill entirely.
 */
export async function presignUpload(
  key: string,
  contentType: AllowedMime = 'image/jpeg',
  expiresIn = 300
): Promise<string> {
  if (!ALLOWED_MIME.includes(contentType)) {
    throw new Error(`Unsupported content type: ${contentType}`)
  }
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn }
  )
}

/** Direct server-side upload, for the migration script and API-relayed photos. */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: AllowedMime = 'image/jpeg'
): Promise<void> {
  await r2().send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
}

// ─── Reads ──────────────────────────────────────────────────────────────────

/**
 * Short-lived signed GET URL.
 *
 * 5 minutes by default: long enough for a page to render, short enough that a
 * leaked URL in a log or a shared screenshot expires before it matters.
 */
export async function presignDownload(key: string, expiresIn = 300): Promise<string> {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    { expiresIn }
  )
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await r2().send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

// ─── Deletes ────────────────────────────────────────────────────────────────

export async function deleteObject(key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
}

export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  // DeleteObjects caps at 1000 keys per call.
  for (let i = 0; i < keys.length; i += 1000) {
    await r2().send(new DeleteObjectsCommand({
      Bucket: R2_BUCKET,
      Delete: { Objects: keys.slice(i, i + 1000).map(Key => ({ Key })) },
    }))
  }
}
