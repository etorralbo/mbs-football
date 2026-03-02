import type { SessionExecution } from '@/app/_shared/api/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SetDraft = {
  reps: string     // string for controlled input binding
  weight: string
  rpe: string
  done: boolean    // true = submitted to backend
}

/**
 * Record<exerciseId, Record<setNumber (1-based), SetDraft>>
 *
 * Invariants:
 * - Keys are exercise UUIDs from the execution response.
 * - Inner keys are 1-based set numbers (matching the backend set_number field).
 * - Exercises with no prior logs start with a single empty row at set 1.
 */
export type DraftState = Record<string, Record<number, SetDraft>>

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/** Build initial draft state from an execution response. */
export function draftFromExecution(execution: SessionExecution): DraftState {
  const draft: DraftState = {}

  for (const block of execution.blocks) {
    for (const item of block.items) {
      if (item.logs.length > 0) {
        draft[item.exercise_id] = Object.fromEntries(
          item.logs.map((log) => [
            log.set_number,
            {
              reps: log.reps !== null ? String(log.reps) : '',
              weight: log.weight !== null ? String(log.weight) : '',
              rpe: log.rpe !== null ? String(log.rpe) : '',
              done: true,
            },
          ]),
        )
      } else {
        const p = item.prescription
        const n =
          typeof p.sets === 'number' && p.sets >= 1 ? p.sets : 1
        draft[item.exercise_id] = Object.fromEntries(
          Array.from({ length: n }, (_, i) => [
            i + 1,
            {
              reps:   p.reps   != null ? String(p.reps)   : '',
              weight: p.weight != null ? String(p.weight) : '',
              rpe:    p.rpe    != null ? String(p.rpe)    : '',
              done: false,
            },
          ]),
        )
      }
    }
  }

  return draft
}

/** Compute progress counters from current draft + execution structure. */
export function progressFromDraft(
  execution: SessionExecution,
  draft: DraftState,
): {
  completedExercises: number
  totalExercises: number
  completedSets: number
  totalSets: number
} {
  let totalExercises = 0
  let completedExercises = 0
  let totalSets = 0
  let completedSets = 0

  for (const block of execution.blocks) {
    for (const item of block.items) {
      totalExercises++
      const sets = Object.values(draft[item.exercise_id] ?? {})
      const doneSets = sets.filter((s) => s.done)
      if (doneSets.length > 0) completedExercises++
      totalSets += sets.length
      completedSets += doneSets.length
    }
  }

  return { completedExercises, totalExercises, completedSets, totalSets }
}

/** Returns true if at least one set is marked done (CTA gate). */
export function canMarkCompleted(draft: DraftState): boolean {
  return Object.values(draft).some((sets) =>
    Object.values(sets).some((s) => s.done),
  )
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type DraftAction =
  | { type: 'HYDRATE'; execution: SessionExecution }
  | { type: 'UPDATE_SET'; exerciseId: string; setNumber: number; field: 'reps' | 'weight' | 'rpe'; value: string }
  | { type: 'ADD_SET'; exerciseId: string }
  | { type: 'MARK_DONE'; exerciseId: string }
  | { type: 'UNDO_DONE'; exerciseId: string }

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'HYDRATE':
      return draftFromExecution(action.execution)

    case 'UPDATE_SET': {
      const exerciseSets = state[action.exerciseId] ?? {}
      const currentSet = exerciseSets[action.setNumber] ?? { reps: '', weight: '', rpe: '', done: false }
      return {
        ...state,
        [action.exerciseId]: {
          ...exerciseSets,
          [action.setNumber]: { ...currentSet, [action.field]: action.value },
        },
      }
    }

    case 'ADD_SET': {
      const exerciseSets = state[action.exerciseId] ?? {}
      const nextSetNumber = Math.max(0, ...Object.keys(exerciseSets).map(Number)) + 1
      return {
        ...state,
        [action.exerciseId]: {
          ...exerciseSets,
          [nextSetNumber]: { reps: '', weight: '', rpe: '', done: false },
        },
      }
    }

    case 'MARK_DONE': {
      const exerciseSets = state[action.exerciseId] ?? {}
      const markedSets = Object.fromEntries(
        Object.entries(exerciseSets).map(([setNum, s]) => [setNum, { ...s, done: true }]),
      )
      return { ...state, [action.exerciseId]: markedSets }
    }

    case 'UNDO_DONE': {
      const exerciseSets = state[action.exerciseId] ?? {}
      const unmarkedSets = Object.fromEntries(
        Object.entries(exerciseSets).map(([setNum, s]) => [setNum, { ...s, done: false }]),
      )
      return { ...state, [action.exerciseId]: unmarkedSets }
    }

    default:
      return state
  }
}
