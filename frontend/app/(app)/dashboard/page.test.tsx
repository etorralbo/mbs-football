import { render, screen, cleanup, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockRequest, mockReplace } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockReplace: vi.fn(),
}))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = (await importOriginal()) as object
  return { ...actual, request: mockRequest }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

vi.mock('@/src/features/activation/useActivationState', () => ({
  useActivationState: vi.fn(),
}))

import { useActivationState } from '@/src/features/activation/useActivationState'
import DashboardPage from './page'

const mockActivation = vi.mocked(useActivationState)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function futureStr(days = 3): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function pastStr(days = 3): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const COACH_STATE = {
  isLoading: false,
  error: null,
  role: 'COACH' as const,
  steps: [],
  nextAction: null,
}

const ATHLETE_STATE = {
  isLoading: false,
  error: null,
  role: 'ATHLETE' as const,
  steps: [],
  nextAction: null,
}

const SESSION_TODAY = {
  id: 'sess-today',
  assignment_id: 'a-1',
  athlete_id: 'ath-1',
  athlete_name: 'Alice',
  workout_template_id: 'tpl-1',
  template_title: 'Strength A',
  scheduled_for: todayStr(),
  completed_at: null,
  cancelled_at: null,
  exercise_count: 6,
  exercises_logged_count: 0,
}

const SESSION_UPCOMING = {
  ...SESSION_TODAY,
  id: 'sess-up',
  athlete_name: 'Bob',
  template_title: 'Speed Work',
  scheduled_for: futureStr(2),
}

const SESSION_OVERDUE = {
  ...SESSION_TODAY,
  id: 'sess-overdue',
  athlete_name: 'Charlie',
  template_title: 'Recovery',
  scheduled_for: pastStr(2),
}

const SESSION_COMPLETED = {
  ...SESSION_TODAY,
  id: 'sess-done',
  athlete_name: 'Diana',
  template_title: 'Power',
  completed_at: '2026-03-05T10:00:00Z',
}

const SESSION_COMPLETED_THIS_WEEK = {
  ...SESSION_TODAY,
  id: 'sess-week',
  athlete_name: 'Eve',
  template_title: 'Agility',
  completed_at: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupCoach(sessions: unknown[] = []) {
  mockActivation.mockReturnValue(COACH_STATE)
  mockRequest.mockResolvedValue(sessions)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.clearAllMocks()
  cleanup()
})

describe('DashboardPage — coach access', () => {
  it('renders KPI cards with correct counts', async () => {
    setupCoach([
      SESSION_TODAY,
      SESSION_UPCOMING,
      SESSION_OVERDUE,
      SESSION_COMPLETED_THIS_WEEK,
    ])

    render(<DashboardPage />)

    await waitFor(() => {
      expect(within(screen.getByTestId('kpi-today')).getByText('1')).toBeInTheDocument()
    })

    expect(within(screen.getByTestId('kpi-upcoming')).getByText('1')).toBeInTheDocument()
    expect(within(screen.getByTestId('kpi-overdue')).getByText('1')).toBeInTheDocument()
  })

  it('renders upcoming sessions section with next 5', async () => {
    const sessions = [
      SESSION_TODAY,
      SESSION_UPCOMING,
      { ...SESSION_UPCOMING, id: 'sess-up2', template_title: 'Sprint', scheduled_for: futureStr(4) },
    ]
    setupCoach(sessions)

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Strength A')).toBeInTheDocument()
    })
    expect(screen.getByText('Speed Work')).toBeInTheDocument()
    expect(screen.getByText('Sprint')).toBeInTheDocument()
  })

  it('renders quick action links', async () => {
    setupCoach([])

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /new template/i })).toHaveAttribute('href', '/templates')
    })
    expect(screen.getByRole('link', { name: /new exercise/i })).toHaveAttribute('href', '/exercises')
    expect(screen.getByRole('link', { name: /manage team/i })).toHaveAttribute('href', '/team')
    expect(screen.getByRole('link', { name: /view sessions/i })).toHaveAttribute('href', '/sessions')
  })

  it('shows overdue attention alert when overdue sessions exist', async () => {
    setupCoach([SESSION_OVERDUE])

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText(/overdue session/i)).toBeInTheDocument()
    })
  })
})

describe('DashboardPage — athlete redirect', () => {
  it('redirects athlete to /sessions', async () => {
    mockActivation.mockReturnValue(ATHLETE_STATE)
    mockRequest.mockResolvedValue([])

    render(<DashboardPage />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/sessions')
    })
  })
})

describe('DashboardPage — empty state', () => {
  it('shows empty state message when no sessions', async () => {
    setupCoach([])

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument()
    })
  })
})
