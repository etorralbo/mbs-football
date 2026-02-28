import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import type { WorkoutSessionDetail, SessionExecution } from '@/app/_shared/api/types'
import SessionDetailPage from './page'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockRequest, mockPush } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockPush: vi.fn(),
}))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = await importOriginal() as object
  return { ...actual, request: mockRequest }
})

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'sess-1' }),
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_SESSION_PENDING: WorkoutSessionDetail = {
  id: 'sess-1',
  status: 'pending',
  workout_template_id: 'tpl-1',
  template_title: 'Power Session',
  athlete_profile_id: 'ath-1',
  scheduled_for: null,
  logs: [],
}

const MOCK_SESSION_COMPLETED: WorkoutSessionDetail = {
  ...MOCK_SESSION_PENDING,
  status: 'completed',
}

const EMPTY_EXECUTION: SessionExecution = {
  session_id: 'sess-1',
  status: 'pending',
  workout_template_id: 'tpl-1',
  blocks: [],
}

const LOGGED_EXECUTION: SessionExecution = {
  ...EMPTY_EXECUTION,
  blocks: [{
    name: 'Primary Strength', key: 'PRIMARY_STRENGTH', order: 0,
    items: [{
      exercise_id: 'ex-1', exercise_name: 'Squat', prescription: {},
      logs: [{ set_number: 1, reps: 5, weight: 100, rpe: 8, done: true }],
    }],
  }],
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
  mockPush.mockReset()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionDetailPage — Mark as completed', () => {
  it('renders "Mark as completed" button when session is pending', async () => {
    mockRequest
      .mockResolvedValueOnce(MOCK_SESSION_PENDING)
      .mockResolvedValueOnce(EMPTY_EXECUTION)

    render(<SessionDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /mark as completed/i })).toBeInTheDocument()
    })
  })

  it('does not render complete button when session is already completed', async () => {
    mockRequest
      .mockResolvedValueOnce(MOCK_SESSION_COMPLETED)
      .mockResolvedValueOnce({ ...EMPTY_EXECUTION, status: 'completed' })

    render(<SessionDetailPage />)

    // Wait for the heading specifically (not the breadcrumb span which also shows the title)
    await screen.findByRole('heading', { name: 'Power Session' })
    expect(screen.queryByRole('button', { name: /mark as completed/i })).toBeNull()
  })

  it('calls PATCH /complete and redirects to /sessions on success', async () => {
    mockRequest
      .mockResolvedValueOnce(MOCK_SESSION_PENDING) // GET detail
      .mockResolvedValueOnce(LOGGED_EXECUTION)     // GET execution (has done sets → CTA enabled)
      .mockResolvedValueOnce(undefined)            // PATCH complete (204)

    render(<SessionDetailPage />)

    // Wait for button to appear AND be enabled (requires execution to load + draft hydrated)
    const btn = await screen.findByRole('button', { name: /mark as completed/i })
    await waitFor(() => expect(btn).not.toBeDisabled())
    fireEvent.click(btn)

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        '/v1/workout-sessions/sess-1/complete',
        { method: 'PATCH' },
      )
      expect(mockPush).toHaveBeenCalledWith('/sessions')
    })
  })

  it('shows inline error and does not redirect when PATCH fails', async () => {
    mockRequest
      .mockResolvedValueOnce(MOCK_SESSION_PENDING)
      .mockResolvedValueOnce(LOGGED_EXECUTION)
      .mockRejectedValueOnce(new Error('network error'))

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
