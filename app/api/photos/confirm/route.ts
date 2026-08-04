/**
 * POST /api/photos/confirm
 *
 * Called after the browser has PUT the file to R2. Verifies the object really
 * landed, then records it against the loan.
 *
 * The existence check matters: the client could call this without having
 * uploaded anything, leaving a row that points at a missing object and an
 * image that renders broken forever.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/tenant'
import { keyBelongsToTenant, objectExists, deleteObject, MAX_PHOTO_BYTES, type PhotoStage } from '@/lib/r2'
import { logServerError, rateLimit, requestId } from '@/lib/api-security'
import { currentPhotoCaptureEnabled } from '@/lib/photo-policy'

export async function POST(req: Request) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await currentPhotoCaptureEnabled())) {
    return NextResponse.json({ error: 'Photo capture is disabled in Settings' }, { status: 403 })
  }

  const limited = await rateLimit(req, {
    scope: 'photos.confirm', limit: 30, windowSeconds: 60, identity: `user:${ctx.authId}`,
  })
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const loanId = Number(body?.loan_id)
  const key: string = body?.key ?? ''
  const byteSize = Number(body?.byte_size ?? 0)
  const mimeType: string = body?.mime_type || 'image/jpeg'
  const stage: PhotoStage = body?.stage === 'collection' ? 'collection' : 'pledge'

  if (!Number.isInteger(loanId) || loanId <= 0 || !key) {
    return NextResponse.json({ error: 'loan_id and key are required' }, { status: 400 })
  }

  // A client must never be able to attach an object from another tenant's
  // prefix to its own loan.
  if (!keyBelongsToTenant(key, ctx.tenantId)) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 403 })
  }
  if (byteSize > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: 'Photo too large' }, { status: 413 })
  }

  if (!(await objectExists(key))) {
    return NextResponse.json({ error: 'Upload not found in storage' }, { status: 409 })
  }

  const supabase = await createClient()

  // Replacing an existing photo — remember the old key so we can clean it up.
  // Scoped to the stage: without it, uploading a collection photo would look
  // up the pledge photo's key and delete it below as "the old one".
  const { data: existing } = await supabase
    .from('loan_photos')
    .select('r2_key')
    .eq('loan_id', loanId)
    .eq('stage', stage)
    .maybeSingle()

  const { error } = await supabase
    .from('loan_photos')
    .upsert({
      loan_id:     loanId,
      tenant_id:   ctx.tenantId,
      stage,
      r2_key:      key,
      byte_size:   byteSize,
      mime_type:   mimeType,
      captured_at: new Date().toISOString(),
    }, { onConflict: 'loan_id,stage' })

  if (error) {
    // The row did not save, so the uploaded object is now an orphan.
    await deleteObject(key).catch(() => {})
    logServerError('photos.confirm.database_failed', error, {
      request_id: requestId(req), tenant_id: ctx.tenantId, loan_id: loanId,
    })
    return NextResponse.json({ error: 'Could not save photo' }, { status: 500 })
  }

  // Only now is it safe to drop the old object.
  if (existing?.r2_key && existing.r2_key !== key) {
    await deleteObject(existing.r2_key).catch(() => {})
  }

  return NextResponse.json({ success: true, key })
}
