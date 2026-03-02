import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { UnauthorizedError } from '@/app/_shared/api/httpClient'
import { OnboardingHub } from './OnboardingForm'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockRequest, mockPush, mockReplace } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = await importOriginal() as object
  return { ...actual, request: mockRequest }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
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

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
  mockPush.mockReset()
  mockReplace.mockReset()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OnboardingHub', () => {
  describe('when user already has a membership', () => {
    it('redirects to /home without rendering CTAs', async () => {
      mockRequest.mockResolvedValue(WITH_MEMBERSHIP)
      render(<OnboardingHub />)

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/home')
      })
      expect(screen.queryByText(/coach/i)).not.toBeInTheDocument()
    })
  })

  describe('when user has no membership', () => {
    beforeEach(() => {
      mockRequest.mockResolvedValue(NO_MEMBERSHIPS)
    })

    it('shows the Coach CTA', async () => {
      render(<OnboardingHub />)
      await waitFor(() => {
        expect(screen.getByText(/i'm a coach/i)).toBeInTheDocument()
      })
    })

    it('shows the Athlete CTA', async () => {
      render(<OnboardingHub />)
      await waitFor(() => {
        expect(screen.getByText(/i'm an athlete/i)).toBeInTheDocument()
      })
    })

    it('navigates to /create-team when Coach CTA is clicked', async () => {
      render(<OnboardingHub />)
      await waitFor(() => screen.getByText(/i'm a coach/i))
      fireEvent.click(screen.getByText(/i'm a coach/i).closest('button')!)
      expect(mockPush).toHaveBeenCalledWith('/create-team')
    })

    it('navigates to /join when Athlete CTA is clicked', async () => {
      render(<OnboardingHub />)
      await waitFor(() => screen.getByText(/i'm an athlete/i))
      fireEvent.click(screen.getByText(/i'm an athlete/i).closest('button')!)
      expect(mockPush).toHaveBeenCalledWith('/join')
    })
  })

  describe('error handling', () => {
    it('redirects to /login on UnauthorizedError', async () => {
      mockRequest.mockRejectedValue(new UnauthorizedError())
      render(<OnboardingHub />)
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/login')
      })
    })

    it('shows CTAs even when /v1/me returns an unexpected error', async () => {
      mockRequest.mockRejectedValue(new Error('network error'))
      render(<OnboardingHub />)
      await waitFor(() => {
        expect(screen.getByText(/i'm a coach/i)).toBeInTheDocument()
      })
    })
  })
})
