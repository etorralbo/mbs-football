import { describe, it, expect } from 'vitest'
import {
  draftFromExecution,
  draftReducer,
  progressFromDraft,
  canMarkCompleted,
} from './draftState'
import type { SessionExecution } from '@/app/_shared/api/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EXECUTION_EMPTY: SessionExecution = {
  session_id: 'sess-1',
  status: 'pending',
  workout_template_id: 'tpl-1',
  template_title: 'Sprint Power',
  athlete_profile_id: 'ath-1',
  scheduled_for: null,
  blocks: [
    {
      name: 'Primary Strength',
      key: 'PRIMARY_STRENGTH',
      order: 0,
      items: [
        { exercise_id: 'ex-1', exercise_name: 'Squat', prescription: {}, logs: [] },
        { exercise_id: 'ex-2', exercise_name: 'Deadlift', prescription: {}, logs: [] },
      ],
    },
    {
      name: 'Recovery',
      key: 'RECOVERY',
      order: 1,
      items: [
        { exercise_id: 'ex-3', exercise_name: 'Stretch', prescription: { duration: '60s' }, logs: [] },
      ],
    },
  ],
}

const EXECUTION_WITH_PRESCRIPTION: SessionExecution = {
  ...EXECUTION_EMPTY,
  blocks: [
    {
      name: 'Primary Strength',
      key: 'PRIMARY_STRENGTH',
      order: 0,
      items: [
        {
          exercise_id: 'ex-1',
          exercise_name: 'Squat',
          prescription: { sets: 3, reps: 8, weight: 100, rpe: 8 },
          logs: [],
        },
        {
          exercise_id: 'ex-2',
          exercise_name: 'Deadlift',
          prescription: { sets: 0 },
          logs: [],
        },
      ],
    },
    {
      name: 'Recovery',
      key: 'RECOVERY',
      order: 1,
      items: [
        {
          exercise_id: 'ex-3',
          exercise_name: 'Stretch',
          prescription: { sets: 2, reps: 12 },   // weight/rpe absent
          logs: [],
        },
      ],
    },
  ],
}

/** Array-format sets (post-migration): prescription.sets is an array of set objects. */
const EXECUTION_ARRAY_SETS: SessionExecution = {
  ...EXECUTION_EMPTY,
  blocks: [
    {
      name: 'Primary Strength',
      key: 'PRIMARY_STRENGTH',
      order: 0,
      items: [
        {
          exercise_id: 'ex-1',
          exercise_name: 'Squat',
          prescription: {
            sets: [
              { order: 0, reps: 10, weight: 80, rpe: 7 },
              { order: 1, reps: 8, weight: 90, rpe: 8 },
              { order: 2, reps: 6, weight: 100, rpe: 9 },
            ],
          },
          logs: [],
        },
      ],
    },
  ],
}

/** Array-format sets with some null fields. */
const EXECUTION_ARRAY_PARTIAL: SessionExecution = {
  ...EXECUTION_EMPTY,
  blocks: [
    {
      name: 'Recovery',
      key: 'RECOVERY',
      order: 0,
      items: [
        {
          exercise_id: 'ex-4',
          exercise_name: 'Plank',
          prescription: {
            sets: [
              { order: 0, reps: null, weight: null, rpe: null },
              { order: 1, reps: null, weight: null, rpe: null },
            ],
          },
          logs: [],
        },
      ],
    },
  ],
}

const EXECUTION_WITH_LOGS: SessionExecution = {
  ...EXECUTION_EMPTY,
  blocks: [
    {
      ...EXECUTION_EMPTY.blocks[0],
      items: [
        {
          exercise_id: 'ex-1',
          exercise_name: 'Squat',
          prescription: { sets: 3 },
          logs: [
            { set_number: 1, reps: 5, weight: 100, rpe: 8, done: true },
            { set_number: 2, reps: 5, weight: 100, rpe: 8.5, done: true },
          ],
        },
        { exercise_id: 'ex-2', exercise_name: 'Deadlift', prescription: {}, logs: [] },
      ],
    },
    EXECUTION_EMPTY.blocks[1],
  ],
}

// ---------------------------------------------------------------------------
// draftFromExecution
// ---------------------------------------------------------------------------

