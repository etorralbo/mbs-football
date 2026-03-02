import type { AthleteDraft, AthleteSetDraft, SessionPhase } from './athleteStore'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRAFT_VERSION = 1
const TTL_MS = 7 * 24 * 60 * 60 * 1_000 // 7 days

function storageKey(sessionId: string): string {
  return `athlete:draft:${sessionId}`
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredLogEntry {
  setNumber: number
  actualLoad: string
  actualReps: string
  actualRpe: string
  note: string
}

/**
 * Persisted shape. `phase` is intentionally limited to the two saveable phases;
 * 'completed' is never stored (the draft is cleared when the session completes).
 */
export interface StoredDraft {
  draftVersion: 1
  sessionId: string
  savedAt: number
  phase: Extract<SessionPhase, 'overview' | 'in_progress'>
  currentExerciseIndex: number
  logsByExercise: Record<string, StoredLogEntry[]>
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function isStoredDraft(obj: unknown): obj is StoredDraft {
  if (typeof obj !== 'object' || obj === null) return false
  const d = obj as Record<string, unknown>
  return (
    d.draftVersion === DRAFT_VERSION &&
    typeof d.sessionId === 'string' &&
    typeof d.savedAt === 'number' &&
    (d.phase === 'overview' || d.phase === 'in_progress') &&
    typeof d.currentExerciseIndex === 'number' &&
    typeof d.logsByExercise === 'object' &&
    d.logsByExercise !== null
  )
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Loads and validates a stored draft. Returns null if missing, stale, or corrupt. */
export function loadDraft(sessionId: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(sessionId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isStoredDraft(parsed)) return null
    if (Date.now() - parsed.savedAt > TTL_MS) {
      localStorage.removeItem(storageKey(sessionId))
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/** Persists the draft. Silently ignores localStorage unavailability. */
export function saveDraft(draft: StoredDraft): void {
  try {
    localStorage.setItem(storageKey(draft.sessionId), JSON.stringify(draft))
  } catch {
    // localStorage full or unavailable (private browsing) — no-op
  }
}

/** Removes the stored draft. Silently ignores localStorage unavailability. */
export function clearDraft(sessionId: string): void {
  try {
    localStorage.removeItem(storageKey(sessionId))
  } catch {
    // localStorage unavailable — no-op
  }
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/**
 * Converts the in-memory draft (string-keyed, by set number) into the flat
 * array shape suitable for localStorage serialization.
 */
export function athleteDraftToStoredLogs(
  draft: AthleteDraft,
): Record<string, StoredLogEntry[]> {
  const result: Record<string, StoredLogEntry[]> = {}
  for (const [exerciseId, sets] of Object.entries(draft)) {
    result[exerciseId] = Object.entries(sets).map(([setNum, s]) => ({
      setNumber: Number(setNum),
      actualLoad: (s as AthleteSetDraft).actualLoad,
      actualReps: (s as AthleteSetDraft).actualReps,
      actualRpe: (s as AthleteSetDraft).actualRpe,
      note: (s as AthleteSetDraft).note,
    }))
  }
  return result
}

/**
 * Converts stored log entries back into the in-memory draft shape.
 * All restored sets are marked `done: false`; the RESTORE_DRAFT reducer
 * skips exercises already marked done on the server.
 */
export function storedLogsToAthleteDraft(
  logs: Record<string, StoredLogEntry[]>,
): AthleteDraft {
  const draft: AthleteDraft = {}
  for (const [exerciseId, entries] of Object.entries(logs)) {
    draft[exerciseId] = Object.fromEntries(
      entries.map((e) => [
        e.setNumber,
        {
          actualLoad: e.actualLoad,
          actualReps: e.actualReps,
          actualRpe: e.actualRpe,
          note: e.note,
          done: false,
        },
      ]),
    )
  }
  return draft
}
