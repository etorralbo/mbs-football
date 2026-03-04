'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/app/_shared/auth/supabaseClient'

function JoinHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const raw = searchParams.get('token')
  const token = raw && raw.length >= 20 ? raw : null

  useEffect(() => {
    if (!token) return

    // Persist token so it survives any auth redirect.
    localStorage.setItem('pending_invite_token', token)
    localStorage.setItem('pending_invite_token_at', Date.now().toString())

    // Route based on auth state — no RequireAuth wrapper here.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/auth/continue')
      } else {
        router.replace('/login?next=/auth/continue')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!token) {
    return (
      <div className="mx-auto max-w-sm space-y-4 pt-10 text-center">
        <h1 className="text-xl font-semibold text-white">Missing invite token</h1>
        <p className="text-sm text-slate-400">
          This link appears to be incomplete. Ask your coach for a new invite link.
        </p>
        <Link
          href="/sessions"
          className="inline-block text-sm text-[#4f9cf9] hover:underline"
        >
          Go to dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 pt-10" aria-busy="true">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#4f9cf9] border-t-transparent" />
      <p className="text-sm text-slate-400">Joining team…</p>
    </div>
  )
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinHandler />
    </Suspense>
  )
}
