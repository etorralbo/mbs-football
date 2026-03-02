'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import {
  athleteSessionReducer,
  initialAthleteState,
  selectProgress,
} from '@/src/features/athlete/athleteStore'
import {
  getSessionExecution,
  logSets,
  completeSession,
} from '@/src/features/athlete/api'
import { SessionOverview } from '@/src/features/athlete/components/SessionOverview'
import { ExerciseFocus } from '@/src/features/athlete/components/ExerciseFocus'
import { SessionCompleted } from '@/src/features/athlete/components/SessionCompleted'
import type { SessionExecution } from '@/app/_shared/api/types'

function parseOpt(value: string): number | null {
  const n = parseFloat(value)
  return isNaN(n) ? null : n
}

export default function AthleteSessionPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()

  const [execution, setExecution] = useState<SessionExecution | null>(null)
  const [loadStatus, setLoadStatus] = useState<'loading' | 'error' | 'success'>(
    'loading',
  )

  const [state, dispatch] = useReducer(athleteSessionReducer, initialAthleteState)
  const hydratedRef = useRef<string | null>(null)

  // ── Fetch execution
  useEffect(() => {
    getSessionExecution(id)
      .then((data) => {
        setExecution(data)
        setLoadStatus('success')
      })
      .catch((err: unknown) => {
        try {
          handleApiError(err, router)
        } catch {
          setLoadStatus('error')
        }
      })
  }, [id, router])

  // ── Hydrate store once (guard prevents re-hydrate on re-renders)
  useEffect(() => {
    if (execution && hydratedRef.current !== id) {
      hydratedRef.current = id
      dispatch({ type: 'HYDRATE', execution })
      if (execution.status === 'completed') {
        dispatch({ type: 'COMPLETE' })
      }
    }
  })

  // ── Save one exercise's sets and advance cursor
  async function handleLogAndNext(exerciseId: string) {
    const exerciseSets = state.draft[exerciseId] ?? {}
    const entries = Object.entries(exerciseSets)
      .map(([setNum, s]) => ({
        set_number: Number(setNum),
        reps: parseOpt(s.actualReps),
        weight: parseOpt(s.actualLoad),
        rpe: parseOpt(s.actualRpe),
      }))
      .filter((e) => e.reps !== null || e.weight !== null || e.rpe !== null)

    if (entries.length > 0) {
      await logSets(id, { exercise_id: exerciseId, entries })
    }

    dispatch({ type: 'MARK_EXERCISE_DONE', exerciseId })
    dispatch({ type: 'NEXT_EXERCISE' })
  }

  // ── Save last exercise and mark session complete
  async function handleComplete(exerciseId: string) {
    const exerciseSets = state.draft[exerciseId] ?? {}
    const entries = Object.entries(exerciseSets)
      .map(([setNum, s]) => ({
        set_number: Number(setNum),
        reps: parseOpt(s.actualReps),
        weight: parseOpt(s.actualLoad),
        rpe: parseOpt(s.actualRpe),
      }))
      .filter((e) => e.reps !== null || e.weight !== null || e.rpe !== null)

    if (entries.length > 0) {
      await logSets(id, { exercise_id: exerciseId, entries })
    }

    dispatch({ type: 'MARK_EXERCISE_DONE', exerciseId })
    await completeSession(id)
    dispatch({ type: 'COMPLETE' })
  }

  // ── Loading
  if (loadStatus === 'loading') {
    return (
      <div>
        <span className="sr-only">Loading…</span>
        <SkeletonList rows={4} />
      </div>
    )
  }

  if (loadStatus === 'error' || !execution) {
    return (
      <p role="alert" className="text-sm text-zinc-500">
        Session not found.
      </p>
    )
  }

  const progress = selectProgress(state)
  const currentExerciseId = state.exerciseIds[state.currentExerciseIdx]

  function findItem(exerciseId: string) {
    for (const block of execution!.blocks) {
      const item = block.items.find((i) => i.exercise_id === exerciseId)
      if (item) return item
    }
    return null
  }

  // ── Completed phase
  if (state.phase === 'completed') {
    return (
      <SessionCompleted
        title={execution.template_title}
        onGoHome={() => router.push('/athlete')}
      />
    )
  }

  // ── In-progress phase: single-exercise focus view
  if (state.phase === 'in_progress' && currentExerciseId) {
    const item = findItem(currentExerciseId)
    if (!item) return null

    const exerciseSets = state.draft[currentExerciseId] ?? {
      1: { actualReps: '', actualLoad: '', actualRpe: '', note: '', done: false },
    }

    return (
      <>
        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'START' })}
            className="text-sm text-zinc-500 hover:text-zinc-700"
          >
            {execution.template_title}
          </button>
          <span className="text-zinc-300">/</span>
          <span className="text-sm text-zinc-900">{item.exercise_name}</span>
        </div>

        <ExerciseFocus
          item={item}
          exerciseSets={exerciseSets}
          exerciseNumber={state.currentExerciseIdx + 1}
          totalExercises={state.exerciseIds.length}
          progressPct={progress.progressPct}
          dispatch={dispatch}
          onLogAndNext={handleLogAndNext}
          onComplete={handleComplete}
          onBack={() => dispatch({ type: 'PREV_EXERCISE' })}
        />
      </>
    )
  }

  // ── Overview phase (default)
  return (
    <>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2">
        <Link href="/athlete" className="text-sm text-zinc-500 hover:text-zinc-700">
          Home
        </Link>
        <span className="text-zinc-300">/</span>
        <span className="text-sm text-zinc-900">{execution.template_title}</span>
      </div>

      <SessionOverview
        execution={execution}
        onStart={() => dispatch({ type: 'START' })}
      />
    </>
  )
}
