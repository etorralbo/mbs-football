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

/** Extract the prescribed set count and per-set defaults from a prescription. */
function parsePrescribedSets(p: Record<string, unknown>): Array<{ reps: string; weight: string; rpe: string }> {
  if (Array.isArray(p.sets) && p.sets.length > 0) {
    return p.sets.map((s: Record<string, unknown>) => ({
      reps:   s.reps   != null ? String(s.reps)   : '',
      weight: s.weight != null ? String(s.weight) : '',
      rpe:    s.rpe    != null ? String(s.rpe)    : '',
    }))
  }
  // Legacy format: sets as a count number, or missing
  const n = typeof p.sets === 'number' && p.sets >= 1 ? p.sets : 1
  return Array.from({ length: n }, () => ({
    reps:   p.reps   != null ? String(p.reps)   : '',
    weight: p.weight != null ? String(p.weight) : '',
    rpe:    p.rpe    != null ? String(p.rpe)    : '',
  }))
}

/**
 * Build initial draft state from an execution response.
 *
 * Prescribed sets are the **single source of truth** for row count.
 * Logs are merged as overrides: a logged value takes precedence over the
 * prescribed default, but extra logs beyond the prescribed count are
 * discarded (they come from legacy "Add set" usage).
 */
export function draftFromExecution(execution: SessionExecution): DraftState {
  const draft: DraftState = {}

  for (const block of execution.blocks) {
    for (const item of block.items) {
      const prescribed = parsePrescribedSets(item.prescription)

      // Index logs by 1-based set_number for O(1) lookup
      const logBySetNumber = new Map(
        item.logs.map((log) => [log.set_number, log]),
      )

      draft[item.exercise_id] = Object.fromEntries(
        prescribed.map((defaults, i) => {
          const setNumber = i + 1
          const log = logBySetNumber.get(setNumber)

          if (log) {
            return [
              setNumber,
              {
                reps:   log.reps   !== null ? String(log.reps)   : defaults.reps,
                weight: log.weight !== null ? String(log.weight) : defaults.weight,
                rpe:    log.rpe    !== null ? String(log.rpe)    : defaults.rpe,
                done: true,
              },
            ]
          }

          return [setNumber, { ...defaults, done: false }]
        }),
      )
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

/**
 * Completion CTA is always available for athletes.
 *
 * Athletes may need to mark a session complete even when they could not
 * perform some (or all) prescribed work.
 */
export function canMarkCompleted(_draft: DraftState): boolean {
  return true
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
  | { type: 'MARK_SET_DONE'; exerciseId: string; setNumber: number }
  | { type: 'UNDO_SET_DONE'; exerciseId: string; setNumber: number }

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

    case 'MARK_SET_DONE': {
      const exerciseSets = state[action.exerciseId] ?? {}
      const current = exerciseSets[action.setNumber]
      if (!current) return state
      return {
        ...state,
        [action.exerciseId]: { ...exerciseSets, [action.setNumber]: { ...current, done: true } },
      }
    }

    case 'UNDO_SET_DONE': {
      const exerciseSets = state[action.exerciseId] ?? {}
      const current = exerciseSets[action.setNumber]
      if (!current) return state
      return {
        ...state,
        [action.exerciseId]: { ...exerciseSets, [action.setNumber]: { ...current, done: false } },
      }
    }

    default:
      return state
  }
}
