import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import type { WorkoutSessionDetail } from '@/app/_shared/api/types'
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

vi.mock('./AddLogForm', () => ({
  AddLogForm: () => null,
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
    mockRequest.mockResolvedValue(MOCK_SESSION_PENDING)

    render(<SessionDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /mark as completed/i })).toBeInTheDocument()
    })
  })

  it('does not render complete button when session is already completed', async () => {
    mockRequest.mockResolvedValue(MOCK_SESSION_COMPLETED)

    render(<SessionDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Power Session' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /mark as completed/i })).toBeNull()
  })

  it('calls PATCH /complete and redirects to /sessions on success', async () => {
    mockRequest
      .mockResolvedValueOnce(MOCK_SESSION_PENDING) // GET session detail
      .mockResolvedValueOnce(undefined)            // PATCH complete (204 no content)

    render(<SessionDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /mark as completed/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /mark as completed/i }))

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
      .mockRejectedValueOnce(new Error('network error'))

    render(<SessionDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /mark as completed/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /mark as completed/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to complete/i)
    })
    expect(mockPush).not.toHaveBeenCalled()
  })
})
