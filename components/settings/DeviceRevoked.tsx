'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'

export function DeviceRevoked() {
  const [busy, setBusy] = useState(false)

  const finish = async () => {
    setBusy(true)
    await createClient().auth.signOut({ scope: 'local' })
    window.location.assign('/login?message=This device has been signed out')
  }

  return <Button loading={busy} onClick={() => void finish()}>Go to sign in</Button>
}
