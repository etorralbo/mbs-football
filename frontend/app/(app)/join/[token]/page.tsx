'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

/**
 * /join/[token]
 *
 * Entry point for invite links.  Saves the token to localStorage so it
 * survives any auth redirect (including Google OAuth → /auth/callback), then
 * hands control to /auth/continue where the actual invite acceptance happens.
 */
export default function JoinTokenPage() {
  const params = useParams()
  const token = params.token as string
  const router = useRouter()

  useEffect(() => {
    if (token) {
      localStorage.setItem('pending_invite_token', token)
      localStorage.setItem('pending_invite_token_at', Date.now().toString())
    }
    router.replace('/auth/continue')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col items-center gap-3 pt-10" aria-busy="true">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#4f9cf9] border-t-transparent" />
      <p className="text-sm text-slate-400">Loading…</p>
    </div>
  )
}
