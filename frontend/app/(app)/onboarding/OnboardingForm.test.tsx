import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { ValidationError } from '@/app/_shared/api/httpClient'
import { OnboardingForm } from './OnboardingForm'

// ---------------------------------------------------------------------------
// Module mocks — vi.hoisted ensures these are defined before vi.mock runs
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

function fillAndSubmit(teamName: string) {
  fireEvent.change(screen.getByRole('textbox', { name: /team name/i }), {
    target: { value: teamName },
  })
  fireEvent.click(screen.getByRole('button', { name: /create team/i }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
  mockPush.mockReset()
  mockReplace.mockReset()
})

describe('OnboardingForm', () => {
  describe('successful submission', () => {
    beforeEach(() => {
      mockRequest.mockResolvedValue({ id: 'u1', team_id: 't1', role: 'coach' })
    })

    it('calls POST /v1/onboarding with { team_name }', async () => {
      render(<OnboardingForm />)
      fillAndSubmit('FC Test')

      await waitFor(() => {
        expect(mockRequest).toHaveBeenCalledWith(
          '/v1/onboarding',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ team_name: 'FC Test' }),
          }),
        )
      })
    })

    it('trims whitespace from the team name before submitting', async () => {
      render(<OnboardingForm />)
      fillAndSubmit('  Whitespace FC  ')

      await waitFor(() => {
        expect(mockRequest).toHaveBeenCalledWith(
          '/v1/onboarding',
          expect.objectContaining({ body: JSON.stringify({ team_name: 'Whitespace FC' }) }),
        )
      })
    })

    it('redirects to /templates on success', async () => {
      render(<OnboardingForm />)
      fillAndSubmit('FC Test')

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/templates')
      })
    })
  })

  describe('error handling', () => {
    it('shows a generic error message when the server fails', async () => {
      mockRequest.mockRejectedValue(new Error('network error'))
      render(<OnboardingForm />)
      fillAndSubmit('FC Test')

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
      })
    })

    it('shows a friendly message on 422 ValidationError with array detail', async () => {
      mockRequest.mockRejectedValue(new ValidationError([{ msg: 'too short' }]))
      render(<OnboardingForm />)
      fillAndSubmit('FC Test')

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Please check the team name.')
      })
    })

    it('shows the server message on 422 ValidationError with string detail', async () => {
      mockRequest.mockRejectedValue(new ValidationError('Team name already taken'))
      render(<OnboardingForm />)
      fillAndSubmit('FC Test')

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Team name already taken')
      })
    })

    it('redirects to /login on UnauthorizedError', async () => {
      const { UnauthorizedError: Err } = await import('@/app/_shared/api/httpClient')
      mockRequest.mockRejectedValue(new Err())
      render(<OnboardingForm />)
      fillAndSubmit('FC Test')

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/login')
      })
    })
  })

  describe('submit guard', () => {
    it('does not call the API when the team name is blank', () => {
      render(<OnboardingForm />)
      fireEvent.click(screen.getByRole('button', { name: /create team/i }))
      expect(mockRequest).not.toHaveBeenCalled()
    })

    it('disables the button when the input is empty', () => {
      render(<OnboardingForm />)
      expect(screen.getByRole('button', { name: /create team/i })).toBeDisabled()
    })
  })
})
