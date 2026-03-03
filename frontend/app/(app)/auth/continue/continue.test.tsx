/**
 * Tests for /auth/continue page.
 *
 * Contract:
 *   no pending token             → redirect to /sessions
 *   expired token (>30 min)      → redirect to /sessions, no API call
 *   joined                       → clear token, sessionStorage team name, redirect to /sessions?welcome=1
 *   already_member               → show "already member" screen + buttons
 *   not_eligible                 → show "invite for athletes" screen + buttons
 *   404 (NotFoundError)          → error: "no es válido"
 *   410 (GoneError)              → error: "caducado"
 *   409 (ConflictError)          → error: "ya ha sido utilizado"
 */
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import AuthContinuePage from './page'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockRequest, mockReplace, mockGetUser } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockReplace: vi.fn(),
  mockGetUser: vi.fn(),
}))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = await importOriginal() as object
  return { ...actual, request: mockRequest }
})

vi.mock('@/app/_shared/auth/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: mockGetUser,
    },
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER = {
  data: {
    user: {
      user_metadata: { name: 'Alice' },
      email: 'alice@example.com',
    },
  },
}

function setToken(token = 'invite-token-abc', ageMs = 0) {
  localStorage.setItem('pending_invite_token', token)
  localStorage.setItem('pending_invite_token_at', String(Date.now() - ageMs))
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  mockRequest.mockReset()
  mockReplace.mockReset()
  mockGetUser.mockReset()
  mockGetUser.mockResolvedValue(USER)
})

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthContinuePage — no pending token', () => {
  it('redirects to /sessions when no token in localStorage', async () => {
    // localStorage is empty
    render(<AuthContinuePage />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/sessions')
    })
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it('redirects to /sessions when token is older than 30 minutes', async () => {
    const THIRTY_ONE_MINUTES = 31 * 60 * 1000
    setToken('old-token', THIRTY_ONE_MINUTES)

    render(<AuthContinuePage />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/sessions')
    })
    expect(mockRequest).not.toHaveBeenCalled()
    expect(localStorage.getItem('pending_invite_token')).toBeNull()
    expect(localStorage.getItem('pending_invite_token_at')).toBeNull()
  })
})

describe('AuthContinuePage — joined', () => {
  it('calls accept endpoint, stores team name in sessionStorage and redirects to /sessions?welcome=1', async () => {
    setToken()
    mockRequest.mockResolvedValue({
      status: 'joined',
      team_id: 'team-1',
      team_name: 'FC Barcelona',
    })

    render(<AuthContinuePage />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/sessions?welcome=1')
    })

    expect(sessionStorage.getItem('welcome_team_name')).toBe('FC Barcelona')
    expect(localStorage.getItem('pending_invite_token')).toBeNull()
    expect(localStorage.getItem('pending_invite_token_at')).toBeNull()
  })

  it('passes display_name from user metadata to accept endpoint', async () => {
    setToken('token-xyz')
    mockRequest.mockResolvedValue({
      status: 'joined',
      team_id: 'team-1',
      team_name: 'Real Madrid',
    })

    render(<AuthContinuePage />)

    await waitFor(() => expect(mockRequest).toHaveBeenCalled())

    const [url, opts] = mockRequest.mock.calls[0] as [string, RequestInit & { body: string }]
    expect(url).toContain('token-xyz')
    expect(JSON.parse(opts.body)).toMatchObject({ display_name: 'Alice' })
  })
})

describe('AuthContinuePage — already_member', () => {
  it('shows "already member" screen with team name and action buttons', async () => {
    setToken()
    mockRequest.mockResolvedValue({
      status: 'already_member',
      team_id: 'team-1',
      team_name: 'FC Barcelona',
    })

    render(<AuthContinuePage />)

    await screen.findByText(/este enlace es para invitar a atletas/i)
    expect(screen.getByText(/FC Barcelona/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copiar enlace/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ir a mi dashboard/i })).toBeInTheDocument()
  })

  it('clears token and timestamp from localStorage on already_member', async () => {
    setToken()
    mockRequest.mockResolvedValue({
      status: 'already_member',
      team_id: 'team-1',
      team_name: 'Team A',
    })

    render(<AuthContinuePage />)

    await screen.findByText(/este enlace es para invitar a atletas/i)
    expect(localStorage.getItem('pending_invite_token')).toBeNull()
    expect(localStorage.getItem('pending_invite_token_at')).toBeNull()
  })

  it('clicking "Ir a mi dashboard" redirects to /sessions', async () => {
    setToken()
    mockRequest.mockResolvedValue({
      status: 'already_member',
      team_id: 'team-1',
      team_name: 'Team A',
    })

    render(<AuthContinuePage />)

    const btn = await screen.findByRole('button', { name: /ir a mi dashboard/i })
    fireEvent.click(btn)

    expect(mockReplace).toHaveBeenCalledWith('/sessions')
  })
})

describe('AuthContinuePage — not_eligible', () => {
  it('shows "invite for athletes" screen when coach is on a different team', async () => {
    setToken()
    mockRequest.mockResolvedValue({
      status: 'not_eligible',
      team_id: 'team-1',
      team_name: 'FC Barcelona',
    })

    render(<AuthContinuePage />)

    await screen.findByText(/este enlace es para invitar a atletas/i)
    expect(screen.getByText(/coach/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copiar enlace/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ir a mi dashboard/i })).toBeInTheDocument()
  })

  it('clears token and timestamp from localStorage on not_eligible', async () => {
    setToken()
    mockRequest.mockResolvedValue({
      status: 'not_eligible',
      team_id: 'team-1',
      team_name: 'FC Barcelona',
    })

    render(<AuthContinuePage />)

    await screen.findByText(/este enlace es para invitar a atletas/i)
    expect(localStorage.getItem('pending_invite_token')).toBeNull()
    expect(localStorage.getItem('pending_invite_token_at')).toBeNull()
  })
})

describe('AuthContinuePage — error states', () => {
  it('shows invalid error on 404', async () => {
    const { NotFoundError } = await import('@/app/_shared/api/httpClient')
    setToken()
    mockRequest.mockRejectedValue(new NotFoundError('not found'))

    render(<AuthContinuePage />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/no es válido/i)
  })

  it('shows expired error on 410', async () => {
    const { GoneError } = await import('@/app/_shared/api/httpClient')
    setToken()
    mockRequest.mockRejectedValue(new GoneError('gone'))

    render(<AuthContinuePage />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/caducado/i)
  })

  it('shows already-used error on 409', async () => {
    const { ConflictError } = await import('@/app/_shared/api/httpClient')
    setToken()
    mockRequest.mockRejectedValue(new ConflictError('conflict'))

    render(<AuthContinuePage />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/ya ha sido utilizado/i)
  })

  it('clears token and timestamp from localStorage on error', async () => {
    const { NotFoundError } = await import('@/app/_shared/api/httpClient')
    setToken()
    mockRequest.mockRejectedValue(new NotFoundError('not found'))

    render(<AuthContinuePage />)

    await screen.findByRole('alert')
    expect(localStorage.getItem('pending_invite_token')).toBeNull()
    expect(localStorage.getItem('pending_invite_token_at')).toBeNull()
  })
})
