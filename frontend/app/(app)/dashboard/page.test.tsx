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

const ITEM_OVERDUE = {
  id: 'sess-overdue',
  athlete_id: 'ath-1',
  workout_template_id: 'tpl-1',
  athlete_name: 'Charlie',
  template_title: 'Recovery',
  scheduled_for: pastStr(2),
  exercise_count: 4,
  exercises_logged_count: 0,
}

const ITEM_TODAY = {
  id: 'sess-today',
  athlete_id: 'ath-2',
  workout_template_id: 'tpl-2',
  athlete_name: 'Alice',
  template_title: 'Strength A',
  scheduled_for: todayStr(),
  exercise_count: 6,
  exercises_logged_count: 0,
}

const ITEM_STALE = {
  id: 'sess-stale',
  athlete_id: 'ath-3',
  workout_template_id: 'tpl-3',
  athlete_name: 'Bob',
  template_title: 'Speed Work',
  scheduled_for: futureStr(2),
  exercise_count: 5,
  exercises_logged_count: 2,
}

const EMPTY_QUEUE = {
  overdue: [],
  due_today: [],
  stale: [],
  summary: { total_overdue: 0, total_due_today: 0, total_stale: 0 },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupCoach(queue = EMPTY_QUEUE) {
  mockActivation.mockReturnValue(COACH_STATE)
  mockRequest.mockResolvedValue(queue)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.clearAllMocks()
  cleanup()
})

describe('DashboardPage — coach access', () => {
  it('renders three attention sections', async () => {
    setupCoach()
    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /overdue sessions/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('region', { name: /due today/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /stale in-progress/i })).toBeInTheDocument()
  })

  it('renders quick action links', async () => {
    setupCoach()
    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /new template/i })).toHaveAttribute('href', '/templates')
    })
    expect(screen.getByRole('link', { name: /new exercise/i })).toHaveAttribute('href', '/exercises')
    expect(screen.getByRole('link', { name: /manage team/i })).toHaveAttribute('href', '/team')
    expect(screen.getByRole('link', { name: /view sessions/i })).toHaveAttribute('href', '/sessions')
  })
})

describe('DashboardPage — attention sections', () => {
  it('shows overdue session in overdue section', async () => {
    setupCoach({ ...EMPTY_QUEUE, overdue: [ITEM_OVERDUE], summary: { total_overdue: 1, total_due_today: 0, total_stale: 0 } })
    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Recovery')).toBeInTheDocument()
    })
    expect(screen.getByText(/Charlie/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view →/i })).toHaveAttribute('href', '/sessions/sess-overdue')
  })

  it('shows due-today session in due today section', async () => {
    setupCoach({ ...EMPTY_QUEUE, due_today: [ITEM_TODAY], summary: { total_overdue: 0, total_due_today: 1, total_stale: 0 } })
    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Strength A')).toBeInTheDocument()
    })
    expect(screen.getByText(/Alice/)).toBeInTheDocument()
  })

  it('shows stale session in stale section', async () => {
    setupCoach({ ...EMPTY_QUEUE, stale: [ITEM_STALE], summary: { total_overdue: 0, total_due_today: 0, total_stale: 1 } })
    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Speed Work')).toBeInTheDocument()
    })
    expect(screen.getByText(/Bob/)).toBeInTheDocument()
  })

  it('shows empty-state messages for each empty section', async () => {
    setupCoach()
    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText(/no overdue sessions/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/nothing due today/i)).toBeInTheDocument()
    expect(screen.getByText(/no stale sessions/i)).toBeInTheDocument()
  })

  it('shows "nothing needs attention" when all sections are empty', async () => {
    setupCoach()
    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText(/nothing needs attention right now/i)).toBeInTheDocument()
    })
  })
})

describe('DashboardPage — summary cards', () => {
  it('summary cards reflect counts from the queue', async () => {
    const queue = {
      overdue: [ITEM_OVERDUE],
      due_today: [ITEM_TODAY],
      stale: [],
      summary: { total_overdue: 1, total_due_today: 1, total_stale: 0 },
    }
    setupCoach(queue)
    render(<DashboardPage />)

    await waitFor(() => {
      expect(within(screen.getByTestId('summary-overdue')).getByText('1')).toBeInTheDocument()
    })
    expect(within(screen.getByTestId('summary-due-today')).getByText('1')).toBeInTheDocument()
    expect(within(screen.getByTestId('summary-stale')).getByText('0')).toBeInTheDocument()
  })
})

describe('DashboardPage — athlete redirect', () => {
  it('redirects athlete to /sessions', async () => {
    mockActivation.mockReturnValue(ATHLETE_STATE)
    mockRequest.mockResolvedValue(EMPTY_QUEUE)

    render(<DashboardPage />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/sessions')
    })
  })
})
