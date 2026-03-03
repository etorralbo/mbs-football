'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { useAuth } from '@/src/shared/auth/AuthContext'
import { useSessionExecution } from '@/src/features/session-execution/useSessionExecution'
import {
  draftReducer,
  canMarkCompleted,
  progressFromDraft,
} from '@/src/features/session-execution/draftState'
import { SessionHeader } from './SessionHeader'
import { BlockSection } from './BlockSection'
import { ExerciseCard } from './ExerciseCard'
import { CompletionBar } from './CompletionBar'

export default function SessionDetailPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()

  // ── Fetch: execution view (includes title, scheduled_for, blocks + logs)
  const execState = useSessionExecution(id)

  // ── Local draft state (useReducer)
  const [draft, dispatch] = useReducer(draftReducer, {})

  // Hydrate draft once execution loads — guard prevents re-hydrating on re-renders
  // and overwriting in-progress user edits.
  const hydratedForRef = useRef<string | null>(null)
  useEffect(() => {
    if (execState.status === 'success' && hydratedForRef.current !== id) {
      hydratedForRef.current = id
      dispatch({ type: 'HYDRATE', execution: execState.data })
    }
  })

  // ── Track in-flight saves to gate the CompletionBar
  const [savingExercises, setSavingExercises] = useState(new Set<string>())
  function handleSavingChange(exerciseId: string, isSaving: boolean) {
    setSavingExercises((prev) => {
      const next = new Set(prev)
      if (isSaving) next.add(exerciseId)
      else next.delete(exerciseId)
      return next
    })
  }

  // ── Mark session complete
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)

  async function handleComplete() {
    if (execState.status !== 'success' || execState.data.status === 'completed') return

    setCompleteError(null)
    setCompleting(true)

    try {
      await request(`/v1/workout-sessions/${id}/complete`, { method: 'PATCH' })
      router.push('/sessions')
    } catch (err: unknown) {
      try {
        handleApiError(err, router)
      } catch {
        setCompleteError('Failed to complete session. Please try again.')
      }
    } finally {
      setCompleting(false)
    }
  }

  // ── Loading state
  if (execState.status === 'loading') {
    return (
      <div>
        <span className="sr-only">Loading…</span>
        <SkeletonList rows={4} />
      </div>
    )
  }

  if (execState.status === 'error') {
    return <p className="text-sm text-slate-400">Session not found.</p>
  }

  const execution = execState.data
  const isCompleted = execution.status === 'completed'
  const { role } = useAuth()
  const isCoach = role === 'COACH'
  const isReadOnly = isCompleted
  const progress = progressFromDraft(execution, draft)
  const canComplete = canMarkCompleted(draft) && savingExercises.size === 0

  return (
    <>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/sessions" className="text-sm text-slate-400 hover:text-slate-300">
          Sessions
        </Link>
        <span className="text-slate-600">/</span>
        <span className="text-sm text-white">{execution.template_title}</span>
      </div>

      {/* Header */}
      <div className="mt-4">
        <SessionHeader
          title={execution.template_title}
          status={execution.status}
          scheduledFor={execution.scheduled_for}
          completedExercises={progress.completedExercises}
          totalExercises={progress.totalExercises}
          completedSets={progress.completedSets}
        />
      </div>

      {/* Blocks */}
      <div className="mt-8 space-y-8 pb-24">
        {execution.blocks.map((block) => (
          <BlockSection key={block.key} name={block.name}>
            {block.items.map((item) => (
              <ExerciseCard
                key={item.exercise_id}
                sessionId={id}
                item={item}
                exerciseSets={draft[item.exercise_id] ?? { 1: { reps: '', weight: '', rpe: '', done: false } }}
                isCompleted={isReadOnly}
                completionEnabled={!isCoach}
                dispatch={dispatch}
                onSavingChange={handleSavingChange}
              />
            ))}
          </BlockSection>
        ))}
      </div>

      {/* Sticky completion bar — only for pending sessions viewed by an athlete */}
      {!isReadOnly && !isCoach && (
        <CompletionBar
          completedExercises={progress.completedExercises}
          totalExercises={progress.totalExercises}
          completedSets={progress.completedSets}
          canComplete={canComplete}
          completing={completing}
          completeError={completeError}
          onComplete={handleComplete}
        />
      )}
    </>
  )
}