describe('draftFromExecution', () => {
  it('creates one empty unlogged set row when exercise has no logs and no numeric sets', () => {
    const draft = draftFromExecution(EXECUTION_EMPTY)

    expect(draft['ex-1']).toEqual({
      1: { reps: '', weight: '', rpe: '', done: false },
    })
    expect(draft['ex-2']).toEqual({
      1: { reps: '', weight: '', rpe: '', done: false },
    })
    // ex-3 has duration but no numeric sets → 1 empty row
    expect(draft['ex-3']).toEqual({
      1: { reps: '', weight: '', rpe: '', done: false },
    })
  })

  it('creates N pre-filled rows when prescription.sets is a positive integer', () => {
    const draft = draftFromExecution(EXECUTION_WITH_PRESCRIPTION)

    expect(Object.keys(draft['ex-1'])).toHaveLength(3)
    expect(draft['ex-1'][1]).toEqual({ reps: '8', weight: '100', rpe: '8', done: false })
    expect(draft['ex-1'][2]).toEqual({ reps: '8', weight: '100', rpe: '8', done: false })
    expect(draft['ex-1'][3]).toEqual({ reps: '8', weight: '100', rpe: '8', done: false })
  })

  it('falls back to 1 empty row when prescription.sets is 0 or missing', () => {
    const draft = draftFromExecution(EXECUTION_WITH_PRESCRIPTION)

    expect(draft['ex-2']).toEqual({
      1: { reps: '', weight: '', rpe: '', done: false },
    })
  })

  it('pre-fills only the available fields, leaving absent ones as empty string', () => {
    const draft = draftFromExecution(EXECUTION_WITH_PRESCRIPTION)

    // ex-3: sets=2, reps=12, no weight/rpe
    expect(Object.keys(draft['ex-3'])).toHaveLength(2)
    expect(draft['ex-3'][1]).toEqual({ reps: '12', weight: '', rpe: '', done: false })
    expect(draft['ex-3'][2]).toEqual({ reps: '12', weight: '', rpe: '', done: false })
  })

  it('pre-fills sets and marks them done when logs exist', () => {
    const draft = draftFromExecution(EXECUTION_WITH_LOGS)

    expect(draft['ex-1']).toEqual({
      1: { reps: '5', weight: '100', rpe: '8', done: true },
      2: { reps: '5', weight: '100', rpe: '8.5', done: true },
    })
  })

  it('keeps unlogged exercises as empty rows alongside logged ones', () => {
    const draft = draftFromExecution(EXECUTION_WITH_LOGS)

    expect(draft['ex-2']).toEqual({
      1: { reps: '', weight: '', rpe: '', done: false },
    })
  })

  it('creates one row per set when prescription.sets is an array (post-migration format)', () => {
    const draft = draftFromExecution(EXECUTION_ARRAY_SETS)

    expect(Object.keys(draft['ex-1'])).toHaveLength(3)
    expect(draft['ex-1'][1]).toEqual({ reps: '10', weight: '80', rpe: '7', done: false })
    expect(draft['ex-1'][2]).toEqual({ reps: '8', weight: '90', rpe: '8', done: false })
    expect(draft['ex-1'][3]).toEqual({ reps: '6', weight: '100', rpe: '9', done: false })
  })

  it('handles array sets with null fields as empty strings', () => {
    const draft = draftFromExecution(EXECUTION_ARRAY_PARTIAL)

    expect(Object.keys(draft['ex-4'])).toHaveLength(2)
    expect(draft['ex-4'][1]).toEqual({ reps: '', weight: '', rpe: '', done: false })
    expect(draft['ex-4'][2]).toEqual({ reps: '', weight: '', rpe: '', done: false })
  })

  it('row count matches array length — single source of truth', () => {
    const draft = draftFromExecution(EXECUTION_ARRAY_SETS)
    const prescription = EXECUTION_ARRAY_SETS.blocks[0].items[0].prescription
    const prescribedCount = (prescription.sets as unknown[]).length

    expect(Object.keys(draft['ex-1'])).toHaveLength(prescribedCount)
  })
})

// ---------------------------------------------------------------------------
// progressFromDraft
// ---------------------------------------------------------------------------

describe('progressFromDraft', () => {
  it('returns zero completed counts when no sets are done', () => {
    const draft = draftFromExecution(EXECUTION_EMPTY)
    const progress = progressFromDraft(EXECUTION_EMPTY, draft)

    expect(progress.completedExercises).toBe(0)
    expect(progress.totalExercises).toBe(3)
    expect(progress.completedSets).toBe(0)
    expect(progress.totalSets).toBe(3)   // 3 exercises × 1 empty row each
  })

  it('counts exercises and sets correctly when one exercise is done', () => {
    const draft = draftFromExecution(EXECUTION_WITH_LOGS)
    const progress = progressFromDraft(EXECUTION_WITH_LOGS, draft)

    expect(progress.completedExercises).toBe(1)   // ex-1 only
    expect(progress.totalExercises).toBe(3)
    expect(progress.completedSets).toBe(2)         // 2 sets in ex-1
    expect(progress.totalSets).toBe(4)             // 2 + 1 + 1
  })
})

// ---------------------------------------------------------------------------
// canMarkCompleted
// ---------------------------------------------------------------------------

describe('canMarkCompleted', () => {
  it('returns true when all sets are undone', () => {
    const draft = draftFromExecution(EXECUTION_EMPTY)
    expect(canMarkCompleted(draft)).toBe(true)
  })

  it('returns true when at least one set is done', () => {
    const draft = draftFromExecution(EXECUTION_WITH_LOGS)
    expect(canMarkCompleted(draft)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// UNDO_DONE reducer action
// ---------------------------------------------------------------------------

describe('UNDO_DONE', () => {
  it('sets all sets of the exercise back to done: false', () => {
    const draft = draftFromExecution(EXECUTION_WITH_LOGS)
    // ex-1 starts with done: true (has logs)
    expect(Object.values(draft['ex-1']).every((s) => s.done)).toBe(true)

    const next = draftReducer(draft, { type: 'UNDO_DONE', exerciseId: 'ex-1' })

    expect(Object.values(next['ex-1']).every((s) => s.done)).toBe(false)
  })

  it('preserves set values when undoing', () => {
    const draft = draftFromExecution(EXECUTION_WITH_LOGS)
    const next = draftReducer(draft, { type: 'UNDO_DONE', exerciseId: 'ex-1' })

    expect(next['ex-1'][1]).toEqual({ reps: '5', weight: '100', rpe: '8', done: false })
    expect(next['ex-1'][2]).toEqual({ reps: '5', weight: '100', rpe: '8.5', done: false })
  })

  it('does not affect other exercises', () => {
    const draft = draftFromExecution(EXECUTION_WITH_LOGS)
    const next = draftReducer(draft, { type: 'UNDO_DONE', exerciseId: 'ex-1' })

    expect(next['ex-2']).toEqual(draft['ex-2'])
    expect(next['ex-3']).toEqual(draft['ex-3'])
  })
})
