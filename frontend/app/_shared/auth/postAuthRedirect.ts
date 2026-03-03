const INTERNAL_PATH_PATTERN = /^\/(?!\/)/

/**
 * Returns a safe in-app path to use after authentication.
 * Falls back when the provided value is missing or points to an external URL.
 */
export function getSafePostAuthPath(rawNext: string | null | undefined, fallback: string) {
  if (rawNext && INTERNAL_PATH_PATTERN.test(rawNext)) {
    return rawNext
  }
  return fallback
}

