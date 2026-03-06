/**
 * Tests for /join?token=... page (legacy redirect).
 *
 * Contract:
 *   - Valid token       → redirects to /join/{token}
 *   - No / short token  → shows "Missing invite token" error
 */
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'

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

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  cleanup()
  mockReplace.mockReset()
  mockSearchParamsGet.mockReset()
})

const VALID_TOKEN = 'abcdefghijklmnopqrstu' // >= 20 chars

// ---------------------------------------------------------------------------
// Valid token → redirect to path-based URL
// ---------------------------------------------------------------------------

describe('JoinPage — valid token redirect', () => {
  it('redirects to /join/{token}', async () => {
    mockSearchParamsGet.mockImplementation((key: string) =>
      key === 'token' ? VALID_TOKEN : null,
    )

    const { default: JoinPage } = await import('./page')
    render(<JoinPage />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        `/join/${encodeURIComponent(VALID_TOKEN)}`,
      )
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
  })

  it('rejects tokens shorter than 20 characters', async () => {
    mockSearchParamsGet.mockImplementation((key: string) =>
      key === 'token' ? 'short' : null,
    )

    const { default: JoinPage } = await import('./page')
    render(<JoinPage />)

    expect(screen.getByText(/missing invite token/i)).toBeInTheDocument()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
