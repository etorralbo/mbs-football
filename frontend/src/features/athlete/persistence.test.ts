import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadDraft, saveDraft, clearDraft } from './persistence'
import type { StoredDraft } from './persistence'

// ---------------------------------------------------------------------------
// localStorage mock (vitest jsdom provides it, but we need fine-grained control)
// ---------------------------------------------------------------------------

function storageKey(sessionId: string) {
  return `athlete:draft:${sessionId}`
}

function setRaw(sessionId: string, value: unknown) {
  localStorage.setItem(storageKey(sessionId), JSON.stringify(value))
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validV2Draft(overrides: Partial<StoredDraft> = {}): StoredDraft {
  return {
    draftVersion: 2,
    sessionId: 'sess-1',
    savedAt: Date.now(),
    phase: 'in_progress',
    currentBlockIndex: 1,
    logsByExercise: {
      'ex-1': [
        { setNumber: 1, actualLoad: '80', actualReps: '5', actualRpe: '7', note: '' },
      ],
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// loadDraft — missing / corrupt
// ---------------------------------------------------------------------------

describe('loadDraft — missing / corrupt', () => {
  it('returns null when key is absent', () => {
    expect(loadDraft('sess-1')).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    localStorage.setItem(storageKey('sess-1'), '{bad json')
    expect(loadDraft('sess-1')).toBeNull()
  })

  it('returns null for wrong draftVersion', () => {
    setRaw('sess-1', { draftVersion: 99, sessionId: 'sess-1', savedAt: Date.now() })
    expect(loadDraft('sess-1')).toBeNull()
  })

  it('returns null when required fields are missing', () => {
    setRaw('sess-1', { draftVersion: 2, sessionId: 'sess-1' }) // missing savedAt etc.
    expect(loadDraft('sess-1')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// loadDraft — v2 pass-through
// ---------------------------------------------------------------------------

describe('loadDraft — v2 pass-through', () => {
  it('returns v2 draft unchanged', () => {
    const draft = validV2Draft()
    setRaw('sess-1', draft)
    const result = loadDraft('sess-1')
    expect(result).toEqual(draft)
  })

  it('returns currentBlockIndex from v2 draft', () => {
    setRaw('sess-1', validV2Draft({ currentBlockIndex: 2 }))
    const result = loadDraft('sess-1')
    expect(result?.currentBlockIndex).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// loadDraft — v1 → v2 migration
// ---------------------------------------------------------------------------

const V1_DRAFT = {
  draftVersion: 1,
  sessionId: 'sess-1',
  savedAt: Date.now(),
  phase: 'in_progress' as const,
  currentExerciseIndex: 3,
  logsByExercise: {
    'ex-5': [
      { setNumber: 1, actualLoad: '100', actualReps: '3', actualRpe: '9', note: 'hard' },
    ],
  },
}

describe('loadDraft — v1 → v2 migration', () => {
  it('returns a v2-shaped draft when reading a v1 entry', () => {
    setRaw('sess-1', V1_DRAFT)
    const result = loadDraft('sess-1')
    expect(result).not.toBeNull()
    expect(result?.draftVersion).toBe(2)
  })

  it('sets currentBlockIndex to 0 (cannot recover block position)', () => {
    setRaw('sess-1', V1_DRAFT)
    const result = loadDraft('sess-1')
    expect(result?.currentBlockIndex).toBe(0)
  })

  it('preserves log data through migration', () => {
    setRaw('sess-1', V1_DRAFT)
    const result = loadDraft('sess-1')
    expect(result?.logsByExercise['ex-5']).toHaveLength(1)
    expect(result?.logsByExercise['ex-5'][0].actualLoad).toBe('100')
  })

  it('writes migrated v2 draft back to localStorage', () => {
    setRaw('sess-1', V1_DRAFT)
    loadDraft('sess-1')
    const stored = JSON.parse(localStorage.getItem(storageKey('sess-1'))!)
    expect(stored.draftVersion).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// loadDraft — TTL eviction
// ---------------------------------------------------------------------------

describe('loadDraft — TTL eviction', () => {
  const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1_000

  it('returns null and removes entry when v2 draft is stale', () => {
    const draft = validV2Draft({ savedAt: Date.now() - EIGHT_DAYS_MS })
    setRaw('sess-1', draft)
    expect(loadDraft('sess-1')).toBeNull()
    expect(localStorage.getItem(storageKey('sess-1'))).toBeNull()
  })

  it('returns null and removes entry when v1 draft is stale', () => {
    const staleV1 = { ...V1_DRAFT, savedAt: Date.now() - EIGHT_DAYS_MS }
    setRaw('sess-1', staleV1)
    expect(loadDraft('sess-1')).toBeNull()
    expect(localStorage.getItem(storageKey('sess-1'))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// saveDraft / clearDraft
// ---------------------------------------------------------------------------

describe('saveDraft', () => {
  it('persists a v2 draft to localStorage', () => {
    const draft = validV2Draft()
    saveDraft(draft)
    const stored = JSON.parse(localStorage.getItem(storageKey('sess-1'))!)
    expect(stored.draftVersion).toBe(2)
    expect(stored.currentBlockIndex).toBe(1)
  })
})

describe('clearDraft', () => {
  it('removes the stored entry', () => {
    saveDraft(validV2Draft())
    clearDraft('sess-1')
    expect(localStorage.getItem(storageKey('sess-1'))).toBeNull()
  })
})
