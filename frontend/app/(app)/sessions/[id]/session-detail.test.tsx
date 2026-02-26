import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import SessionDetailPage from './page'

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const pendingSession = {
  id: 'session-uuid-001',
  status: 'pending',
  workout_template_id: 'wt-1',
  athlete_profile_id: 'ap-1',
  scheduled_for: '2026-02-25',
  logs: [],
}

const completedSession = {
  ...pendingSession,
  status: 'completed',
}

const sessionWithLogs = {
  ...pendingSession,
  logs: [
    {
      log_id: 'log-1',
      block_name: 'Primary Strength',
      exercise_id: 'ex-uuid-abc123',
      notes: 'Felt strong',
      entries: [
        { set_number: 1, reps: 5, weight: 100, rpe: 8 },
        { set_number: 2, reps: 5, weight: 100, rpe: 8.5 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
  mockPush.mockReset()
  mockReplace.mockReset()
})

describe('SessionDetailPage', () => {
  describe('loading and rendering', () => {
    it('shows a loading indicator while fetching', () => {
      mockRequest.mockReturnValue(new Promise(() => {}))
      render(<SessionDetailPage />)
      expect(screen.getByText(/loading/i)).toBeInTheDocument()
    })

    it('renders session status as Pending', async () => {
      mockRequest.mockResolvedValue(pendingSession)
      render(<SessionDetailPage />)
      expect(await screen.findByText('Pending')).toBeInTheDocument()
    })

    it('renders session status as Completed', async () => {
      mockRequest.mockResolvedValue(completedSession)
      render(<SessionDetailPage />)
      expect(await screen.findByText('Completed')).toBeInTheDocument()
    })

    it('renders scheduled_for date', async () => {
      mockRequest.mockResolvedValue(pendingSession)
      render(<SessionDetailPage />)
      expect(await screen.findByText(/Feb 25, 2026/)).toBeInTheDocument()
    })

    it('renders exercise logs when present', async () => {
      mockRequest.mockResolvedValue(sessionWithLogs)
      render(<SessionDetailPage />)
      // Target the log block heading specifically (not the dropdown option)
      expect(await screen.findByRole('heading', { name: 'Primary Strength' })).toBeInTheDocument()
      expect(screen.getByText('Felt strong')).toBeInTheDocument()
      // Header row + 2 data rows
      expect(screen.getAllByRole('row').length).toBeGreaterThan(2)
    })

    it('shows "Session not found" on 404', async () => {
      const { NotFoundError } = await import('@/app/_shared/api/httpClient')
      mockRequest.mockRejectedValue(new NotFoundError())
      render(<SessionDetailPage />)
      expect(await screen.findByText(/session not found/i)).toBeInTheDocument()
    })
  })

  describe('Complete session button', () => {
    it('shows the Complete session button when status is pending', async () => {
      mockRequest.mockResolvedValue(pendingSession)
      render(<SessionDetailPage />)
      expect(await screen.findByRole('button', { name: /complete session/i })).toBeInTheDocument()
    })

    it('hides the Complete session button when status is completed', async () => {
      mockRequest.mockResolvedValue(completedSession)
      render(<SessionDetailPage />)
      await screen.findByText('Completed')
      expect(screen.queryByRole('button', { name: /complete session/i })).not.toBeInTheDocument()
    })

    it('calls PATCH /v1/workout-sessions/{id}/complete on click', async () => {
      // GET resolves with pending session; PATCH resolves successfully
      mockRequest
        .mockResolvedValueOnce(pendingSession)  // initial GET
        .mockResolvedValueOnce(undefined)        // PATCH

      render(<SessionDetailPage />)
      fireEvent.click(await screen.findByRole('button', { name: /complete session/i }))

      await waitFor(() => {
        expect(mockRequest).toHaveBeenCalledWith(
          `/v1/workout-sessions/${pendingSession.id}/complete`,
          expect.objectContaining({ method: 'PATCH' }),
        )
      })
    })

    it('optimistically updates status to Completed before PATCH resolves', async () => {
      let resolvePatch!: () => void
      const patchPromise = new Promise<void>((resolve) => { resolvePatch = resolve })

      mockRequest
        .mockResolvedValueOnce(pendingSession) // GET
        .mockReturnValueOnce(patchPromise)      // PATCH — pending

      render(<SessionDetailPage />)
      fireEvent.click(await screen.findByRole('button', { name: /complete session/i }))

      // Status should flip immediately (optimistic)
      expect(await screen.findByText('Completed')).toBeInTheDocument()

      // Resolve PATCH so the component settles cleanly
      resolvePatch()
    })

    it('reverts status to Pending when PATCH fails', async () => {
      mockRequest
        .mockResolvedValueOnce(pendingSession) // GET
        .mockRejectedValueOnce(new Error('server error')) // PATCH fails

      render(<SessionDetailPage />)
      fireEvent.click(await screen.findByRole('button', { name: /complete session/i }))

      // After failure the status should revert
      await waitFor(() => {
        expect(screen.getByText('Pending')).toBeInTheDocument()
      })
    })
  })

  describe('Add log form visibility', () => {
    it('shows AddLogForm when session is pending', async () => {
      mockRequest.mockResolvedValue(pendingSession)
      render(<SessionDetailPage />)
      expect(await screen.findByText(/add exercise log/i)).toBeInTheDocument()
    })

    it('hides AddLogForm when session is completed', async () => {
      mockRequest.mockResolvedValue(completedSession)
      render(<SessionDetailPage />)
      await screen.findByText('Completed')
      expect(screen.queryByText(/add exercise log/i)).not.toBeInTheDocument()
    })
  })
})
