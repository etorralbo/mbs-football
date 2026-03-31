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
  has_session_structure: false,
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

  it('merges logs into prescribed slots and keeps unlogged sets from prescription', () => {
    const draft = draftFromExecution(EXECUTION_WITH_LOGS)

    // prescription: { sets: 3 }, logs for set 1 and 2 only
    expect(Object.keys(draft['ex-1'])).toHaveLength(3)
    expect(draft['ex-1'][1]).toEqual({ reps: '5', weight: '100', rpe: '8', done: true })
    expect(draft['ex-1'][2]).toEqual({ reps: '5', weight: '100', rpe: '8.5', done: true })
    // Set 3: no log → prescribed defaults (legacy flat: no per-set values)
    expect(draft['ex-1'][3]).toEqual({ reps: '', weight: '', rpe: '', done: false })
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

  it('discards extra logs beyond prescribed set count', () => {
    const execution: SessionExecution = {
      ...EXECUTION_EMPTY,
      blocks: [{
        name: 'Block', key: 'BLOCK', order: 0,
        items: [{
          exercise_id: 'ex-1', exercise_name: 'Squat',
          prescription: { sets: [
            { order: 0, reps: 10, weight: 80, rpe: null },
            { order: 1, reps: 8, weight: 90, rpe: null },
          ]},
          // 4 logs (athlete previously added extra sets via legacy UI)
          logs: [
            { set_number: 1, reps: 10, weight: 80, rpe: 7, done: true },
            { set_number: 2, reps: 8, weight: 90, rpe: 8, done: true },
            { set_number: 3, reps: 6, weight: 95, rpe: 9, done: true },
            { set_number: 4, reps: 5, weight: 100, rpe: 10, done: true },
          ],
        }],
      }],
    }

    const draft = draftFromExecution(execution)
    // Only 2 rows (from prescription), not 4 (from logs)
    expect(Object.keys(draft['ex-1'])).toHaveLength(2)
    expect(draft['ex-1'][1]).toEqual({ reps: '10', weight: '80', rpe: '7', done: true })
    expect(draft['ex-1'][2]).toEqual({ reps: '8', weight: '90', rpe: '8', done: true })
  })

  it('uses prescribed defaults when log fields are null', () => {
    const execution: SessionExecution = {
      ...EXECUTION_EMPTY,
      blocks: [{
        name: 'Block', key: 'BLOCK', order: 0,
        items: [{
          exercise_id: 'ex-1', exercise_name: 'Squat',
          prescription: { sets: [
            { order: 0, reps: 10, weight: 80, rpe: 7 },
          ]},
          // Log has reps but weight/rpe are null → fall back to prescribed
          logs: [
            { set_number: 1, reps: 12, weight: null, rpe: null, done: true },
          ],
        }],
      }],
    }

    const draft = draftFromExecution(execution)
    expect(draft['ex-1'][1]).toEqual({ reps: '12', weight: '80', rpe: '7', done: true })
  })

  it('merges logs with array-format prescribed sets', () => {
    const execution: SessionExecution = {
      ...EXECUTION_EMPTY,
      blocks: [{
        name: 'Block', key: 'BLOCK', order: 0,
        items: [{
          exercise_id: 'ex-1', exercise_name: 'Squat',
          prescription: { sets: [
            { order: 0, reps: 10, weight: 80, rpe: 7 },
            { order: 1, reps: 8, weight: 90, rpe: 8 },
            { order: 2, reps: 6, weight: 100, rpe: 9 },
          ]},
          logs: [
            { set_number: 1, reps: 10, weight: 82, rpe: 7.5, done: true },
            // Set 2 not logged, set 3 not logged
          ],
        }],
      }],
    }

    const draft = draftFromExecution(execution)
    expect(Object.keys(draft['ex-1'])).toHaveLength(3)
    // Set 1: merged from log
    expect(draft['ex-1'][1]).toEqual({ reps: '10', weight: '82', rpe: '7.5', done: true })
    // Set 2: prescribed defaults, not done
    expect(draft['ex-1'][2]).toEqual({ reps: '8', weight: '90', rpe: '8', done: false })
    // Set 3: prescribed defaults, not done
    expect(draft['ex-1'][3]).toEqual({ reps: '6', weight: '100', rpe: '9', done: false })
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

  it('counts exercises and sets correctly when one exercise is partially done', () => {
    const draft = draftFromExecution(EXECUTION_WITH_LOGS)
    const progress = progressFromDraft(EXECUTION_WITH_LOGS, draft)

    expect(progress.completedExercises).toBe(1)   // ex-1 has at least one done set
    expect(progress.totalExercises).toBe(3)
    expect(progress.completedSets).toBe(2)         // 2 logged sets in ex-1
    expect(progress.totalSets).toBe(5)             // 3 (ex-1 prescribed) + 1 + 1
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
    // ex-1 has 3 prescribed sets; sets 1 & 2 are logged (done: true), set 3 is not
    expect(draft['ex-1'][1].done).toBe(true)
    expect(draft['ex-1'][2].done).toBe(true)
    expect(draft['ex-1'][3].done).toBe(false)

    const next = draftReducer(draft, { type: 'UNDO_DONE', exerciseId: 'ex-1' })

    expect(Object.values(next['ex-1']).every((s) => s.done)).toBe(false)
  })

  it('preserves set values when undoing', () => {
    const draft = draftFromExecution(EXECUTION_WITH_LOGS)
    const next = draftReducer(draft, { type: 'UNDO_DONE', exerciseId: 'ex-1' })

    expect(next['ex-1'][1]).toEqual({ reps: '5', weight: '100', rpe: '8', done: false })
    expect(next['ex-1'][2]).toEqual({ reps: '5', weight: '100', rpe: '8.5', done: false })
    expect(next['ex-1'][3]).toEqual({ reps: '', weight: '', rpe: '', done: false })
  })

  it('does not affect other exercises', () => {
    const draft = draftFromExecution(EXECUTION_WITH_LOGS)
    const next = draftReducer(draft, { type: 'UNDO_DONE', exerciseId: 'ex-1' })

    expect(next['ex-2']).toEqual(draft['ex-2'])
    expect(next['ex-3']).toEqual(draft['ex-3'])
  })
})
