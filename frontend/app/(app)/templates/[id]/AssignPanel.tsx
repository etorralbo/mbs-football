'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'
import { Button } from '@/app/_shared/components/Button'

interface Athlete {
  athlete_id: string
  display_name: string
}

interface AssignPanelProps {
  templateId: string
}

type Mode = 'team' | 'athletes'

interface AssignmentResult {
  assignment_id: string
  sessions_created: number
}

export function AssignPanel({ templateId }: AssignPanelProps) {
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [mode, setMode] = useState<Mode>('team')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [scheduledFor, setScheduledFor] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showGoToSessions, setShowGoToSessions] = useState(false)

  useEffect(() => {
    request<Athlete[]>('/v1/athletes').then(setAthletes).catch(() => {})
  }, [])

  const selectedCount = selected.size

  function toggleAthlete(athleteId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(athleteId)) {
        next.delete(athleteId)
      } else {
        next.add(athleteId)
      }
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(athletes.map((a) => a.athlete_id)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  async function handleAssign() {
    setError(null)
    setSuccess(null)
    setShowGoToSessions(false)
    setLoading(true)

    try {
      if (mode === 'team') {
        const result = await request<AssignmentResult>('/v1/workout-assignments', {
          method: 'POST',
          body: JSON.stringify({
            workout_template_id: templateId,
            target: { type: 'team' },
            scheduled_for: scheduledFor || null,
          }),
        })
        setScheduledFor('')
        setSuccess(
          `Assigned to whole team — ${result.sessions_created} session${result.sessions_created !== 1 ? 's' : ''} created.`,
        )
        setShowGoToSessions(true)
      } else {
        const athleteIds = [...selected]
        const results = await Promise.allSettled(
          athleteIds.map((athleteId) =>
            request<AssignmentResult>('/v1/workout-assignments', {
              method: 'POST',
              body: JSON.stringify({
                workout_template_id: templateId,
                target: { type: 'athlete', athlete_id: athleteId },
                scheduled_for: scheduledFor || null,
              }),
            }),
          ),
        )

        const successes = results.filter(
          (r): r is PromiseFulfilledResult<AssignmentResult> => r.status === 'fulfilled',
        )
        const successCount = successes.length
        const failCount = results.length - successCount
        const totalSessions = successes.reduce((sum, r) => sum + r.value.sessions_created, 0)

        if (successCount > 0) {
          setScheduledFor('')
          setSelected(new Set())
          setSuccess(
            `Assigned to ${successCount} athlete${successCount !== 1 ? 's' : ''} — ${totalSessions} session${totalSessions !== 1 ? 's' : ''} created.${failCount > 0 ? ` (${failCount} failed)` : ''}`,
          )
          setShowGoToSessions(true)
        } else {
          setError('All assignments failed. Please try again.')
        }
      }
    } catch {
      setError('Could not create assignment. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const canSubmit =
    !loading && (mode === 'team' || (mode === 'athletes' && selectedCount > 0))

  return (
    <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Assign workout</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Create sessions for athletes so they can view and complete this workout.
      </p>

      <div className="mt-4 space-y-4">
        {/* Mode selector */}
        <div>
          <label className="block text-sm font-medium text-zinc-700">Assign to</label>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={() => setMode('team')}
              disabled={loading}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                mode === 'team'
                  ? 'bg-indigo-600 text-white'
                  : 'border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              Whole team
            </button>
            <button
              type="button"
              onClick={() => setMode('athletes')}
              disabled={loading}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                mode === 'athletes'
                  ? 'bg-indigo-600 text-white'
                  : 'border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              Select athletes
            </button>
          </div>
        </div>

        {/* Athlete checklist */}
        {mode === 'athletes' && (
          <div>
            <div className="flex items-center justify-between">
              <span className="block text-sm font-medium text-zinc-700">Athletes</span>
              {athletes.length > 0 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-zinc-300">·</span>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-xs text-zinc-500 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {athletes.length === 0 ? (
              <p className="mt-1.5 text-sm text-zinc-400">No athletes on this team yet.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {athletes.map((a) => (
                  <li key={a.athlete_id}>
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(a.athlete_id)}
                        onChange={() => toggleAthlete(a.athlete_id)}
                        disabled={loading}
                        className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-zinc-700">{a.display_name}</span>
                    </label>
                  </li>
                ))}
              </ul>
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
            disabled={loading}
            className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {success && (
          <div>
            <p role="status" className="text-sm text-green-700">
              {success}
            </p>
            {showGoToSessions && (
              <Link
                href="/sessions"
                className="mt-1 inline-block text-xs text-indigo-600 hover:underline"
              >
                Go to sessions →
              </Link>
            )}
          </div>
        )}

        <Button onClick={handleAssign} disabled={!canSubmit} loading={loading}>
          {loading ? 'Assigning…' : 'Assign'}
        </Button>
      </div>
    </div>
  )
}
