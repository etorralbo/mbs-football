'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

/**
 * Legacy /join?token=... page.
 * Redirects to the new path-based /join/{token} page.
 */
function JoinHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const raw = searchParams.get('token')
  const token = raw && raw.length >= 20 ? raw : null

  useEffect(() => {
    if (!token) return
    router.replace(`/join/${encodeURIComponent(token)}`)
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
          href="/login"
          className="inline-block text-sm text-[#4f9cf9] hover:underline"
        >
          Go to login
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 pt-10" aria-busy="true">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#4f9cf9] border-t-transparent" />
      <p className="text-sm text-slate-400">Redirecting...</p>
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
