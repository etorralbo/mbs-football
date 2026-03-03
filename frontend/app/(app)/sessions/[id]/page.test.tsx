import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import type { SessionExecution } from '@/app/_shared/api/types'
import SessionDetailPage from './page'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockRequest, mockPush, mockReplace, mockUseAuth } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockUseAuth: vi.fn(),
}))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = await importOriginal() as object
  return { ...actual, request: mockRequest }
})

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'sess-1' }),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

vi.mock('@/src/shared/auth/AuthContext', () => ({ useAuth: mockUseAuth }))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_EXECUTION: SessionExecution = {
  session_id: 'sess-1',
  status: 'pending',
  workout_template_id: 'tpl-1',
  template_title: 'Power Session',
  athlete_profile_id: 'ath-1',
  scheduled_for: null,
  blocks: [],
}

const COMPLETED_EXECUTION: SessionExecution = {
  ...EMPTY_EXECUTION,
  status: 'completed',
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

// Execution with an exercise that has no logs yet — draft.done stays false,
// so inputs are not disabled by the done-state guard in SetRow.
const UNDONE_EXECUTION: SessionExecution = {
  ...EMPTY_EXECUTION,
  blocks: [{
    name: 'Primary Strength', key: 'PRIMARY_STRENGTH', order: 0,
    items: [{
      exercise_id: 'ex-1', exercise_name: 'Squat', prescription: {},
      logs: [],
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
  mockReplace.mockReset()
  mockUseAuth.mockReset()
})

// Default: viewer is an athlete (existing tests unchanged)
beforeEach(() => {
  mockUseAuth.mockReturnValue({ role: 'ATHLETE', loading: false })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionDetailPage — Mark as completed', () => {
  it('renders "Mark as completed" button when session is pending', async () => {
    mockRequest.mockResolvedValueOnce(EMPTY_EXECUTION)

    render(<SessionDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /mark as completed/i })).toBeInTheDocument()
    })
  })

  it('does not render complete button when session is already completed', async () => {
    mockRequest.mockResolvedValueOnce(COMPLETED_EXECUTION)

    render(<SessionDetailPage />)

    await screen.findByRole('heading', { name: 'Power Session' })
    expect(screen.queryByRole('button', { name: /mark as completed/i })).toBeNull()
  })

  it('calls PATCH /complete and redirects to /sessions on success', async () => {
    mockRequest
      .mockResolvedValueOnce(LOGGED_EXECUTION)  // GET /execution (has done sets → CTA enabled)
      .mockResolvedValueOnce(undefined)          // PATCH complete (204)

    render(<SessionDetailPage />)

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

describe('SessionDetailPage — COACH role', () => {
  it('hides CompletionBar when viewer is COACH and session is pending', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce(EMPTY_EXECUTION)

    render(<SessionDetailPage />)

    await screen.findByRole('heading', { name: 'Power Session' })
    expect(screen.queryByRole('button', { name: /mark as completed/i })).toBeNull()
  })

  it('hides CompletionBar when viewer is COACH and session is completed', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce(COMPLETED_EXECUTION)

    render(<SessionDetailPage />)

    await screen.findByRole('heading', { name: 'Power Session' })
    expect(screen.queryByRole('button', { name: /mark as completed/i })).toBeNull()
  })

  it('enables set inputs when viewer is COACH and session is pending', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce(UNDONE_EXECUTION)

    render(<SessionDetailPage />)

    await screen.findByText('Squat')
    screen.getAllByRole('spinbutton').forEach((input) =>
      expect(input).not.toBeDisabled(),
    )
  })

  it('disables set inputs when viewer is COACH and session is completed', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce({ ...LOGGED_EXECUTION, status: 'completed' })

    render(<SessionDetailPage />)

    await screen.findByText('Squat')
    screen.getAllByRole('spinbutton').forEach((input) =>
      expect(input).toBeDisabled(),
    )
  })

  it('hides Undo button when viewer is COACH and exercise is done', async () => {
    mockUseAuth.mockReturnValue({ role: 'COACH', loading: false })
    mockRequest.mockResolvedValueOnce(LOGGED_EXECUTION) // sets done: true

    render(<SessionDetailPage />)

    await screen.findByText('Squat')
    expect(screen.queryByRole('button', { name: /undo squat/i })).toBeNull()
  })
})
