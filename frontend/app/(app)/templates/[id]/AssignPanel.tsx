'use client'

import { useEffect, useState } from 'react'
import { request } from '@/app/_shared/api/httpClient'
import { Button } from '@/app/_shared/components/Button'

interface Athlete {
  id: string
  name: string
}

interface AssignPanelProps {
  templateId: string
}

export function AssignPanel({ templateId }: AssignPanelProps) {
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [targetType, setTargetType] = useState<'team' | 'athlete'>('team')
  const [athleteId, setAthleteId] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    request<Athlete[]>('/v1/athletes').then(setAthletes).catch(() => {})
  }, [])

  async function handleAssign() {
    setError(null)
    setSuccess(null)
    setLoading(true)

    const target =
      targetType === 'team'
        ? { type: 'team' as const }
        : { type: 'athlete' as const, athlete_id: athleteId }

    try {
      const result = await request<{ assignment_id: string; sessions_created: number }>(
        '/v1/workout-assignments',
        {
          method: 'POST',
          body: JSON.stringify({
            workout_template_id: templateId,
            target,
            scheduled_for: scheduledFor || null,
          }),
        },
      )
      setSuccess(
        `Assigned! ${result.sessions_created} session${result.sessions_created !== 1 ? 's' : ''} created.`,
      )
      setAthleteId('')
      setScheduledFor('')
    } catch {
      setError('Could not create assignment. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const canSubmit =
    !loading && (targetType === 'team' || (targetType === 'athlete' && athleteId !== ''))

  return (
    <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Assign workout</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Create sessions for athletes so they can view and complete this workout.
      </p>

      <div className="mt-4 space-y-4">
        {/* Target */}
        <div>
          <label className="block text-sm font-medium text-zinc-700">Assign to</label>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={() => setTargetType('team')}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                targetType === 'team'
                  ? 'bg-indigo-600 text-white'
                  : 'border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              Whole team
            </button>
            <button
              type="button"
              onClick={() => setTargetType('athlete')}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                targetType === 'athlete'
                  ? 'bg-indigo-600 text-white'
                  : 'border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              Specific athlete
            </button>
          </div>
        </div>

        {/* Athlete picker */}
        {targetType === 'athlete' && (
          <div>
            <label htmlFor="athlete-select" className="block text-sm font-medium text-zinc-700">
              Athlete
            </label>
            {athletes.length === 0 ? (
              <p className="mt-1.5 text-sm text-zinc-400">No athletes on this team yet.</p>
            ) : (
              <select
                id="athlete-select"
                value={athleteId}
                onChange={(e) => setAthleteId(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Select an athlete…</option>
                {athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Scheduled date (optional) */}
        <div>
          <label htmlFor="scheduled-for" className="block text-sm font-medium text-zinc-700">
            Scheduled date{' '}
            <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <input
            id="scheduled-for"
            type="date"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {success && <p role="status" className="text-sm text-green-700">{success}</p>}

        <Button onClick={handleAssign} disabled={!canSubmit} loading={loading}>
          {loading ? 'Assigning…' : 'Assign'}
        </Button>
      </div>
    </div>
  )
}
