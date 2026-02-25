'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { AddLogForm } from './AddLogForm'
import type { WorkoutSessionDetail } from '@/app/_shared/api/types'

export default function SessionDetailPage() {
  const { id } = useParams() as { id: string }
  const [session, setSession] = useState<WorkoutSessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [completing, setCompleting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    request<WorkoutSessionDetail>(`/v1/workout-sessions/${id}`)
      .then(setSession)
      .catch((err: unknown) => {
        try {
          handleApiError(err, router)
        } catch {
          setNotFound(true)
        }
      })
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleComplete() {
    if (!session || session.status === 'completed') return

    // Optimistic update — flip UI before the request resolves
    setSession((s) => (s ? { ...s, status: 'completed' } : s))
    setCompleting(true)

    try {
      await request(`/v1/workout-sessions/${id}/complete`, { method: 'PATCH' })
    } catch (err: unknown) {
      // Revert on failure
      setSession((s) => (s ? { ...s, status: 'pending' } : s))
      try {
        handleApiError(err, router)
      } catch {
        // Non-redirectable error; stay on page (could show a toast here)
      }
    } finally {
      setCompleting(false)
    }
  }

  function refreshSession() {
    request<WorkoutSessionDetail>(`/v1/workout-sessions/${id}`)
      .then(setSession)
      .catch(() => {})
  }

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>
  if (notFound || !session) return <p className="text-sm text-gray-500">Session not found.</p>

  const isCompleted = session.status === 'completed'

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Session</h1>
          <p className="mt-1 text-sm text-gray-500">
            Status:{' '}
            <span
              className={
                isCompleted ? 'font-medium text-green-600' : 'font-medium text-yellow-600'
              }
            >
              {isCompleted ? 'Completed' : 'Pending'}
            </span>
          </p>
          {session.scheduled_for && (
            <p className="mt-1 text-sm text-gray-500">
              Scheduled: {session.scheduled_for}
            </p>
          )}
        </div>

        {!isCompleted && (
          <button
            onClick={handleComplete}
            disabled={completing}
            className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {completing ? 'Completing…' : 'Complete session'}
          </button>
        )}
      </div>

      {/* Logs */}
      {session.logs.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">Exercise Logs</h2>
          <div className="mt-4 space-y-6">
            {session.logs.map((log) => (
              <section key={log.log_id} className="rounded border border-gray-200 p-4">
                <h3 className="font-medium text-gray-900">{log.block_name}</h3>
                <p className="text-sm text-gray-500">
                  Exercise: {log.exercise_id.slice(0, 8)}…
                </p>
                {log.notes && (
                  <p className="mt-1 text-sm text-gray-500">{log.notes}</p>
                )}
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500">
                      <th className="pr-4 font-medium">Set</th>
                      <th className="pr-4 font-medium">Reps</th>
                      <th className="pr-4 font-medium">Weight</th>
                      <th className="font-medium">RPE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.entries.map((entry) => (
                      <tr key={entry.set_number} className="border-t border-gray-100">
                        <td className="py-1 pr-4">{entry.set_number}</td>
                        <td className="py-1 pr-4">{entry.reps ?? '—'}</td>
                        <td className="py-1 pr-4">{entry.weight ?? '—'}</td>
                        <td className="py-1">{entry.rpe ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        </div>
      )}

      {/* Add log form — only when session is still pending */}
      {!isCompleted && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">Add Exercise Log</h2>
          <AddLogForm sessionId={id} onSuccess={refreshSession} />
        </div>
      )}
    </>
  )
}
