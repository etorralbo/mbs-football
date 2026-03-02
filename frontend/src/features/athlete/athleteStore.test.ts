import { describe, it, expect } from 'vitest'
import {
  athleteSessionReducer,
  initialAthleteState,
  selectProgress,
} from './athleteStore'
import type { AthleteSessionState, AthleteAction } from './athleteStore'
import type { SessionExecution } from '@/app/_shared/api/types'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const EXECUTION: SessionExecution = {
  session_id: 'sess-1',
  status: 'pending',
  workout_template_id: 'tmpl-1',
  template_title: 'Strength A',
  athlete_profile_id: 'athlete-1',
  scheduled_for: null,
  blocks: [
    {
      key: 'PREP',
      name: 'Preparation',
      order: 0,
      items: [
        {
          exercise_id: 'ex-1',
          exercise_name: 'Mobility',
          prescription: { sets: 1, reps: 10 },
          logs: [],
        },
      ],
    },
    {
      key: 'PRIMARY',
      name: 'Primary Strength',
      order: 1,
      items: [
        {
          exercise_id: 'ex-2',
          exercise_name: 'Squat',
          prescription: { sets: 3, reps: 5 },
          logs: [],
        },
        {
          exercise_id: 'ex-3',
          exercise_name: 'Deadlift',
          prescription: { sets: 3, reps: 3 },
          logs: [],
        },
      ],
    },
    {
      key: 'SECONDARY',
      name: 'Secondary',
      order: 2,
      items: [
        {
          exercise_id: 'ex-4',
          exercise_name: 'Press',
          prescription: { sets: 3, reps: 8 },
          logs: [],
        },
      ],
    },
  ],
}

// Execution with server logs already recorded for ex-1
const EXECUTION_WITH_LOGS: SessionExecution = {
  ...EXECUTION,
  blocks: [
    {
      ...EXECUTION.blocks[0],
      items: [
        {
          ...EXECUTION.blocks[0].items[0],
          logs: [{ set_number: 1, reps: 10, weight: 60, rpe: 7, done: true }],
        },
      ],
    },
    ...EXECUTION.blocks.slice(1),
  ],
}

// ---------------------------------------------------------------------------
// HYDRATE
// ---------------------------------------------------------------------------

