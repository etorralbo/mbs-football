import { render, screen, cleanup, within, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import type { WorkoutSessionSummary } from '@/app/_shared/api/types'
import { useActivationState } from '@/src/features/activation/useActivationState'
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
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/src/features/activation/useActivationState', () => ({
  useActivationState: vi.fn(),
}))

const mockActivation = vi.mocked(useActivationState)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ANON_STATE = { isLoading: false, error: null, role: null, steps: [], nextAction: null }
const COACH_STATE = { isLoading: false, error: null, role: 'COACH' as const, steps: [], nextAction: null }
const ATHLETE_STATE = { isLoading: false, error: null, role: 'ATHLETE' as const, steps: [], nextAction: null }

const ALICE_SESSION: WorkoutSessionSummary = {
  id: 'sess-a',
  assignment_id: 'a-1',
  athlete_id: 'ath-alice',
  athlete_name: 'Alice Johnson',
  workout_template_id: 'tpl-1',
  template_title: 'Strength Block A',
  scheduled_for: '2025-03-01',
  completed_at: null,
  cancelled_at: null,
}

const BOB_SESSION: WorkoutSessionSummary = {
  id: 'sess-b',
  assignment_id: 'a-2',
  athlete_id: 'ath-bob',
  athlete_name: 'Bob Smith',
  workout_template_id: 'tpl-2',
  template_title: 'Cardio Day',
  scheduled_for: '2025-03-02',
  completed_at: null,
  cancelled_at: null,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupCoach(sessions: WorkoutSessionSummary[]) {
  mockActivation.mockReturnValue(COACH_STATE)
  mockRequest.mockResolvedValue(sessions)
}

function setupAthlete(sessions: WorkoutSessionSummary[]) {
  mockActivation.mockReturnValue(ATHLETE_STATE)
  mockRequest.mockResolvedValue(sessions)
}

// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
  mockPush.mockReset()
  mockReplace.mockReset()
  mockActivation.mockReset()
})

// ---------------------------------------------------------------------------
// Existing tests (role-agnostic / ATHLETE defaults)
// ---------------------------------------------------------------------------

