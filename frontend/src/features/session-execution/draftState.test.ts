import { describe, it, expect } from 'vitest'
import {
  draftFromExecution,
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
        { exercise_id: 'ex-1', exercise_name: 'Squat', prescription: { sets: 3 }, logs: [] },
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
  it('creates one empty unlogged set row when exercise has no logs', () => {
    const draft = draftFromExecution(EXECUTION_EMPTY)

    expect(draft['ex-1']).toEqual({
      1: { reps: '', weight: '', rpe: '', done: false },
    })
    expect(draft['ex-3']).toEqual({
      1: { reps: '', weight: '', rpe: '', done: false },
    })
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
  it('returns false when all sets are undone', () => {
    const draft = draftFromExecution(EXECUTION_EMPTY)
    expect(canMarkCompleted(draft)).toBe(false)
  })

  it('returns true when at least one set is done', () => {
    const draft = draftFromExecution(EXECUTION_WITH_LOGS)
    expect(canMarkCompleted(draft)).toBe(true)
  })
})
