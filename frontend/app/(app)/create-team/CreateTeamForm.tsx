'use client'

import { useState } from 'react'
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

export function CreateTeamForm() {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setError(null)
    setLoading(true)

    try {
      await request<CreateTeamResponse>('/v1/teams', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
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
      <div>
        <label htmlFor="team-name" className="block text-sm font-medium text-zinc-700">
          Team name
        </label>
        <input
          id="team-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="e.g. FC Barcelona"
          autoFocus
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <Button type="submit" disabled={!name.trim()} loading={loading} className="w-full">
        {loading ? 'Creating…' : 'Create team'}
      </Button>
    </form>
  )
}
