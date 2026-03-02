import type { SessionExecution } from '@/app/_shared/api/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionPhase = 'overview' | 'in_progress' | 'completed'

/** Per-set async save status for optimistic UI. */
export type SetSaveStatus = {
  status: 'idle' | 'saving' | 'saved' | 'failed'
  lastError?: string
}

/**
 * Map of `${exerciseId}:${setNumber}` → save status.
 * Only entries that have been explicitly saved (or attempted) appear here;
 * absence means 'idle'.
 */
export type SetStatusMap = Record<string, SetSaveStatus>

/** Canonical key for the per-set status map. */
export function setKey(exerciseId: string, setNumber: number): string {
  return `${exerciseId}:${setNumber}`
}

export type AthleteSetDraft = {
  actualReps: string
  actualLoad: string
  actualRpe: string
  note: string
  done: boolean
}

/** Record<exerciseId, Record<setNumber (1-based), AthleteSetDraft>> */
export type AthleteDraft = Record<string, Record<number, AthleteSetDraft>>

/** One block's snapshot: key, name, order, and ordered exercise IDs. */
export interface BlockSnapshot {
  key: string
  name: string
  order: number
  exerciseIds: string[]
}

export interface AthleteSessionState {
  phase: SessionPhase
  currentBlockIdx: number
  /** Ordered list of blocks — each block holds its ordered exercise IDs. */
  blocks: BlockSnapshot[]
  draft: AthleteDraft
  /** Per-set async save statuses for optimistic UI. Absence = idle. */
  setStatuses: SetStatusMap
}

export type AthleteAction =
  | { type: 'HYDRATE'; execution: SessionExecution }
  | {
      type: 'RESTORE_DRAFT'
      restoredDraft: AthleteDraft
      phase: SessionPhase
      currentBlockIdx: number
    }
  | {
      type: 'SET_SAVE_STATUS'
      exerciseId: string
      setNumber: number
      status: SetSaveStatus
    }
  | { type: 'CLEAR_SET_STATUSES'; exerciseId: string }
  | { type: 'START' }
  | { type: 'NEXT_BLOCK' }
  | { type: 'PREV_BLOCK' }
  | {
      type: 'UPDATE_SET'
      exerciseId: string
      setNumber: number
      field: keyof Omit<AthleteSetDraft, 'done'>
      value: string
    }
  | { type: 'ADD_SET'; exerciseId: string }
  | { type: 'MARK_BLOCK_DONE'; blockKey: string }
  | { type: 'COMPLETE' }

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function buildInitialDraft(execution: SessionExecution): {
  draft: AthleteDraft
  blocks: BlockSnapshot[]
} {
  const draft: AthleteDraft = {}
  const blocks: BlockSnapshot[] = []

  for (const block of execution.blocks) {
    const exerciseIds: string[] = []

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

    blocks.push({ key: block.key, name: block.name, order: block.order, exerciseIds })
  }

  return { draft, blocks }
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export const initialAthleteState: AthleteSessionState = {
  phase: 'overview',
  currentBlockIdx: 0,
  blocks: [],
  draft: {},
  setStatuses: {},
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
      const { draft, blocks } = buildInitialDraft(action.execution)
      return { phase: 'overview', currentBlockIdx: 0, blocks, draft, setStatuses: {} }
    }

    case 'SET_SAVE_STATUS': {
      const key = setKey(action.exerciseId, action.setNumber)
      return {
        ...state,
        setStatuses: { ...state.setStatuses, [key]: action.status },
      }
    }

    case 'CLEAR_SET_STATUSES': {
      // Remove all status entries for the given exercise.
      const prefix = `${action.exerciseId}:`
      const updated: SetStatusMap = {}
      for (const [k, v] of Object.entries(state.setStatuses)) {
        if (!k.startsWith(prefix)) updated[k] = v
      }
      return { ...state, setStatuses: updated }
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
        currentBlockIdx: action.currentBlockIdx,
      }
    }

    case 'START':
      return { ...state, phase: 'in_progress', currentBlockIdx: 0 }

    case 'NEXT_BLOCK': {
      const next = state.currentBlockIdx + 1
      if (next >= state.blocks.length) {
        return { ...state, phase: 'completed' }
      }
      return { ...state, currentBlockIdx: next }
    }

    case 'PREV_BLOCK':
      return {
        ...state,
        currentBlockIdx: Math.max(0, state.currentBlockIdx - 1),
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

    case 'MARK_BLOCK_DONE': {
      const block = state.blocks.find((b) => b.key === action.blockKey)
      if (!block) return state

      const updatedDraft: AthleteDraft = { ...state.draft }
      for (const exerciseId of block.exerciseIds) {
        const exerciseSets = state.draft[exerciseId] ?? {}
        updatedDraft[exerciseId] = Object.fromEntries(
          Object.entries(exerciseSets).map(([setNum, s]) => [
            setNum,
            { ...s, done: true },
          ]),
        )
      }
      return { ...state, draft: updatedDraft }
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
  totalBlocks: number
  blockProgressPct: number
} {
  const allExerciseIds = state.blocks.flatMap((b) => b.exerciseIds)
  const total = allExerciseIds.length
  const completed = allExerciseIds.filter((id) => {
    const sets = Object.values(state.draft[id] ?? {})
    return sets.length > 0 && sets.every((s) => s.done)
  }).length

  const totalBlocks = state.blocks.length
  const completedBlocks = state.blocks.filter((b) =>
    b.exerciseIds.every((id) => {
      const sets = Object.values(state.draft[id] ?? {})
      return sets.length > 0 && sets.every((s) => s.done)
    }),
  ).length

  return {
    completedCount: completed,
    totalCount: total,
    progressPct: total > 0 ? Math.round((completed / total) * 100) : 0,
    totalBlocks,
    blockProgressPct: totalBlocks > 0 ? Math.round((completedBlocks / totalBlocks) * 100) : 0,
  }
}
