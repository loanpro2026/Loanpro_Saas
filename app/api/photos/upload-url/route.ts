/**
 * POST /api/photos/upload-url
 *
 * Issues a short-lived presigned PUT so the browser can upload a photo
 * straight to R2. Body: { loan_id, content_type }
 *
 * The loan is checked against the caller's tenant before a URL is issued —
 * without that check, any authenticated user could obtain a write URL under
 * another shop's key prefix.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/tenant'
import { presignUpload, loanPhotoKey, ALLOWED_MIME, type AllowedMime } from '@/lib/r2'

const EXT: Record<AllowedMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function POST(req: Request) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const loanId = Number(body?.loan_id)
  const contentType = (body?.content_type || 'image/jpeg') as AllowedMime

  if (!Number.isInteger(loanId) || loanId <= 0) {
    return NextResponse.json({ error: 'loan_id is required' }, { status: 400 })
  }
  if (!ALLOWED_MIME.includes(contentType)) {
    return NextResponse.json(
      { error: `Unsupported image type. Allowed: ${ALLOWED_MIME.join(', ')}` },
      { status: 415 }
    )
  }

  // Confirm the loan exists and belongs to this tenant. RLS already scopes
  // this query, so a foreign loan simply comes back empty.
  const supabase = await createClient()
  const { data: loan } = await supabase
    .from('loans')
    .select('id')
    .eq('id', loanId)
    .single()

  if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 })

  const key = loanPhotoKey(ctx.tenantId, loanId, EXT[contentType])

  try {
    const uploadUrl = await presignUpload(key, contentType)
    return NextResponse.json({ key, uploadUrl })
  } catch (err) {
    console.error('[photos/upload-url] presign failed', err)
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 })
  }
}
