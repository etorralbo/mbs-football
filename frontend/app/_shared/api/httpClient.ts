import { supabase } from '@/app/_shared/auth/supabaseClient'
import {
  getActiveTeamId,
  isValidUuid,
} from '@/src/shared/auth/activeTeamStore'

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000'

// ---------------------------------------------------------------------------
// Typed error hierarchy
// ---------------------------------------------------------------------------

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends Error {
  readonly detail: unknown
  constructor(detail: unknown) {
    super('Validation error')
    this.name = 'ValidationError'
    this.detail = detail
  }
}

export class ConflictError extends Error {
  constructor(message = 'Conflict') {
    super(message)
    this.name = 'ConflictError'
  }
}

export class ServerError extends Error {
  readonly status: number
  constructor(message: string, status = 500) {
    super(message)
    this.name = 'ServerError'
    this.status = status
  }
}

/**
 * Thrown by team-scoped requests when no active team has been selected.
 * Callers (or the global error handler) should redirect to /team/select.
 */
export class TeamNotSelectedError extends Error {
  constructor() {
    super('No team selected')
    this.name = 'TeamNotSelectedError'
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractDetail(body: unknown): unknown {
  if (body && typeof body === 'object' && 'detail' in body) {
    return (body as { detail: unknown }).detail
  }
  return body
}

function extractMessage(body: unknown): string {
  const detail = extractDetail(body)
  if (typeof detail === 'string') return detail
  if (typeof body === 'string') return body
  return 'Unknown error'
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export type RequestOptions = RequestInit & {
  /**
   * Set to false for bootstrap endpoints that do not require a team context
   * (e.g. /v1/me, POST /v1/teams, POST /v1/invites/accept, onboarding).
   * Defaults to true — all other requests are team-scoped.
   */
  teamScoped?: boolean
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { teamScoped = true, ...fetchOptions } = options

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token ?? null

  // Build headers, stripping any manually-supplied X-Team-Id.
  const callerHeaders = (fetchOptions.headers ?? {}) as Record<string, string>
  if ('X-Team-Id' in callerHeaders || 'x-team-id' in callerHeaders) {
    if (process.env.NODE_ENV === 'development') {
      console.error(
        '[httpClient] X-Team-Id must not be set manually. ' +
          'Use the active team context (setActiveTeamId) instead.',
      )
    }
    delete callerHeaders['X-Team-Id']
    delete callerHeaders['x-team-id']
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...callerHeaders,
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Team-scoped requests require an active team.
  if (teamScoped) {
    const activeTeamId = getActiveTeamId()
    if (activeTeamId && isValidUuid(activeTeamId)) {
      headers['X-Team-Id'] = activeTeamId
    } else {
      throw new TeamNotSelectedError()
    }
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...fetchOptions,
    headers,
  })

  const contentType = response.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')

  const body: unknown = isJson ? await response.json() : await response.text()

  if (response.ok) {
    return body as T
  }

  switch (response.status) {
    case 401:
      throw new UnauthorizedError()
    case 403:
      throw new ForbiddenError(extractMessage(body))
    case 404:
      throw new NotFoundError(extractMessage(body))
    case 400:
    case 422:
      throw new ValidationError(extractDetail(body))
    case 409:
      throw new ConflictError(extractMessage(body))
    default:
      throw new ServerError(
        extractMessage(body) || `Server error ${response.status}`,
        response.status,
      )
  }
}
