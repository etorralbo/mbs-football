import {
  ForbiddenError,
  NotFoundError,
  ServerError,
  ValidationError,
} from '@/app/_shared/api/httpClient'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NormalizedFetchError {
  /** Human-readable message to display in AthleteError */
  message: string
  /**
   * True for 403 permission failures.
   * Retry won't help — show "Back to home" only.
   *
   * Note: 401 UnauthorizedError never reaches here because handleApiError
   * intercepts it and redirects to /login first.
   */
  forbidden: boolean
  /**
   * True for 404 not-found.
   * Retry won't help — the resource simply doesn't exist.
   */
  notFound: boolean
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * Converts any unknown thrown value into a stable, typed error description.
 *
 * Callers should pass the error through `handleApiError` first so that
 * 401 / not-onboarded redirects are handled centrally. Only the remaining
 * errors (403-access, 404, 422, 409, 5xx, network) reach this function.
 */
export function normalizeAthleteError(err: unknown): NormalizedFetchError {
  if (err instanceof ForbiddenError) {
    return {
      message: "You don't have access to this session. Contact your coach.",
      forbidden: true,
      notFound: false,
    }
  }

  if (err instanceof NotFoundError) {
    return {
      message: 'Session not found. It may have been removed.',
      forbidden: false,
      notFound: true,
    }
  }

  if (err instanceof ServerError) {
    return {
      message: 'Server error. Please try again in a moment.',
      forbidden: false,
      notFound: false,
    }
  }

  if (err instanceof ValidationError) {
    return {
      message: 'Invalid request. Please reload and try again.',
      forbidden: false,
      notFound: false,
    }
  }

  if (err instanceof Error) {
    // Covers TypeError ("Failed to fetch") for network failures
    return { message: err.message, forbidden: false, notFound: false }
  }

  return {
    message: 'Something went wrong. Please try again.',
    forbidden: false,
    notFound: false,
  }
}
