import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import SessionsPage from './page'

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

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
  mockPush.mockReset()
  mockReplace.mockReset()
})

describe('SessionsPage', () => {
  it('renders a loading state initially', () => {
    mockRequest.mockReturnValue(new Promise(() => {})) // never resolves
    render(<SessionsPage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders session items from the API response', async () => {
    mockRequest.mockResolvedValue([
      {
        id: 'aaaaaaaa-0000-0000-0000-000000000001',
        assignment_id: 'a1',
        athlete_id: 'p1',
        workout_template_id: 'wt1',
        template_title: 'Sprint Workout',
        scheduled_for: '2026-02-25',
        completed_at: null,
      },
      {
        id: 'bbbbbbbb-0000-0000-0000-000000000002',
        assignment_id: 'a2',
        athlete_id: 'p1',
        workout_template_id: 'wt2',
        template_title: 'Strength Day',
        scheduled_for: null,
        completed_at: '2026-02-20T10:00:00Z',
      },
    ])

    render(<SessionsPage />)

    // First session: template title + formatted scheduled date
    expect(await screen.findByText('Sprint Workout · Feb 25, 2026')).toBeInTheDocument()

    // Second session: template title only (no scheduled date)
    expect(screen.getByText('Strength Day')).toBeInTheDocument()
    expect(screen.getAllByText('Completed')[0]).toBeInTheDocument()
  })

  it('shows Pending for sessions with no completed_at', async () => {
    mockRequest.mockResolvedValue([
      {
        id: 'cccccccc-0000-0000-0000-000000000003',
        assignment_id: 'a3',
        athlete_id: 'p1',
        workout_template_id: 'wt3',
        scheduled_for: null,
        completed_at: null,
      },
    ])

    render(<SessionsPage />)

    expect(await screen.findByText('Pending')).toBeInTheDocument()
  })

  it('shows an empty state when there are no sessions', async () => {
    mockRequest.mockResolvedValue([])
    render(<SessionsPage />)
    expect(await screen.findByText(/no sessions assigned/i)).toBeInTheDocument()
  })

  it('redirects to /login on UnauthorizedError', async () => {
    const { UnauthorizedError } = await import('@/app/_shared/api/httpClient')
    mockRequest.mockRejectedValue(new UnauthorizedError())
    render(<SessionsPage />)

    await screen.findByText(/workout sessions/i)
    expect(mockReplace).toHaveBeenCalledWith('/login')
  })
})
