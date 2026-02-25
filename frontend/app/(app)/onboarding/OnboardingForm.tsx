'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { request, UnauthorizedError, ValidationError } from '@/app/_shared/api/httpClient'
import { Button } from '@/app/_shared/components/Button'

export function OnboardingForm() {
  const [teamName, setTeamName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = teamName.trim()
    if (!trimmed) return

    setError(null)
    setLoading(true)

    try {
      await request('/v1/onboarding', {
        method: 'POST',
        body: JSON.stringify({ team_name: trimmed }),
      })
      router.push('/templates')
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        router.replace('/login')
      } else if (err instanceof ValidationError) {
        setError(
          typeof err.detail === 'string' ? err.detail : 'Please check the team name.',
        )
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
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="e.g. FC Barcelona"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <Button type="submit" disabled={!teamName.trim()} loading={loading} className="w-full">
        {loading ? 'Saving…' : 'Create team'}
      </Button>
    </form>
  )
}