describe('SessionsPage', () => {
  it('renders a loading state initially', () => {
    mockActivation.mockReturnValue(ANON_STATE)
    mockRequest.mockReturnValue(new Promise(() => {})) // never resolves
    render(<SessionsPage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders session items from the API response', async () => {
    mockActivation.mockReturnValue(ATHLETE_STATE)
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
    // Page defaults to calendar view; switch to list to see session rows
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    // First session: template title + formatted scheduled date
    expect(await screen.findByText('Sprint Workout · Feb 25, 2026')).toBeInTheDocument()

    // Second session: template title only (no scheduled date)
    expect(screen.getByText('Strength Day')).toBeInTheDocument()
    expect(screen.getAllByText('Completed')[0]).toBeInTheDocument()
  })

  it('shows Pending for sessions with no completed_at', async () => {
    mockActivation.mockReturnValue(ATHLETE_STATE)
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
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    expect(await screen.findByText('Pending')).toBeInTheDocument()
  })

  it('shows an empty state when there are no sessions', async () => {
    mockActivation.mockReturnValue(ATHLETE_STATE)
    mockRequest.mockResolvedValue([])
    render(<SessionsPage />)
    expect(await screen.findByText(/you're all set/i)).toBeInTheDocument()
  })

  it('redirects to /login on UnauthorizedError', async () => {
    mockActivation.mockReturnValue(ANON_STATE)
    const { UnauthorizedError } = await import('@/app/_shared/api/httpClient')
    mockRequest.mockRejectedValue(new UnauthorizedError())
    render(<SessionsPage />)

    await screen.findByText(/workout sessions/i)
    expect(mockReplace).toHaveBeenCalledWith('/login')
  })
})

// ---------------------------------------------------------------------------
// COACH grouped view
// ---------------------------------------------------------------------------

describe('SessionsPage — COACH grouped view', () => {
  it('renders athlete name as a section heading', async () => {
    setupCoach([ALICE_SESSION, BOB_SESSION])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /alice johnson/i })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /bob smith/i })).toBeInTheDocument()
    })
  })

  it('places each session under the correct athlete section', async () => {
    setupCoach([ALICE_SESSION, BOB_SESSION])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))
    await waitFor(() => {
      const aliceSection = screen.getByRole('heading', { name: /alice johnson/i }).closest('section')!
      expect(within(aliceSection).getByText(/strength block a/i)).toBeInTheDocument()
      const bobSection = screen.getByRole('heading', { name: /bob smith/i }).closest('section')!
      expect(within(bobSection).getByText(/cardio day/i)).toBeInTheDocument()
    })
  })

  it('sorts groups alphabetically by athlete name', async () => {
    setupCoach([BOB_SESSION, ALICE_SESSION])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))
    await waitFor(() => {
      const headings = screen.getAllByRole('heading').map((h) => h.textContent ?? '')
      // h2 text is uppercase via CSS but textContent is the original case
      const aliceIdx = headings.findIndex((t) => /alice johnson/i.test(t))
      const bobIdx = headings.findIndex((t) => /bob smith/i.test(t))
      expect(aliceIdx).toBeGreaterThanOrEqual(0)
      expect(aliceIdx).toBeLessThan(bobIdx)
    })
  })

  it('shows athlete filter dropdown with All athletes option', async () => {
    setupCoach([ALICE_SESSION, BOB_SESSION])
    render(<SessionsPage />)
    await waitFor(() => {
      const select = screen.getByRole('combobox', { name: /filter by athlete/i })
      expect(select).toBeInTheDocument()
      expect(within(select as HTMLElement).getByText('All athletes')).toBeInTheDocument()
    })
  })

  it('filters to a single athlete when selected', async () => {
    setupCoach([ALICE_SESSION, BOB_SESSION])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))
    await waitFor(() => screen.getByRole('combobox', { name: /filter by athlete/i }))

    fireEvent.change(screen.getByRole('combobox', { name: /filter by athlete/i }), {
      target: { value: 'ath-alice' },
    })

    await waitFor(() => {
      expect(screen.getByText(/strength block a/i)).toBeInTheDocument()
      expect(screen.queryByText(/cardio day/i)).not.toBeInTheDocument()
    })
  })

  it('does not show athlete filter for ATHLETE role', async () => {
    setupAthlete([ALICE_SESSION])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))
    await waitFor(() => screen.getByText(/strength block a/i))
    expect(screen.queryByRole('combobox', { name: /filter by athlete/i })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Unassign (cancel) sessions — COACH only
// ---------------------------------------------------------------------------

const COMPLETED_SESSION: WorkoutSessionSummary = {
  ...ALICE_SESSION,
  id: 'sess-done',
  completed_at: '2025-03-01T10:00:00Z',
}

describe('SessionsPage — Unassign (calendar)', () => {
  // Calendar defaults to the current month — sessions must have a date in this month
  const now = new Date()
  const THIS_MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`
  const CAL_SESSION: WorkoutSessionSummary = { ...ALICE_SESSION, scheduled_for: THIS_MONTH }
  const CAL_COMPLETED: WorkoutSessionSummary = { ...COMPLETED_SESSION, scheduled_for: THIS_MONTH }

  it('shows unassign button for coach on pending session in calendar', async () => {
    setupCoach([CAL_SESSION])
    render(<SessionsPage />)
    expect(await screen.findByRole('button', { name: /unassign alice johnson/i })).toBeInTheDocument()
  })

  it('does not show unassign button for athlete in calendar', async () => {
    setupAthlete([CAL_SESSION])
    render(<SessionsPage />)
    await waitFor(() => screen.getByText(/strength block a/i))
    expect(screen.queryByRole('button', { name: /unassign alice johnson/i })).not.toBeInTheDocument()
  })

  it('does not show unassign button for completed session in calendar', async () => {
    setupCoach([CAL_COMPLETED])
    render(<SessionsPage />)
    await waitFor(() => screen.getByText(/strength block a/i))
    expect(screen.queryByRole('button', { name: /unassign/i })).not.toBeInTheDocument()
  })

  it('opens confirmation dialog from calendar unassign button', async () => {
    setupCoach([CAL_SESSION])
    render(<SessionsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /unassign alice johnson/i }))

    expect(screen.getByRole('dialog', { name: /confirm unassign/i })).toBeInTheDocument()
    expect(screen.getByText(/the athlete will no longer see this session/i)).toBeInTheDocument()
  })

  it('confirmation dialog shows athlete name and template title', async () => {
    setupCoach([CAL_SESSION])
    render(<SessionsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /unassign alice johnson/i }))

    const dialog = screen.getByRole('dialog', { name: /confirm unassign/i })
    expect(within(dialog).getByText('Alice Johnson')).toBeInTheDocument()
    expect(within(dialog).getByText('Strength Block A')).toBeInTheDocument()
  })
})

describe('SessionsPage — Unassign (list)', () => {
  it('shows Unassign button for coach on pending session', async () => {
    setupCoach([ALICE_SESSION])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))
    expect(await screen.findByRole('button', { name: /unassign/i })).toBeInTheDocument()
  })

  it('does not show Unassign button for athlete', async () => {
    setupAthlete([ALICE_SESSION])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))
    await waitFor(() => screen.getByText(/strength block a/i))
    expect(screen.queryByRole('button', { name: /unassign/i })).not.toBeInTheDocument()
  })

  it('does not show Unassign button for completed session', async () => {
    setupCoach([COMPLETED_SESSION])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))
    await waitFor(() => screen.getByText(/strength block a/i))
    expect(screen.queryByRole('button', { name: /unassign/i })).not.toBeInTheDocument()
  })

  it('shows confirmation dialog when Unassign is clicked', async () => {
    setupCoach([ALICE_SESSION])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))
    fireEvent.click(await screen.findByRole('button', { name: /unassign/i }))

    expect(screen.getByRole('dialog', { name: /confirm unassign/i })).toBeInTheDocument()
    expect(screen.getByText(/the athlete will no longer see this session/i)).toBeInTheDocument()
  })

  it('removes session from list after successful unassign', async () => {
    mockActivation.mockReturnValue(COACH_STATE)
    // After cancel, list re-fetch should exclude Alice
    let cancelled = false
    mockRequest.mockImplementation((url: string) => {
      if (url.endsWith('/cancel')) { cancelled = true; return Promise.resolve(undefined) }
      return Promise.resolve(cancelled ? [BOB_SESSION] : [ALICE_SESSION, BOB_SESSION])
    })

    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    // Click unassign on Alice's session
    const aliceUnassign = await screen.findAllByRole('button', { name: /unassign/i })
    fireEvent.click(aliceUnassign[0])

    // Confirm
    const dialog = screen.getByRole('dialog', { name: /confirm unassign/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /^unassign$/i }))

    await waitFor(() => {
      expect(screen.queryByText(/strength block a/i)).not.toBeInTheDocument()
    })
    // Bob's session still there
    expect(screen.getByText(/cardio day/i)).toBeInTheDocument()
  })

  it('shows error message on 409 conflict', async () => {
    mockActivation.mockReturnValue(COACH_STATE)
    const { ConflictError } = await import('@/app/_shared/api/httpClient')
    // Mock: first call = list, second call = cancel (409)
    mockRequest.mockImplementation((url: string) => {
      if (url === '/v1/workout-sessions') return Promise.resolve([ALICE_SESSION])
      return Promise.reject(new ConflictError('Session has activity'))
    })

    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))
    fireEvent.click(await screen.findByRole('button', { name: /unassign/i }))

    const dialog = screen.getByRole('dialog', { name: /confirm unassign/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /^unassign$/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /can't be unassigned because it has activity or logs/i,
      )
    })
    // Session still visible (text appears in list row + dialog template title)
    expect(screen.getAllByText(/strength block a/i).length).toBeGreaterThanOrEqual(1)
  })
})
