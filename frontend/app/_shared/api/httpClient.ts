import { supabase } from '@/app/_shared/auth/supabaseClient'

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

export class ServerError extends Error {
  readonly status: number
  constructor(message: string, status = 500) {
    super(message)
    this.name = 'ServerError'
    this.status = status
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

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token ?? null

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers })

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
    default:
      throw new ServerError(
        extractMessage(body) || `Server error ${response.status}`,
        response.status,
      )
  }
}
