'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/app/_shared/auth/supabaseClient'

/**
 * Inner component that uses useSearchParams — must be inside <Suspense>.
 * Next.js App Router requires any component calling useSearchParams() to be
 * wrapped in a Suspense boundary to avoid a static-generation bailout.
 */
function CallbackHandler() {
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

  return null
}

export default function AuthCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0d14]">
      <p className="text-sm text-slate-400">Signing you in…</p>
      <Suspense>
        <CallbackHandler />
      </Suspense>
    </div>
  )
}