describe('HYDRATE action', () => {
  const hydrateAction: AthleteAction = { type: 'HYDRATE', execution: EXECUTION }

  it('sets phase to overview', () => {
    const s = athleteSessionReducer(initialAthleteState, hydrateAction)
    expect(s.phase).toBe('overview')
  })

  it('sets currentBlockIdx to 0', () => {
    const s = athleteSessionReducer(initialAthleteState, hydrateAction)
    expect(s.currentBlockIdx).toBe(0)
  })

  it('populates blocks with correct count', () => {
    const s = athleteSessionReducer(initialAthleteState, hydrateAction)
    expect(s.blocks).toHaveLength(3)
  })

  it('populates blocks with correct key/name/order', () => {
    const s = athleteSessionReducer(initialAthleteState, hydrateAction)
    expect(s.blocks[0]).toMatchObject({ key: 'PREP', name: 'Preparation', order: 0 })
    expect(s.blocks[1]).toMatchObject({ key: 'PRIMARY', name: 'Primary Strength', order: 1 })
    expect(s.blocks[2]).toMatchObject({ key: 'SECONDARY', name: 'Secondary', order: 2 })
  })

  it('populates blocks[1].exerciseIds with correct exercise IDs', () => {
    const s = athleteSessionReducer(initialAthleteState, hydrateAction)
    expect(s.blocks[1].exerciseIds).toEqual(['ex-2', 'ex-3'])
  })

  it('initialises draft for every exercise', () => {
    const s = athleteSessionReducer(initialAthleteState, hydrateAction)
    expect(s.draft).toHaveProperty('ex-1')
    expect(s.draft).toHaveProperty('ex-2')
    expect(s.draft).toHaveProperty('ex-3')
    expect(s.draft).toHaveProperty('ex-4')
  })

  it('pre-fills draft.done=true for exercises with server logs', () => {
    const s = athleteSessionReducer(
      initialAthleteState,
      { type: 'HYDRATE', execution: EXECUTION_WITH_LOGS },
    )
    expect(s.draft['ex-1'][1].done).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// START
// ---------------------------------------------------------------------------

describe('START action', () => {
  it('transitions phase to in_progress and resets currentBlockIdx to 0', () => {
    const afterHydrate = athleteSessionReducer(initialAthleteState, {
      type: 'HYDRATE',
      execution: EXECUTION,
    })
    const s = athleteSessionReducer(afterHydrate, { type: 'START' })
    expect(s.phase).toBe('in_progress')
    expect(s.currentBlockIdx).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// NEXT_BLOCK
// ---------------------------------------------------------------------------

describe('NEXT_BLOCK action', () => {
  function stateAtBlock(idx: number): AthleteSessionState {
    const s = athleteSessionReducer(initialAthleteState, {
      type: 'HYDRATE',
      execution: EXECUTION,
    })
    return { ...s, phase: 'in_progress', currentBlockIdx: idx }
  }

  it('increments currentBlockIdx', () => {
    const s = athleteSessionReducer(stateAtBlock(0), { type: 'NEXT_BLOCK' })
    expect(s.currentBlockIdx).toBe(1)
  })

  it('does not change phase when not on last block', () => {
    const s = athleteSessionReducer(stateAtBlock(0), { type: 'NEXT_BLOCK' })
    expect(s.phase).toBe('in_progress')
  })

  it('transitions to completed when on last block', () => {
    const s = athleteSessionReducer(stateAtBlock(2), { type: 'NEXT_BLOCK' })
    expect(s.phase).toBe('completed')
  })

  it('does not increment idx when transitioning to completed', () => {
    const before = stateAtBlock(2)
    const s = athleteSessionReducer(before, { type: 'NEXT_BLOCK' })
    // idx stays at 2 (last), phase flips
    expect(s.currentBlockIdx).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// PREV_BLOCK
// ---------------------------------------------------------------------------

describe('PREV_BLOCK action', () => {
  function stateAtBlock(idx: number): AthleteSessionState {
    const s = athleteSessionReducer(initialAthleteState, {
      type: 'HYDRATE',
      execution: EXECUTION,
    })
    return { ...s, phase: 'in_progress', currentBlockIdx: idx }
  }

  it('decrements currentBlockIdx', () => {
    const s = athleteSessionReducer(stateAtBlock(2), { type: 'PREV_BLOCK' })
    expect(s.currentBlockIdx).toBe(1)
  })

  it('clamps at 0', () => {
    const s = athleteSessionReducer(stateAtBlock(0), { type: 'PREV_BLOCK' })
    expect(s.currentBlockIdx).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// MARK_BLOCK_DONE
// ---------------------------------------------------------------------------

describe('MARK_BLOCK_DONE action', () => {
  it('marks all sets of all exercises in the block as done', () => {
    const afterHydrate = athleteSessionReducer(initialAthleteState, {
      type: 'HYDRATE',
      execution: EXECUTION,
    })
    const s = athleteSessionReducer(afterHydrate, {
      type: 'MARK_BLOCK_DONE',
      blockKey: 'PRIMARY',
    })
    // PRIMARY block has ex-2 and ex-3
    expect(s.draft['ex-2'][1].done).toBe(true)
    expect(s.draft['ex-3'][1].done).toBe(true)
    // Other exercise (PREP block) should be untouched
    expect(s.draft['ex-1'][1].done).toBe(false)
  })

  it('ignores unknown blockKey gracefully', () => {
    const afterHydrate = athleteSessionReducer(initialAthleteState, {
      type: 'HYDRATE',
      execution: EXECUTION,
    })
    expect(() =>
      athleteSessionReducer(afterHydrate, {
        type: 'MARK_BLOCK_DONE',
        blockKey: 'DOES_NOT_EXIST',
      }),
    ).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// RESTORE_DRAFT
// ---------------------------------------------------------------------------

describe('RESTORE_DRAFT action', () => {
  it('restores currentBlockIdx from action', () => {
    const afterHydrate = athleteSessionReducer(initialAthleteState, {
      type: 'HYDRATE',
      execution: EXECUTION,
    })
    const s = athleteSessionReducer(afterHydrate, {
      type: 'RESTORE_DRAFT',
      restoredDraft: {},
      phase: 'in_progress',
      currentBlockIdx: 2,
    })
    expect(s.currentBlockIdx).toBe(2)
    expect(s.phase).toBe('in_progress')
  })

  it('merges restored draft data over server draft', () => {
    const afterHydrate = athleteSessionReducer(initialAthleteState, {
      type: 'HYDRATE',
      execution: EXECUTION,
    })
    const restoredDraft = {
      'ex-2': {
        1: { actualLoad: '100', actualReps: '5', actualRpe: '8', note: '', done: false },
      },
    }
    const s = athleteSessionReducer(afterHydrate, {
      type: 'RESTORE_DRAFT',
      restoredDraft,
      phase: 'in_progress',
      currentBlockIdx: 1,
    })
    expect(s.draft['ex-2'][1].actualLoad).toBe('100')
  })

  it('does not overwrite server-completed exercises', () => {
    const afterHydrate = athleteSessionReducer(
      initialAthleteState,
      { type: 'HYDRATE', execution: EXECUTION_WITH_LOGS },
    )
    // ex-1 is marked done: true from server logs
    const s = athleteSessionReducer(afterHydrate, {
      type: 'RESTORE_DRAFT',
      restoredDraft: {
        'ex-1': { 1: { actualLoad: '0', actualReps: '0', actualRpe: '0', note: 'stale', done: false } },
      },
      phase: 'in_progress',
      currentBlockIdx: 0,
    })
    // server-done exercise should not be overwritten by local draft
    expect(s.draft['ex-1'][1].done).toBe(true)
    expect(s.draft['ex-1'][1].note).not.toBe('stale')
  })
})

// ---------------------------------------------------------------------------
// selectProgress
// ---------------------------------------------------------------------------

describe('selectProgress', () => {
  it('returns progressPct of 0 when no sets are done', () => {
    const s = athleteSessionReducer(initialAthleteState, {
      type: 'HYDRATE',
      execution: EXECUTION,
    })
    const { progressPct } = selectProgress(s)
    expect(progressPct).toBe(0)
  })

  it('returns totalBlocks equal to blocks.length', () => {
    const s = athleteSessionReducer(initialAthleteState, {
      type: 'HYDRATE',
      execution: EXECUTION,
    })
    const { totalBlocks } = selectProgress(s)
    expect(totalBlocks).toBe(3)
  })

  it('returns blockProgressPct based on completed blocks', () => {
    const afterHydrate = athleteSessionReducer(initialAthleteState, {
      type: 'HYDRATE',
      execution: EXECUTION,
    })
    // Mark block PREP (block 0) as done
    const s = athleteSessionReducer(afterHydrate, {
      type: 'MARK_BLOCK_DONE',
      blockKey: 'PREP',
    })
    const { blockProgressPct } = selectProgress(s)
    // 1 of 3 blocks fully done → 33%
    expect(blockProgressPct).toBe(33)
  })

  it('returns progressPct based on exercise-level completion', () => {
    const afterHydrate = athleteSessionReducer(initialAthleteState, {
      type: 'HYDRATE',
      execution: EXECUTION,
    })
    // Mark PRIMARY block done → ex-2, ex-3 done
    const s = athleteSessionReducer(afterHydrate, {
      type: 'MARK_BLOCK_DONE',
      blockKey: 'PRIMARY',
    })
    const { progressPct, completedCount, totalCount } = selectProgress(s)
    expect(totalCount).toBe(4)
    expect(completedCount).toBe(2)
    expect(progressPct).toBe(50)
  })
})
