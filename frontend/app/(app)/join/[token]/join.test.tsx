/**
 * Tests for /join/[token] invite-acceptance page.
 *
 * Contract under test:
 *   404 (NotFoundError)  → "invalid" message   — token does not exist in DB
 *   410 (GoneError)      → "expired" message   — token exists but past expires_at
 *   409 (ConflictError)  → "already used"      — token was already accepted
 *   201                  → welcome screen, then redirect to /sessions
 */
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import JoinTokenPage from './page'

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
      updateUser: vi.fn().mockResolvedValue({}),
    },
  },
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ token: 'invite-token-abc' }),
  useRouter: () => ({ replace: mockReplace }),
}))

vi.mock('@/src/features/activation/postActionRedirect', () => ({
  getPostActionRedirect: () => '/sessions',
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_WITH_NAME = { data: { user: { user_metadata: { name: 'Alice' } } } }
const USER_NO_NAME   = { data: { user: { user_metadata: {} } } }
const MEMBERSHIP     = { team_id: 'team-1', membership_id: 'mem-1', role: 'ATHLETE' }

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
  mockReplace.mockReset()
  mockGetUser.mockReset()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JoinTokenPage — happy path', () => {
  it('auto-joins and shows welcome screen when user already has a name', async () => {
    mockGetUser.mockResolvedValue(USER_WITH_NAME)
    mockRequest.mockResolvedValue(MEMBERSHIP)

    render(<JoinTokenPage />)

    await screen.findByText(/welcome to the team/i)
    expect(screen.getByText(/taking you to your sessions/i)).toBeInTheDocument()
  })

  it('shows name form when user has no display name', async () => {
    mockGetUser.mockResolvedValue(USER_NO_NAME)

    render(<JoinTokenPage />)

    await screen.findByLabelText(/your name/i)
    expect(screen.getByRole('button', { name: /^join team$/i })).toBeInTheDocument()
  })
})

describe('JoinTokenPage — error states', () => {
  it('shows "invalid" message on 404 (token not found)', async () => {
    const { NotFoundError } = await import('@/app/_shared/api/httpClient')
    mockGetUser.mockResolvedValue(USER_WITH_NAME)
    mockRequest.mockRejectedValue(new NotFoundError('Invite not found'))

    render(<JoinTokenPage />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/invalid/i)
    expect(alert).toHaveTextContent(/ask your coach/i)
  })

  it('shows "expired" message on 410 (GoneError)', async () => {
    const { GoneError } = await import('@/app/_shared/api/httpClient')
    mockGetUser.mockResolvedValue(USER_WITH_NAME)
    mockRequest.mockRejectedValue(new GoneError('Invite has expired'))

    render(<JoinTokenPage />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/expired/i)
    expect(alert).toHaveTextContent(/ask your coach/i)
  })

  it('shows "already used" message on 409 (ConflictError)', async () => {
    const { ConflictError } = await import('@/app/_shared/api/httpClient')
    mockGetUser.mockResolvedValue(USER_WITH_NAME)
    mockRequest.mockRejectedValue(new ConflictError('Invite already used'))

    render(<JoinTokenPage />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/already been used/i)
  })

  it('does NOT show "expired" message on 404 (different messages)', async () => {
    const { NotFoundError } = await import('@/app/_shared/api/httpClient')
    mockGetUser.mockResolvedValue(USER_WITH_NAME)
    mockRequest.mockRejectedValue(new NotFoundError('Invite not found'))

    render(<JoinTokenPage />)

    const alert = await screen.findByRole('alert')
    // 404 must say "invalid", not "expired" (404 ≠ 410)
    expect(alert).not.toHaveTextContent(/expired/i)
  })

  it('shows "coaches cannot join" message on 403 (ForbiddenError)', async () => {
    const { ForbiddenError } = await import('@/app/_shared/api/httpClient')
    mockGetUser.mockResolvedValue(USER_WITH_NAME)
    mockRequest.mockRejectedValue(new ForbiddenError('Coaches cannot join teams via athlete invite links.'))

    render(<JoinTokenPage />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/coaches cannot join/i)
  })
})
