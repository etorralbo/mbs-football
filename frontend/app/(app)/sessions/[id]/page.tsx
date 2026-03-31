'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { request, ConflictError } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { useAuth } from '@/src/shared/auth/AuthContext'
import { useSessionExecution } from '@/src/features/session-execution/useSessionExecution'
import { getSessionExecution } from '@/src/features/session-execution/api'
import {
  draftReducer,
  canMarkCompleted,
  progressFromDraft,
  parseOpt,
} from '@/src/features/session-execution/draftState'
import type { SessionExecution } from '@/app/_shared/api/types'
import { SessionHeader } from './SessionHeader'
import { BlockSection } from './BlockSection'
import { ExerciseCard } from './ExerciseCard'
import { CompletionBar } from './CompletionBar'
import { PrescriptionEditor } from './PrescriptionEditor'
import { SessionExercisePicker } from './SessionExercisePicker'

export default function SessionDetailPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const { role } = useAuth()

  // ── Fetch: execution view (includes title, scheduled_for, blocks + logs)
  const execState = useSessionExecution(id)

  // ── Local draft state (useReducer)
  const [draft, dispatch] = useReducer(draftReducer, {})

  // ── Mutable copy of execution — updated by initial load and structural edits
  const [localExecution, setLocalExecution] = useState<SessionExecution | null>(null)

  // Hydrate draft once execution loads — guard prevents re-hydrating on re-renders
  // and overwriting in-progress user edits.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (execState.status === 'success' && !hydratedRef.current) {
      hydratedRef.current = true
      setLocalExecution(execState.data)
      dispatch({ type: 'HYDRATE', execution: execState.data })
    }
  })

  // ── Coach: session customization state
  const [editMode, setEditMode] = useState(false)
  const [editingExercise, setEditingExercise] = useState<string | null>(null)
  const [pickerForBlock, setPickerForBlock] = useState<number | null>(null)
  const [removeError, setRemoveError] = useState<{ exerciseId: string; message: string } | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)  // exerciseId being removed
  const [refreshError, setRefreshError] = useState(false)

  // Re-fetch execution and re-hydrate draft after structural changes.
  // Throws on network/API failure — callers use safeRefresh for UI error handling.
  async function refreshExecution() {
    const data = await getSessionExecution(id)
    setLocalExecution(data)
    dispatch({ type: 'HYDRATE', execution: data })
  }

  // Wraps refreshExecution with error state so callers stay simple.
  async function safeRefresh() {
    try {
      await refreshExecution()
      setRefreshError(false)
    } catch {
      setRefreshError(true)
    }
  }

  async function handleRemoveExercise(exerciseId: string) {
    setRemoveError(null)
    setRemoving(exerciseId)
    // Step 1: attempt the delete — failure here means the exercise was NOT removed.
    try {
      await request(
        `/v1/workout-sessions/${id}/structure/exercises/${exerciseId}`,
        { method: 'DELETE' },
      )
    } catch (err) {
      if (err instanceof ConflictError) {
        setRemoveError({
          exerciseId,
          message: "This exercise already has athlete logs and can't be removed.",
        })
      } else {
        setRemoveError({ exerciseId, message: 'Failed to remove exercise. Please try again.' })
      }
      setRemoving(null)
      return
    }
    // Step 2: delete succeeded; refresh the local view.
    await safeRefresh()
    setRemoving(null)
  }

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
    if (!localExecution || localExecution.status === 'completed') return

    setCompleteError(null)
    setCompleting(true)

    try {
      // Auto-save all exercises that have non-empty entries before completing.
      // This ensures athlete-entered values are persisted even if individual
      // sets were not explicitly marked "done".
      const savePromises: Promise<unknown>[] = []
      for (const [exerciseId, sets] of Object.entries(draft)) {
        const entries = Object.entries(sets)
          .filter(([, s]) =>
            parseOpt(s.reps) !== null || parseOpt(s.weight) !== null || parseOpt(s.rpe) !== null || s.done
          )
          .map(([setNum, s]) => ({
            set_number: Number(setNum),
            reps: parseOpt(s.reps),
            weight: parseOpt(s.weight),
            rpe: parseOpt(s.rpe),
          }))

        if (entries.length > 0) {
          savePromises.push(
            request(`/v1/workout-sessions/${id}/logs`, {
              method: 'PUT',
              body: JSON.stringify({ exercise_id: exerciseId, entries }),
            }),
          )
        }
      }
      if (savePromises.length > 0) {
        await Promise.all(savePromises)
      }

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
  if (execState.status === 'loading' || (execState.status === 'success' && !localExecution)) {
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

  const execution = localExecution!
  const isCompleted = execution.status === 'completed'
  const isCoach = role === 'COACH'
  const isCustomized = execution.has_session_structure
  const isReadOnly = isCompleted || isCoach
  const progress = progressFromDraft(execution, draft)
  const canComplete = canMarkCompleted(draft) && savingExercises.size === 0

  return (
    <>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/sessions" className="text-xs text-slate-500 hover:text-slate-300">
          Sessions
        </Link>
        <span className="text-xs text-slate-600">/</span>
        <span className="text-xs text-slate-300">{execution.template_title}</span>
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

      {/* Coach: customize controls */}
      {isCoach && !isCompleted && (
        <div className="mt-4">
          <div className="flex items-center gap-3">
            {isCustomized && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4f9cf9]/30 bg-[#4f9cf9]/10 px-2.5 py-1 text-xs font-medium text-[#4f9cf9]">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" clipRule="evenodd" />
                </svg>
                Customized
              </span>
            )}
            <button
              onClick={() => {
                setEditMode((v) => !v)
                setEditingExercise(null)
                setRemoveError(null)
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f9cf9]/50 ${
                editMode
                  ? 'bg-white/10 text-white hover:bg-white/15'
                  : 'bg-[#4f9cf9]/15 text-[#4f9cf9] hover:bg-[#4f9cf9]/25'
              }`}
            >
              {editMode ? 'Done editing' : 'Customize session'}
            </button>
          </div>

          {/* Scoping copy — reassures coach that edits don't touch the template */}
          {editMode && (
            <p className="mt-1.5 text-xs text-slate-500">
              Changes here only affect this athlete&apos;s session.
            </p>
          )}

          {/* Refresh error — shown when a structural edit saved but the page view failed to update */}
          {refreshError && (
            <p role="alert" className="mt-1.5 text-xs text-amber-400">
              Could not refresh session data. Reload the page to see the latest changes.
            </p>
          )}
        </div>
      )}

      {/* Blocks */}
      <div className="mt-8 space-y-8 pb-24">
        {execution.blocks.map((block, blockIndex) => (
          <BlockSection key={block.key} name={block.name}>
            {block.items.map((item) => {
              const exerciseSets = draft[item.exercise_id]
              if (!exerciseSets) return null

              const isEditingThis = editingExercise === item.exercise_id
              const isRemovingThis = removing === item.exercise_id
              const exerciseRemoveError =
                removeError?.exerciseId === item.exercise_id ? removeError.message : null

              return (
                <div key={item.exercise_id} className="space-y-2">
                  <ExerciseCard
                    sessionId={id}
                    item={item}
                    exerciseSets={exerciseSets}
                    isCompleted={isReadOnly}
                    completionEnabled={!isCoach}
                    dispatch={dispatch}
                    onSavingChange={handleSavingChange}
                  />

                  {/* Coach edit controls — only in edit mode, not while editing prescription */}
                  {isCoach && editMode && !isEditingThis && (
                    <div className="flex items-center gap-2 px-1">
                      <button
                        onClick={() => {
                          setEditingExercise(item.exercise_id)
                          setRemoveError(null)
                        }}
                        className="rounded-md px-2.5 py-1 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f9cf9]/50"
                      >
                        Edit prescription
                      </button>
                      <button
                        onClick={() => handleRemoveExercise(item.exercise_id)}
                        disabled={isRemovingThis}
                        className="rounded-md px-2.5 py-1 text-xs text-red-400 transition-colors hover:bg-red-400/10 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 disabled:opacity-40"
                      >
                        {isRemovingThis ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  )}

                  {/* Remove error */}
                  {exerciseRemoveError && (
                    <p role="alert" className="px-1 text-xs text-red-400">
                      {exerciseRemoveError}
                    </p>
                  )}

                  {/* Prescription editor */}
                  {isEditingThis && (
                    <PrescriptionEditor
                      sessionId={id}
                      exerciseId={item.exercise_id}
                      currentPrescription={item.prescription}
                      onSaved={async () => {
                        setEditingExercise(null)
                        await safeRefresh()
                      }}
                      onCancel={() => setEditingExercise(null)}
                    />
                  )}
                </div>
              )
            })}

            {/* Add exercise button — coach edit mode only */}
            {isCoach && editMode && (
              <button
                onClick={() => setPickerForBlock(blockIndex)}
                className="mt-1 flex w-full items-center gap-2 rounded-lg border border-dashed border-white/15 px-4 py-2.5 text-xs text-slate-500 transition-colors hover:border-white/25 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f9cf9]/50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add exercise to {block.name}
              </button>
            )}
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

      {/* Exercise picker drawer — coach add exercise */}
      {pickerForBlock !== null && (
        <SessionExercisePicker
          sessionId={id}
          blockIndex={pickerForBlock}
          blockName={execution.blocks[pickerForBlock]?.name ?? ''}
          onClose={() => setPickerForBlock(null)}
          onExerciseAdded={async () => {
            setPickerForBlock(null)
            await safeRefresh()
          }}
        />
      )}
    </>
  )
}
