import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import SessionDetailPage from './page'
import type { SessionExecution } from '@/app/_shared/api/types'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockRequest, mockPush, mockReplace, mockParams } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockParams: { id: 'session-uuid-001' },
}))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = await importOriginal() as object
  return { ...actual, request: mockRequest }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useParams: () => mockParams,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_EXECUTION: SessionExecution = {
  session_id: 'session-uuid-001',
  status: 'pending',
  workout_template_id: 'wt-1',
  template_title: 'Power Session',
  athlete_profile_id: 'ap-1',
  scheduled_for: '2026-02-25',
  blocks: [],
}

const COMPLETED_EXECUTION: SessionExecution = {
  ...EMPTY_EXECUTION,
  status: 'completed',
}

// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
  mockPush.mockReset()
  mockReplace.mockReset()
})

// ---------------------------------------------------------------------------

describe('SessionDetailPage', () => {
  describe('loading and rendering', () => {
    it('shows a loading indicator while fetching', () => {
      mockRequest.mockReturnValue(new Promise(() => {}))
      render(<SessionDetailPage />)
      expect(screen.getByText(/loading/i)).toBeInTheDocument()
    })

    it('renders session status as Pending', async () => {
      mockRequest.mockResolvedValueOnce(EMPTY_EXECUTION)
      render(<SessionDetailPage />)
      expect(await screen.findByText('Pending')).toBeInTheDocument()
    })

    it('renders session status as Completed', async () => {
      mockRequest.mockResolvedValueOnce(COMPLETED_EXECUTION)
      render(<SessionDetailPage />)
      expect(await screen.findByText('Completed')).toBeInTheDocument()
    })

    it('renders scheduled_for date', async () => {
      mockRequest.mockResolvedValueOnce(EMPTY_EXECUTION)
      render(<SessionDetailPage />)
      expect(await screen.findByText(/Feb 25, 2026/)).toBeInTheDocument()
    })

    it('shows "Session not found" on 404', async () => {
      const { NotFoundError } = await import('@/app/_shared/api/httpClient')
      mockRequest.mockRejectedValue(new NotFoundError())
      render(<SessionDetailPage />)
      expect(await screen.findByText(/session not found/i)).toBeInTheDocument()
    })
  })

  describe('Mark as completed button', () => {
    it('shows "Mark as completed" when status is pending', async () => {
      mockRequest.mockResolvedValueOnce(EMPTY_EXECUTION)
      render(<SessionDetailPage />)
      expect(await screen.findByRole('button', { name: /mark as completed/i })).toBeInTheDocument()
    })

    it('hides the button when status is completed', async () => {
      mockRequest.mockResolvedValueOnce(COMPLETED_EXECUTION)
      render(<SessionDetailPage />)
      await screen.findByText('Completed')
      expect(screen.queryByRole('button', { name: /mark as completed/i })).not.toBeInTheDocument()
    })

    it('calls PATCH /v1/workout-sessions/{id}/complete and redirects to /sessions', async () => {
      const LOGGED_EXEC: SessionExecution = { ...EMPTY_EXECUTION, blocks: [
        {
          name: 'Primary Strength', key: 'PRIMARY_STRENGTH', order: 0,
          items: [{
            exercise_id: 'ex-1', exercise_name: 'Squat', prescription: {},
            logs: [{ set_number: 1, reps: 5, weight: 100, rpe: 8, done: true }],
          }],
        },
      ]}

      mockRequest
        .mockResolvedValueOnce(LOGGED_EXEC)
        .mockResolvedValueOnce(undefined) // PATCH 204

      render(<SessionDetailPage />)
      const btn = await screen.findByRole('button', { name: /mark as completed/i })
      // Wait until draft hydrated (done sets → button enabled)
      await waitFor(() => expect(btn).not.toBeDisabled())
      fireEvent.click(btn)

      await waitFor(() => {
        expect(mockRequest).toHaveBeenCalledWith(
          `/v1/workout-sessions/${EMPTY_EXECUTION.session_id}/complete`,
          expect.objectContaining({ method: 'PATCH' }),
        )
        expect(mockPush).toHaveBeenCalledWith('/sessions')
      })
    })

    it('shows inline error and does not redirect when PATCH fails', async () => {
      const LOGGED_EXEC: SessionExecution = { ...EMPTY_EXECUTION, blocks: [
        {
          name: 'Primary Strength', key: 'PRIMARY_STRENGTH', order: 0,
          items: [{
            exercise_id: 'ex-1', exercise_name: 'Squat', prescription: {},
            logs: [{ set_number: 1, reps: 5, weight: 100, rpe: 8, done: true }],
          }],
        },
      ]}

      mockRequest
        .mockResolvedValueOnce(LOGGED_EXEC)
        .mockRejectedValueOnce(new Error('server error'))

      render(<SessionDetailPage />)
      const btn = await screen.findByRole('button', { name: /mark as completed/i })
      await waitFor(() => expect(btn).not.toBeDisabled())
      fireEvent.click(btn)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/failed to complete/i)
      })
      expect(mockPush).not.toHaveBeenCalled()
    })
  })
})
