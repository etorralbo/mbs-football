/**
 * Tests for /join?token=... page.
 *
 * Contract:
 *   ?token=XYZ → saves token + timestamp to localStorage, redirects to /auth/continue
 *   no token   → shows "Missing invite token" error
 */
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockReplace, mockSearchParamsGet } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockSearchParamsGet: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({ get: mockSearchParamsGet }),
}))

afterEach(() => {
  cleanup()
  mockReplace.mockReset()
  mockSearchParamsGet.mockReset()
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JoinPage — with token', () => {
  it('saves token to localStorage and redirects to /auth/continue', async () => {
    const validToken = 'abcdefghijklmnopqrstu' // >= 20 chars
    mockSearchParamsGet.mockImplementation((key: string) =>
      key === 'token' ? validToken : null,
    )

    const { default: JoinPage } = await import('./page')
    render(<JoinPage />)

    await waitFor(() => {
      expect(localStorage.getItem('pending_invite_token')).toBe(validToken)
      expect(mockReplace).toHaveBeenCalledWith('/auth/continue')
    })
  })

  it('saves a creation timestamp alongside the token', async () => {
    const validToken = 'abcdefghijklmnopqrstu' // >= 20 chars
    mockSearchParamsGet.mockImplementation((key: string) =>
      key === 'token' ? validToken : null,
    )

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

describe('JoinPage — no token', () => {
  it('shows missing token error when no token param', async () => {
    mockSearchParamsGet.mockReturnValue(null)

    const { default: JoinPage } = await import('./page')
    render(<JoinPage />)

    expect(screen.getByText(/missing invite token/i)).toBeInTheDocument()
    expect(mockReplace).not.toHaveBeenCalled()
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
