import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { UnauthorizedError } from '@/app/_shared/api/httpClient'
import { OnboardingHub } from './OnboardingForm'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const TOKEN_MAX_AGE_MS = 30 * 60 * 1000

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

const NO_MEMBERSHIPS = { user_id: 'u1', memberships: [], active_team_id: null }
const WITH_MEMBERSHIP = {
  user_id: 'u1',
  memberships: [{ team_id: 't1', team_name: 'FC Test', role: 'COACH' as const }],
  active_team_id: 't1',
}

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

afterEach(() => cleanup())

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OnboardingHub', () => {
  it('shows loading UI while resolving', () => {
    mockRequest.mockReturnValue(new Promise(() => {})) // never resolves
    render(<OnboardingHub />)
    expect(screen.getByText(/setting up your account/i)).toBeInTheDocument()
  })

  it('redirects to /sessions when user already has a membership', async () => {
    mockRequest.mockResolvedValue(WITH_MEMBERSHIP)
    render(<OnboardingHub />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/sessions')
    })
  })

  it('redirects to /login on UnauthorizedError', async () => {
    mockRequest.mockRejectedValue(new UnauthorizedError())
    render(<OnboardingHub />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login')
    })
  })

  describe('no memberships, valid token', () => {
    beforeEach(() => {
      mockRequest
        .mockResolvedValueOnce(NO_MEMBERSHIPS)                          // GET /v1/me
        .mockResolvedValueOnce({                                        // POST accept
          status: 'joined',
          team_id: 'team-1',
          team_name: 'FC Barcelona',
        })
      setToken()
    })

    it('accepts invite and redirects to /sessions?welcome=1', async () => {
      render(<OnboardingHub />)

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/sessions?welcome=1')
      })
      expect(sessionStorage.getItem('welcome_team_name')).toBe('FC Barcelona')
      expect(localStorage.getItem('pending_invite_token')).toBeNull()
    })

    it('passes display_name from user metadata', async () => {
      render(<OnboardingHub />)

      await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(2))

      const [url, opts] = mockRequest.mock.calls[1] as [string, RequestInit & { body: string }]
      expect(url).toContain('invite-token-abc')
      expect(JSON.parse(opts.body)).toMatchObject({ display_name: 'Alice' })
    })
  })

  describe('no memberships, valid token, accept fails', () => {
    it('clears token and redirects to /create-team on 404', async () => {
      const { NotFoundError } = await import('@/app/_shared/api/httpClient')
      setToken()
      mockRequest
        .mockResolvedValueOnce(NO_MEMBERSHIPS)
        .mockRejectedValueOnce(new NotFoundError('not found'))

      render(<OnboardingHub />)

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/create-team')
      })
      expect(localStorage.getItem('pending_invite_token')).toBeNull()
    })

    it('redirects to /sessions on 409 (invite already used)', async () => {
      const { ConflictError } = await import('@/app/_shared/api/httpClient')
      setToken()
      mockRequest
        .mockResolvedValueOnce(NO_MEMBERSHIPS)
        .mockRejectedValueOnce(new ConflictError('conflict'))

      render(<OnboardingHub />)

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/sessions')
      })
      expect(localStorage.getItem('pending_invite_token')).toBeNull()
    })
  })

  it('redirects to /create-team when token has no timestamp (stale)', async () => {
    localStorage.setItem('pending_invite_token', 'stale-token')
    // no pending_invite_token_at
    mockRequest.mockResolvedValue(NO_MEMBERSHIPS)

    render(<OnboardingHub />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/create-team')
    })
    expect(localStorage.getItem('pending_invite_token')).toBeNull()
  })

  it('redirects to /create-team when token is expired', async () => {
    setToken('old-token', TOKEN_MAX_AGE_MS + 1)
    mockRequest.mockResolvedValue(NO_MEMBERSHIPS)

    render(<OnboardingHub />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/create-team')
    })
    expect(localStorage.getItem('pending_invite_token')).toBeNull()
  })

  it('redirects to /create-team when no token is present', async () => {
    mockRequest.mockResolvedValue(NO_MEMBERSHIPS)

    render(<OnboardingHub />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/create-team')
    })
  })

  it('unexpected error on /v1/me redirects to /create-team', async () => {
    mockRequest.mockRejectedValue(new Error('network error'))

    render(<OnboardingHub />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/create-team')
    })
  })
})
