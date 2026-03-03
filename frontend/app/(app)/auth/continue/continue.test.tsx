/**
 * Tests for /auth/continue page.
 *
 * Contract:
 *   no pending token             → redirect to /sessions
 *   joined                       → clear token, redirect to /sessions?welcome=<team>
 *   already_member               → show "already member" screen + buttons
 *   404 (NotFoundError)          → error: "no es válido"
 *   410 (GoneError)              → error: "caducado"
 *   409 (ConflictError)          → error: "ya ha sido utilizado"
 *   403 (ForbiddenError)         → error: "para atletas"
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

function setToken(token = 'invite-token-abc') {
  localStorage.setItem('pending_invite_token', token)
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
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
})

describe('AuthContinuePage — joined', () => {
  it('calls accept endpoint and redirects to /sessions?welcome=TeamName', async () => {
    setToken()
    mockRequest.mockResolvedValue({
      status: 'joined',
      team_id: 'team-1',
      team_name: 'FC Barcelona',
    })

    render(<AuthContinuePage />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        '/sessions?welcome=FC%20Barcelona',
      )
    })

    expect(localStorage.getItem('pending_invite_token')).toBeNull()
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

  it('clears token from localStorage on already_member', async () => {
    setToken()
    mockRequest.mockResolvedValue({
      status: 'already_member',
      team_id: 'team-1',
      team_name: 'Team A',
    })

    render(<AuthContinuePage />)

    await screen.findByText(/este enlace es para invitar a atletas/i)
    expect(localStorage.getItem('pending_invite_token')).toBeNull()
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

  it('shows athletes-only error on 403', async () => {
    const { ForbiddenError } = await import('@/app/_shared/api/httpClient')
    setToken()
    mockRequest.mockRejectedValue(new ForbiddenError('forbidden'))

    render(<AuthContinuePage />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/para atletas/i)
  })

  it('clears token from localStorage on error', async () => {
    const { NotFoundError } = await import('@/app/_shared/api/httpClient')
    setToken()
    mockRequest.mockRejectedValue(new NotFoundError('not found'))

    render(<AuthContinuePage />)

    await screen.findByRole('alert')
    expect(localStorage.getItem('pending_invite_token')).toBeNull()
  })
})
