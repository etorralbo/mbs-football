'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'

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
  const [scheduledFor, setScheduledFor] = useState(() =>
    new Date().toLocaleDateString('en-CA'),
  )
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
        setScheduledFor(new Date().toLocaleDateString('en-CA'))
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
          setScheduledFor(new Date().toLocaleDateString('en-CA'))
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

  const teamCount = athletes.length
  const isTeamEmpty = teamCount === 0
  const canSubmit =
    !loading &&
    (mode === 'team' ? !isTeamEmpty : selectedCount > 0)

  const targetCount = mode === 'team' ? teamCount : selectedCount

  function getButtonLabel(): string {
    if (loading) return 'Assigning…'
    if (mode === 'athletes' && selectedCount === 0) return 'Select athletes to assign'
    if (targetCount === 0) return 'Assign workout'
    return `Assign workout to ${targetCount} athlete${targetCount !== 1 ? 's' : ''}`
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">
        Create sessions for athletes so they can view and complete this workout.
      </p>

      {/* Mode selector */}
      <div className="space-y-3">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Assign to
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('team')}
            disabled={loading}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              mode === 'team'
                ? 'bg-[#137fec] text-white'
                : 'border border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            Whole team
          </button>
          <button
            type="button"
            onClick={() => setMode('athletes')}
            disabled={loading}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              mode === 'athletes'
                ? 'bg-[#137fec] text-white'
                : 'border border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            Select athletes
          </button>
        </div>
      </div>

      {/* Scheduled date */}
      <div className="space-y-3">
        <label htmlFor="scheduled-for" className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Scheduled date{' '}
          <span className="font-normal normal-case text-slate-500">(optional)</span>
        </label>
        <input
          id="scheduled-for"
          type="date"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
          disabled={loading}
          className="w-full rounded-lg border-none bg-[#1a2938] px-4 py-2.5 text-sm font-medium text-white [color-scheme:dark] focus:ring-1 focus:ring-[#137fec] disabled:opacity-50"
        />
      </div>

      {/* Empty team warning */}
      {mode === 'team' && isTeamEmpty && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
          <p className="text-sm text-slate-400">No athletes in your team yet.</p>
          <p className="mt-0.5 text-xs text-slate-500">Add athletes to start assigning workouts.</p>
          <Link
            href="/team"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#137fec] hover:underline"
          >
            Go to Team
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}

      {/* Athlete checklist */}
      {mode === 'athletes' && (
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Athletes</span>
            {athletes.length > 0 && (
              <div className="flex gap-2">
                <button type="button" onClick={selectAll} className="text-xs text-[#137fec] hover:underline">
                  Select all
                </button>
                <span className="text-slate-600">·</span>
                <button type="button" onClick={clearSelection} className="text-xs text-slate-400 hover:underline">
                  Clear
                </button>
              </div>
            )}
          </div>

          {athletes.length === 0 ? (
            <p className="mt-1.5 text-sm text-slate-500">No athletes on this team yet.</p>
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
                      className="h-4 w-4 rounded border-white/20 accent-[#137fec] focus:ring-[#137fec]"
                    />
                    <span className="text-sm text-white">{a.display_name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">{error}</p>
      )}

      {success && (
        <div>
          <p role="status" className="text-sm text-emerald-400">{success}</p>
          {showGoToSessions && (
            <Link href="/sessions" className="mt-1 inline-block text-xs text-[#137fec] hover:underline">
              Go to sessions →
            </Link>
          )}
        </div>
      )}

      <div className="space-y-2">
        <button
          onClick={handleAssign}
          disabled={!canSubmit}
          className="w-full rounded-lg bg-[#c8f135] px-6 py-2.5 text-sm font-bold text-[#0a0d14] transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {getButtonLabel()}
        </button>
        {canSubmit && (
          <p className="text-center text-xs text-slate-500">
            {targetCount} workout session{targetCount !== 1 ? 's' : ''} will be created
          </p>
        )}
      </div>
    </div>
  )
}
