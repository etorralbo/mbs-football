'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/app/_shared/auth/supabaseClient'

/**
 * Landing page after OAuth redirect (Google, etc.).
 * Supabase appends a `code` query param (PKCE) that must be exchanged
 * for a session before navigating into the app.
 */
export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(() => {
        router.replace('/onboarding')
      })
    } else {
      // No code — session may already be set (implicit flow) or something went wrong.
      router.replace('/onboarding')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <p className="text-sm text-zinc-500">Signing you in…</p>
    </div>
  )
}
