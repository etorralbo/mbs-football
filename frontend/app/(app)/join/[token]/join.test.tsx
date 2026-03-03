/**
 * Tests for /join/[token] page.
 *
 * New contract:
 *   - Saves token to localStorage as 'pending_invite_token'
 *   - Immediately redirects to /auth/continue
 *   - No API calls, no auth checks
 */
import { render, waitFor, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import JoinTokenPage from './page'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockReplace } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ token: 'invite-token-abc' }),
  useRouter: () => ({ replace: mockReplace }),
}))

afterEach(() => {
  cleanup()
  mockReplace.mockReset()
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JoinTokenPage', () => {
  it('saves token to localStorage and redirects to /auth/continue', async () => {
    render(<JoinTokenPage />)

    await waitFor(() => {
      expect(localStorage.getItem('pending_invite_token')).toBe('invite-token-abc')
      expect(mockReplace).toHaveBeenCalledWith('/auth/continue')
    })
  })

  it('saves a creation timestamp alongside the token', async () => {
    const before = Date.now()
    render(<JoinTokenPage />)

    await waitFor(() => {
      const at = parseInt(localStorage.getItem('pending_invite_token_at') ?? '0', 10)
      expect(at).toBeGreaterThanOrEqual(before)
      expect(at).toBeLessThanOrEqual(Date.now())
    })
  })

  it('shows a loading spinner while redirecting', () => {
    const { container } = render(<JoinTokenPage />)
    // The page renders a spinner (animate-spin element or aria-busy container)
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeTruthy()
  })
})
