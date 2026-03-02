'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { handleApiError } from '@/app/_shared/api/handleApiError'
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
import { normalizeAthleteError } from '@/src/features/athlete/errors'
import { SessionOverview } from '@/src/features/athlete/components/SessionOverview'
import { ExerciseFocus } from '@/src/features/athlete/components/ExerciseFocus'
import { SessionCompleted } from '@/src/features/athlete/components/SessionCompleted'
import { AthleteLoading } from '@/src/features/athlete/components/AthleteLoading'
import { AthleteError } from '@/src/features/athlete/components/AthleteError'
import type { SessionExecution } from '@/app/_shared/api/types'

type LoadState = 'loading' | 'error' | 'success'

function parseOpt(value: string): number | null {
  const n = parseFloat(value)
  return isNaN(n) ? null : n
}

export default function AthleteSessionPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  // "Latest ref" pattern: keeps a current router reference inside effects
  // without adding router to the dep-array (which could cause spurious re-fetches).
  const routerRef = useRef(router)
  routerRef.current = router

  const [execution, setExecution] = useState<SessionExecution | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [canRetry, setCanRetry] = useState(true)
  const [retryKey, setRetryKey] = useState(0)

  const [state, dispatch] = useReducer(athleteSessionReducer, initialAthleteState)
  // Stores the session_id of the last successfully hydrated store.
  // Using session_id (not the URL param `id`) guards against stale execution state
  // when `id` changes before the new fetch resolves.
  const hydratedSessionRef = useRef<string | null>(null)

  // ── Fetch execution.
  // Re-runs when `id` changes (navigation) or `retryKey` increments (retry).
  // Clearing `execution` to null on start prevents the hydration effect from
  // applying stale data before the new response arrives.
  useEffect(() => {
    const ac = new AbortController()

    setLoadState('loading')
    setErrorMessage(null)
    setCanRetry(true)
    setExecution(null) // clear stale data; blocks hydration effect until new data arrives

    getSessionExecution(id, ac.signal)
      .then((data) => {
        setExecution(data)
        setLoadState('success')
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return
        try {
          handleApiError(err, routerRef.current)
        } catch (e: unknown) {
          const { message, forbidden, notFound } = normalizeAthleteError(e)
          setErrorMessage(message)
          setCanRetry(!forbidden && !notFound)
          setLoadState('error')
        }
      })

    return () => ac.abort()
  }, [id, retryKey]) // router intentionally excluded — stable ref, routerRef handles it

  // ── Hydrate store once per session.
  // Triple-guard:
  //   1. `execution` is null until fetch resolves → no-op during loading.
  //   2. `execution.session_id === id` → prevents applying data from a previous
  //      session if state updates arrive out of order.
  //   3. `hydratedSessionRef` → prevents re-hydrating on every re-render after success.
  useEffect(() => {
    if (
      execution &&
      execution.session_id === id &&
      hydratedSessionRef.current !== id
    ) {
      hydratedSessionRef.current = id
      dispatch({ type: 'HYDRATE', execution })
      if (execution.status === 'completed') {
        dispatch({ type: 'COMPLETE' })
      }
    }
  })

  const handleRetry = useCallback(() => setRetryKey((k) => k + 1), [])
  const handleGoHome = useCallback(() => routerRef.current.push('/athlete'), [])

  // ── Save one exercise's sets then advance the cursor
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

  // ── Save the last exercise then mark the session complete
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

  // ── Loading skeleton (shape-matched to SessionOverview)
  if (loadState === 'loading') {
    return <AthleteLoading variant="session" />
  }

  // ── Error with retry + back-to-home
  if (loadState === 'error' || !execution) {
    return (
      <AthleteError
        message={
          errorMessage ??
          "We couldn't load this session. Check your connection and try again."
        }
        onRetry={canRetry ? handleRetry : undefined}
        onBack={handleGoHome}
        backLabel="Back to home"
      />
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
        onGoHome={handleGoHome}
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
      <section aria-live="polite" aria-label="Exercise progress">
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
      </section>
    )
  }

  // ── Overview phase (default)
  return (
    <section aria-live="polite" aria-label="Session overview">
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
    </section>
  )
}
