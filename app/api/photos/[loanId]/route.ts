/**
 * GET    /api/photos/:loanId  — redirect to a short-lived signed R2 URL
 * DELETE /api/photos/:loanId  — remove the photo and its object
 *
 * Photos are customer identity documents. They are never publicly addressable:
 * the bucket is private and every read is authorised here first, then handed a
 * URL that expires in five minutes.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/tenant'
import { presignDownload, deleteObject, keyBelongsToTenant, type PhotoStage } from '@/lib/r2'
import { currentPhotoCaptureEnabled } from '@/lib/photo-policy'

/**
 * Which photo the caller means.
 *
 * Defaults to `pledge` on GET so an old link keeps resolving, but DELETE
 * demands it explicitly — see the note there.
 */
function stageFrom(req: Request, fallback: PhotoStage | null): PhotoStage | null {
  const raw = new URL(req.url).searchParams.get('stage')
  if (raw === 'pledge' || raw === 'collection') return raw
  return raw ? null : fallback
}


const SIGNED_URL_TTL = 300 // 5 minutes

export async function GET(
  req: Request,
  { params }: { params: Promise<{ loanId: string }> }
) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await currentPhotoCaptureEnabled())) return NextResponse.json({ error: 'Photo capture is disabled in Settings' }, { status: 403 })

  const { loanId } = await params
  const id = Number(loanId)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid loan id' }, { status: 400 })
  }

  // RLS scopes this to the caller's tenant.
  const supabase = await createClient()
  const stage = stageFrom(req, 'pledge')
  if (!stage) return NextResponse.json({ error: 'Unknown stage' }, { status: 400 })

  const { data: photo } = await supabase
    .from('loan_photos')
    .select('r2_key')
    .eq('loan_id', id)
    .eq('stage', stage)
    .maybeSingle()

  if (!photo?.r2_key) {
    return NextResponse.json({ error: 'No photo for this loan' }, { status: 404 })
  }
  // Belt and braces: a mismatched prefix means the row is corrupt.
  if (!keyBelongsToTenant(photo.r2_key, ctx.tenantId)) {
    console.error('[photos] key/tenant mismatch', { loanId: id, tenant: ctx.tenantId })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const url = await presignDownload(photo.r2_key, SIGNED_URL_TTL)

  // Cache privately for slightly less than the URL's own lifetime, so a browser
  // never re-uses a cached redirect to an already-expired URL.
  return NextResponse.redirect(url, {
    status: 307,
    headers: { 'Cache-Control': `private, max-age=${SIGNED_URL_TTL - 60}` },
  })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ loanId: string }> }
) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await currentPhotoCaptureEnabled())) return NextResponse.json({ error: 'Photo capture is disabled in Settings' }, { status: 403 })

  const { loanId } = await params
  const id = Number(loanId)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid loan id' }, { status: 400 })
  }

  // No default here. Falling back to `pledge` would mean a caller that forgot
  // the parameter deletes the record of who handed the item over — the photo
  // you are least able to recreate.
  const stage = stageFrom(req, null)
  if (!stage) {
    return NextResponse.json(
      { error: 'stage is required: pledge or collection' }, { status: 400 }
    )
  }

  const supabase = await createClient()
  const { data: photo } = await supabase
    .from('loan_photos')
    .select('r2_key')
    .eq('loan_id', id)
    .eq('stage', stage)
    .maybeSingle()

  if (!photo) return NextResponse.json({ success: true })

  // Delete the row first. If the object delete fails afterwards we leak an
  // object, which a sweep can reclaim; the reverse order would leave a row
  // pointing at nothing, which the UI cannot recover from.
  const { error } = await supabase
    .from('loan_photos').delete().eq('loan_id', id).eq('stage', stage)
  if (error) return NextResponse.json({ error: 'Could not delete photo' }, { status: 500 })

  if (photo.r2_key && keyBelongsToTenant(photo.r2_key, ctx.tenantId)) {
    await deleteObject(photo.r2_key).catch(err =>
      console.error('[photos] orphaned object', photo.r2_key, err)
    )
  }

  return NextResponse.json({ success: true })
}
