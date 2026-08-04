import 'server-only'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { photoCaptureEnabled, withDefaults, type ShopSettings } from '@/lib/settings'

export async function currentPhotoSettings(): Promise<ShopSettings> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('my_settings')
  return withDefaults(data)
}

export async function currentPhotoCaptureEnabled(): Promise<boolean> {
  return photoCaptureEnabled(await currentPhotoSettings())
}

export async function tenantPhotoCaptureEnabled(tenantId: string): Promise<boolean> {
  const service = createServiceClient()
  const { data } = await service
    .from('tenant_settings')
    .select('key, value')
    .eq('tenant_id', tenantId)

  const raw = Object.fromEntries((data ?? []).map(row => [row.key, row.value]))
  return photoCaptureEnabled(withDefaults(raw))
}
