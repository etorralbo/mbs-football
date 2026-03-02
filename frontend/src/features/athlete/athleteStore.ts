import type { SessionExecution } from '@/app/_shared/api/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionPhase = 'overview' | 'in_progress' | 'completed'

export type AthleteSetDraft = {
  actualReps: string
  actualLoad: string
  actualRpe: string
  note: string
  done: boolean
}

/** Record<exerciseId, Record<setNumber (1-based), AthleteSetDraft>> */
export type AthleteDraft = Record<string, Record<number, AthleteSetDraft>>

export interface AthleteSessionState {
  phase: SessionPhase
  currentExerciseIdx: number
  /** Ordered list of exercise IDs across all blocks — navigation cursor */
  exerciseIds: string[]
  draft: AthleteDraft
}

export type AthleteAction =
  | { type: 'HYDRATE'; execution: SessionExecution }
  | {
      type: 'RESTORE_DRAFT'
      restoredDraft: AthleteDraft
      phase: SessionPhase
      currentExerciseIdx: number
    }
  | { type: 'START' }
  | { type: 'NEXT_EXERCISE' }
  | { type: 'PREV_EXERCISE' }
  | {
      type: 'UPDATE_SET'
      exerciseId: string
      setNumber: number
      field: keyof Omit<AthleteSetDraft, 'done'>
      value: string
    }
  | { type: 'ADD_SET'; exerciseId: string }
  | { type: 'MARK_EXERCISE_DONE'; exerciseId: string }
  | { type: 'COMPLETE' }

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function buildInitialDraft(execution: SessionExecution): {
  draft: AthleteDraft
  exerciseIds: string[]
} {
  const draft: AthleteDraft = {}
  const exerciseIds: string[] = []

  for (const block of execution.blocks) {
    for (const item of block.items) {
      exerciseIds.push(item.exercise_id)

      if (item.logs.length > 0) {
        draft[item.exercise_id] = Object.fromEntries(
          item.logs.map((log) => [
            log.set_number,
            {
              actualReps: log.reps !== null ? String(log.reps) : '',
              actualLoad: log.weight !== null ? String(log.weight) : '',
              actualRpe: log.rpe !== null ? String(log.rpe) : '',
              note: '',
              done: true,
            },
          ]),
        )
      } else {
        draft[item.exercise_id] = {
          1: { actualReps: '', actualLoad: '', actualRpe: '', note: '', done: false },
        }
      }
    }
  }

  return { draft, exerciseIds }
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export const initialAthleteState: AthleteSessionState = {
  phase: 'overview',
  currentExerciseIdx: 0,
  exerciseIds: [],
  draft: {},
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function athleteSessionReducer(
  state: AthleteSessionState,
  action: AthleteAction,
): AthleteSessionState {
  switch (action.type) {
    case 'HYDRATE': {
      const { draft, exerciseIds } = buildInitialDraft(action.execution)
      return { phase: 'overview', currentExerciseIdx: 0, exerciseIds, draft }
    }

    case 'RESTORE_DRAFT': {
      // Merge local draft over server draft, but skip exercises already done on server.
      const merged: AthleteDraft = { ...state.draft }
      for (const [exerciseId, localSets] of Object.entries(action.restoredDraft)) {
        const serverSets = Object.values(state.draft[exerciseId] ?? {})
        const alreadyDone =
          serverSets.length > 0 && serverSets.every((s) => s.done)
        if (!alreadyDone) {
          merged[exerciseId] = localSets
        }
      }
      return {
        ...state,
        draft: merged,
        phase: action.phase,
        currentExerciseIdx: action.currentExerciseIdx,
      }
    }

    case 'START':
      return { ...state, phase: 'in_progress', currentExerciseIdx: 0 }

    case 'NEXT_EXERCISE': {
      const nextIdx = state.currentExerciseIdx + 1
      if (nextIdx >= state.exerciseIds.length) {
        return { ...state, phase: 'completed' }
      }
      return { ...state, currentExerciseIdx: nextIdx }
    }

    case 'PREV_EXERCISE':
      return {
        ...state,
        currentExerciseIdx: Math.max(0, state.currentExerciseIdx - 1),
      }

    case 'UPDATE_SET': {
      const exerciseSets = state.draft[action.exerciseId] ?? {}
      const current = exerciseSets[action.setNumber] ?? {
        actualReps: '',
        actualLoad: '',
        actualRpe: '',
        note: '',
        done: false,
      }
      return {
        ...state,
        draft: {
          ...state.draft,
          [action.exerciseId]: {
            ...exerciseSets,
            [action.setNumber]: { ...current, [action.field]: action.value },
          },
        },
      }
    }

    case 'ADD_SET': {
      const exerciseSets = state.draft[action.exerciseId] ?? {}
      const nextSetNumber =
        Math.max(0, ...Object.keys(exerciseSets).map(Number)) + 1
      return {
        ...state,
        draft: {
          ...state.draft,
          [action.exerciseId]: {
            ...exerciseSets,
            [nextSetNumber]: {
              actualReps: '',
              actualLoad: '',
              actualRpe: '',
              note: '',
              done: false,
            },
          },
        },
      }
    }

    case 'MARK_EXERCISE_DONE': {
      const exerciseSets = state.draft[action.exerciseId] ?? {}
      const markedSets = Object.fromEntries(
        Object.entries(exerciseSets).map(([setNum, s]) => [
          setNum,
          { ...s, done: true },
        ]),
      )
      return {
        ...state,
        draft: { ...state.draft, [action.exerciseId]: markedSets },
      }
    }

    case 'COMPLETE':
      return { ...state, phase: 'completed' }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function selectProgress(state: AthleteSessionState): {
  completedCount: number
  totalCount: number
  progressPct: number
} {
  const total = state.exerciseIds.length
  const completed = state.exerciseIds.filter((id) => {
    const sets = Object.values(state.draft[id] ?? {})
    return sets.length > 0 && sets.every((s) => s.done)
  }).length

  return {
    completedCount: completed,
    totalCount: total,
    progressPct: total > 0 ? Math.round((completed / total) * 100) : 0,
  }
}
