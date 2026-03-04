/**
 * Tests for /join?token=... page (public route).
 *
 * Contract:
 *   - Valid token + session    → saves token, redirects to /auth/continue
 *   - Valid token + no session → saves token, redirects to /login?next=/auth/continue
 *   - No / short token         → shows "Missing invite token" error
 */
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockReplace, mockSearchParamsGet, mockGetSession } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockSearchParamsGet: vi.fn(),
  mockGetSession: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({ get: mockSearchParamsGet }),
}))

vi.mock('@/app/_shared/auth/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
    },
  },
}))

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  cleanup()
  mockReplace.mockReset()
  mockSearchParamsGet.mockReset()
  mockGetSession.mockReset()
  localStorage.clear()
})

const VALID_TOKEN = 'abcdefghijklmnopqrstu' // >= 20 chars

// ---------------------------------------------------------------------------
// Authenticated user
// ---------------------------------------------------------------------------

describe('JoinPage — authenticated user with valid token', () => {
  it('saves token and redirects to /auth/continue', async () => {
    mockSearchParamsGet.mockImplementation((key: string) =>
      key === 'token' ? VALID_TOKEN : null,
    )
    mockGetSession.mockResolvedValue({ data: { session: { user: {} } } })

    const { default: JoinPage } = await import('./page')
    render(<JoinPage />)

    await waitFor(() => {
      expect(localStorage.getItem('pending_invite_token')).toBe(VALID_TOKEN)
      expect(mockReplace).toHaveBeenCalledWith('/auth/continue')
    })
  })

  it('saves a creation timestamp alongside the token', async () => {
    mockSearchParamsGet.mockImplementation((key: string) =>
      key === 'token' ? VALID_TOKEN : null,
    )
    mockGetSession.mockResolvedValue({ data: { session: { user: {} } } })

    const before = Date.now()
    const { default: JoinPage } = await import('./page')
    render(<JoinPage />)

    await waitFor(() => {
      const at = parseInt(localStorage.getItem('pending_invite_token_at') ?? '0', 10)
      expect(at).toBeGreaterThanOrEqual(before)
      expect(at).toBeLessThanOrEqual(Date.now())
    })
  })
})

// ---------------------------------------------------------------------------
// Unauthenticated user
// ---------------------------------------------------------------------------

describe('JoinPage — unauthenticated user with valid token', () => {
  it('saves token and redirects to /login?next=/auth/continue', async () => {
    mockSearchParamsGet.mockImplementation((key: string) =>
      key === 'token' ? VALID_TOKEN : null,
    )
    mockGetSession.mockResolvedValue({ data: { session: null } })

    const { default: JoinPage } = await import('./page')
    render(<JoinPage />)

    await waitFor(() => {
      expect(localStorage.getItem('pending_invite_token')).toBe(VALID_TOKEN)
      expect(mockReplace).toHaveBeenCalledWith('/login?next=/auth/continue')
    })
  })
})

// ---------------------------------------------------------------------------
// Invalid / missing token
// ---------------------------------------------------------------------------

describe('JoinPage — no or invalid token', () => {
  it('shows missing token error when no token param', async () => {
    mockSearchParamsGet.mockReturnValue(null)

    const { default: JoinPage } = await import('./page')
    render(<JoinPage />)

    expect(screen.getByText(/missing invite token/i)).toBeInTheDocument()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('rejects tokens shorter than 20 characters', async () => {
    mockSearchParamsGet.mockImplementation((key: string) =>
      key === 'token' ? 'short' : null,
    )

    const { default: JoinPage } = await import('./page')
    render(<JoinPage />)

    expect(screen.getByText(/missing invite token/i)).toBeInTheDocument()
    expect(localStorage.getItem('pending_invite_token')).toBeNull()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
