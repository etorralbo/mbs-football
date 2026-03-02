/**
 * Module-level singleton for the active team ID.
 *
 * Bridges the gap between AuthContext (React) and httpClient (plain TS).
 * AuthProvider calls _setActiveTeamIdInternal() on every resolved change;
 * httpClient reads getActiveTeamId() on every request.
 *
 * Pattern: mirrors app/_shared/auth/supabaseClient.ts
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let _activeTeamId: string | null = null
/**
 * Monotonically-increasing counter. Incremented whenever the active team ID
 * changes. httpClient captures the epoch before a fetch and compares after;
 * a mismatch means the team switched mid-flight → StaleTeamRequestError.
 */
let _epoch = 0

/** Read the currently active team ID. Called by httpClient on every request. */
export function getActiveTeamId(): string | null {
  return _activeTeamId
}

/** Read the current epoch. Called by httpClient to detect mid-flight team switches. */
export function getEpoch(): number {
  return _epoch
}

/**
 * Update the store. Only AuthProvider should call this.
 * Underscore prefix signals "internal — do not call from feature code".
 */
export function _setActiveTeamIdInternal(id: string | null): void {
  if (_activeTeamId !== id) {
    _epoch++
  }
  _activeTeamId = id
}

/** True if `id` is a well-formed UUID v4 string. */
export function isValidUuid(id: string): boolean {
  return UUID_RE.test(id)
}
