'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  request,
  UnauthorizedError,
  NotFoundError,
} from '@/app/_shared/api/httpClient'
import { Button } from '@/app/_shared/components/Button'
import type { AcceptInviteResponse } from '@/app/_shared/api/types'
import { getPostActionRedirect } from '@/src/features/activation/postActionRedirect'
import { supabase } from '@/app/_shared/auth/supabaseClient'

type PageState =
  | { phase: 'loading-name' }
  | { phase: 'needs-name'; displayName: string }
  | { phase: 'joining' }
  | { phase: 'error'; message: string }

export default function JoinTokenPage() {
  const params = useParams()
  const token = params.token as string
  const router = useRouter()

  const [state, setState] = useState<PageState>({ phase: 'loading-name' })
  const [inputName, setInputName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Guard against React Strict Mode's double-invocation of effects in dev.
  // Set to true synchronously before the first async call so any re-run is a no-op.
  const hasSubmitted = useRef(false)

  useEffect(() => {
    if (hasSubmitted.current) return
    hasSubmitted.current = true

    supabase.auth.getUser().then(({ data: { user } }) => {
      const meta = user?.user_metadata
      const name = (meta?.name ?? meta?.full_name ?? '').trim()
      if (name) {
        // Name available — auto-join immediately
        void joinTeam(name)
      } else {
        // Name missing — show input
        setState({ phase: 'needs-name', displayName: '' })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function joinTeam(displayName: string) {
    setState({ phase: 'joining' })
    try {
      await request<AcceptInviteResponse>(
        `/v1/team-invites/${encodeURIComponent(token)}/accept`,
        {
          method: 'POST',
          body: JSON.stringify({ display_name: displayName }),
          teamScoped: false,
        },
      )
      // getPostActionRedirect returns a hardcoded internal path — no open redirect risk.
      router.replace(getPostActionRedirect('invite_accepted', 'ATHLETE') ?? '/sessions')
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        router.replace('/login')
        return
      }
      if (err instanceof NotFoundError) {
        setState({ phase: 'error', message: 'This invite link is invalid or has expired. Ask your coach for a new one.' })
        return
      }
      if (err instanceof Error) {
        if (err.message.toLowerCase().includes('used')) {
          setState({ phase: 'error', message: 'This invite link has already been used.' })
        } else if (err.message.toLowerCase().includes('expired')) {
          setState({ phase: 'error', message: 'This invite link has expired. Ask your coach for a new one.' })
        } else {
          setState({ phase: 'error', message: err.message || 'Something went wrong. Please try again.' })
        }
        return
      }
      setState({ phase: 'error', message: 'Something went wrong. Please try again.' })
    }
  }

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = inputName.trim()
    if (!trimmed) return
    setSubmitting(true)
    // Persist name to Supabase metadata for future sessions
    await supabase.auth.updateUser({ data: { name: trimmed } })
    await joinTeam(trimmed)
    setSubmitting(false)
  }

  if (state.phase === 'loading-name' || state.phase === 'joining') {
    return (
      <div className="flex flex-col items-center gap-3 pt-10">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#4f9cf9] border-t-transparent" />
        <p className="text-sm text-slate-400">
          {state.phase === 'joining' ? 'Joining team…' : 'Loading…'}
        </p>
      </div>
    )
  }

  if (state.phase === 'error') {
    return (
      <div className="max-w-sm space-y-4">
        <h1 className="text-xl font-semibold text-white">Unable to join team</h1>
        <p role="alert" className="text-sm text-red-400">{state.message}</p>
      </div>
    )
  }

  // phase === 'needs-name'
  return (
    <div className="max-w-sm">
      <h1 className="text-xl font-semibold text-white">Join team</h1>
      <p className="mt-2 text-sm text-slate-400">Enter your name to complete joining.</p>
      <form onSubmit={handleNameSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="display-name" className="block text-sm font-medium text-slate-300">
            Your name
          </label>
          <input
            id="display-name"
            type="text"
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-white/10 bg-[#0d1420] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none"
            placeholder="e.g. Alex García"
            autoFocus
            required
          />
        </div>
        <Button type="submit" disabled={!inputName.trim() || submitting} loading={submitting} className="w-full">
          {submitting ? 'Joining…' : 'Join team'}
        </Button>
      </form>
    </div>
  )
}
