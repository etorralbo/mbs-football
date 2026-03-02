'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  request,
  UnauthorizedError,
  NotFoundError,
  ValidationError,
} from '@/app/_shared/api/httpClient'
import type { AcceptInviteResponse } from '@/app/_shared/api/types'
import { Button } from '@/app/_shared/components/Button'
import { getPostActionRedirect } from '@/src/features/activation/postActionRedirect'

export function JoinTeamForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Pre-fill code from ?code= query param (e.g. when opening a join link)
  useEffect(() => {
    const codeParam = searchParams.get('code')
    if (codeParam) setCode(codeParam)
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) return

    setError(null)
    setLoading(true)

    try {
      await request<AcceptInviteResponse>('/v1/invites/accept', {
        method: 'POST',
        body: JSON.stringify({ code: trimmed }),
      })
      router.replace(getPostActionRedirect('invite_accepted', 'ATHLETE') ?? '/templates')
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        router.replace('/login')
      } else if (err instanceof NotFoundError) {
        setError('Invite code not found. Please check and try again.')
      } else if (err instanceof ValidationError) {
        setError('Invalid invite code format.')
      } else if (err instanceof Error) {
        // Handle 409 (used) and 410 (expired) via ServerError message
        if (err.message.toLowerCase().includes('used')) {
          setError('This invite has already been used.')
        } else if (err.message.toLowerCase().includes('expired')) {
          setError('This invite has expired. Ask your coach for a new one.')
        } else {
          setError(err.message || 'Something went wrong. Please try again.')
        }
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="invite-code" className="block text-sm font-medium text-slate-300">
          Invite code
        </label>
        <input
          id="invite-code"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-white/10 bg-[#0d1420] px-3 py-2 font-mono text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none"
          placeholder="Paste your invite code here"
          autoFocus
          spellCheck={false}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" disabled={!code.trim()} loading={loading} className="w-full">
        {loading ? 'Joining…' : 'Join team'}
      </Button>
    </form>
  )
}
