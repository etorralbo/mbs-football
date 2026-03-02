import { ForbiddenError, StaleTeamRequestError, UnauthorizedError } from './httpClient'

/**
 * Returns true when the error is a 403 whose message indicates the user has
 * not yet completed onboarding (no UserProfile row exists in the DB).
 *
 * Backend message: "User not onboarded. Please complete registration."
 */
export function isNotOnboardedError(err: unknown): boolean {
  return err instanceof ForbiddenError && /not.?onboarded/i.test(err.message)
}

/**
 * Central handler for API errors inside private pages.
 *
 * - 401 UnauthorizedError  → replace('/login')   (token expired / missing)
 * - 403 "not onboarded"    → replace('/onboarding')
 * - anything else          → re-throws so the caller can show an error state
 */
export function handleApiError(
  err: unknown,
  router: { replace: (path: string) => void },
): void {
  if (err instanceof UnauthorizedError) {
    router.replace('/login')
    return
  }
  if (isNotOnboardedError(err)) {
    router.replace('/onboarding')
    return
  }
  if (err instanceof StaleTeamRequestError) {
    // The active team changed while this request was in-flight. Silently
    // discard — the UI will re-render with fresh data from the new team.
    return
  }
  throw err
}
