'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { Badge } from '@/app/_shared/components/Badge'
import { Button } from '@/app/_shared/components/Button'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { AddLogForm } from './AddLogForm'
import type { WorkoutSessionDetail } from '@/app/_shared/api/types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

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
        // Non-redirectable error; stay on page
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

  if (loading)
    return (
      <div>
        <span className="sr-only">Loading…</span>
        <SkeletonList rows={4} />
      </div>
    )

  if (notFound || !session)
    return <p className="text-sm text-zinc-500">Session not found.</p>

  const isCompleted = session.status === 'completed'

  return (
    <>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/sessions" className="text-sm text-zinc-500 hover:text-zinc-700">
          Sessions
        </Link>
        <span className="text-zinc-300">/</span>
        <span className="text-sm text-zinc-900">{session.template_title}</span>
      </div>

      {/* Header */}
      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">{session.template_title}</h1>
          <div className="mt-2 flex items-center gap-3">
            <Badge variant={isCompleted ? 'completed' : 'pending'}>
              {isCompleted ? 'Completed' : 'Pending'}
            </Badge>
            {session.scheduled_for && (
              <span className="text-sm text-zinc-500">{formatDate(session.scheduled_for)}</span>
            )}
          </div>
        </div>

        {!isCompleted && (
          <Button
            variant="secondary"
            onClick={handleComplete}
            loading={completing}
          >
            {completing ? 'Completing…' : 'Complete session'}
          </Button>
        )}
      </div>

      {/* Logs */}
      {session.logs.length > 0 && (
        <div className="mt-8">
          <h2 className="text-base font-semibold text-zinc-900">Exercise Logs</h2>
          <div className="mt-4 space-y-4">
            {session.logs.map((log) => (
              <section key={log.log_id} className="rounded-lg border border-zinc-200 bg-white p-4">
                <h3 className="text-sm font-medium text-zinc-900">{log.block_name}</h3>
                {log.notes && (
                  <p className="mt-1 text-sm text-zinc-500">{log.notes}</p>
                )}
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-zinc-400">
                      <th className="pb-1.5 pr-4 font-medium">Set</th>
                      <th className="pb-1.5 pr-4 font-medium">Reps</th>
                      <th className="pb-1.5 pr-4 font-medium">Weight</th>
                      <th className="pb-1.5 font-medium">RPE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.entries.map((entry) => (
                      <tr key={entry.set_number} className="border-t border-zinc-100">
                        <td className="py-1.5 pr-4 text-zinc-700">{entry.set_number}</td>
                        <td className="py-1.5 pr-4 text-zinc-700">{entry.reps ?? '—'}</td>
                        <td className="py-1.5 pr-4 text-zinc-700">{entry.weight ?? '—'}</td>
                        <td className="py-1.5 text-zinc-700">{entry.rpe ?? '—'}</td>
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
          <h2 className="text-base font-semibold text-zinc-900">Add Exercise Log</h2>
          <AddLogForm sessionId={id} onSuccess={refreshSession} />
        </div>
      )}
    </>
  )
}
