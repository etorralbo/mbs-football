'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { request, UnauthorizedError, ValidationError } from '@/app/_shared/api/httpClient'

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
        <label htmlFor="team-name" className="block text-sm font-medium text-gray-700">
          Team name
        </label>
        <input
          id="team-name"
          type="text"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g. FC Barcelona"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!teamName.trim() || loading}
        className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Saving…' : 'Create team'}
      </button>
    </form>
  )
}
