'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  request,
  UnauthorizedError,
  ValidationError,
  ForbiddenError,
} from '@/app/_shared/api/httpClient'
import type { CreateTeamResponse } from '@/app/_shared/api/types'
import { Button } from '@/app/_shared/components/Button'
import { getPostActionRedirect } from '@/src/features/activation/postActionRedirect'
import { supabase } from '@/app/_shared/auth/supabaseClient'

export function CreateTeamForm() {
  const [name, setName] = useState('')
  // displayName is read from Supabase metadata; only shown as an input if missing
  const [displayName, setDisplayName] = useState<string | null>(null) // null = still loading
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const meta = user?.user_metadata
      setDisplayName((meta?.name ?? meta?.full_name ?? '').trim())
    })
  }, [])

  const nameFromMetadata = displayName !== null && displayName !== ''
  const canSubmit = !!name.trim() && (nameFromMetadata || !!displayName?.trim())

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedTeam = name.trim()
    const trimmedDisplay = displayName?.trim() ?? ''
    if (!trimmedTeam || !trimmedDisplay) return

    setError(null)
    setLoading(true)

    try {
      // If the name was entered manually (was missing from metadata), persist it
      if (!nameFromMetadata) {
        await supabase.auth.updateUser({ data: { name: trimmedDisplay } })
      }

      await request<CreateTeamResponse>('/v1/teams', {
        method: 'POST',
        body: JSON.stringify({ name: trimmedTeam, display_name: trimmedDisplay }),
        teamScoped: false,
      })
      router.replace(getPostActionRedirect('team_created', 'COACH') ?? '/templates')
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        router.replace('/login')
      } else if (err instanceof ForbiddenError) {
        setError(err.message)
      } else if (err instanceof ValidationError) {
        setError(
          typeof err.detail === 'string' ? err.detail : 'Please check the team name.',
        )
      } else if (err instanceof Error && err.message.includes('409')) {
        setError('You already manage a team.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      {/* Only shown when name is missing from the account (e.g. some OAuth providers) */}
      {displayName !== null && !nameFromMetadata && (
        <div>
          <label htmlFor="display-name" className="block text-sm font-medium text-slate-300">
            Your name
          </label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-white/10 bg-[#0d1420] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none"
            placeholder="e.g. Alex García"
            autoFocus
            required
          />
        </div>
      )}

      <div>
        <label htmlFor="team-name" className="block text-sm font-medium text-slate-300">
          Team name
        </label>
        <input
          id="team-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-white/10 bg-[#0d1420] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none"
          placeholder="e.g. FC Barcelona"
          autoFocus={nameFromMetadata}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" disabled={!canSubmit} loading={loading} className="w-full">
        {loading ? 'Creating…' : 'Create team'}
      </Button>
    </form>
  )
}
