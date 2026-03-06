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
  exercise_count: 6,
  exercises_logged_count: 0,
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
  exercise_count: 4,
  exercises_logged_count: 0,
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

function todayStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function futureStr(daysAhead = 5): string {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function pastStr(daysAgo = 3): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
        exercise_count: 5,
        exercises_logged_count: 0,
      },
      {
        id: 'bbbbbbbb-0000-0000-0000-000000000002',
        assignment_id: 'a2',
        athlete_id: 'p1',
        workout_template_id: 'wt2',
        template_title: 'Strength Day',
        scheduled_for: null,
        completed_at: '2026-02-20T10:00:00Z',
        exercise_count: 3,
        exercises_logged_count: 3,
      },
    ])

    render(<SessionsPage />)
    // Page defaults to calendar view; switch to list to see session rows
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    // Template title as card heading
    expect(await screen.findByText('Sprint Workout')).toBeInTheDocument()
    // Date on separate line
    expect(screen.getByText('Feb 25, 2026')).toBeInTheDocument()

    // Second session: template title
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
        exercise_count: 0,
        exercises_logged_count: 0,
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
// COACH grouped view — status grouping
// ---------------------------------------------------------------------------

describe('SessionsPage — COACH status grouping', () => {
  it('groups sessions into Today / Upcoming / Completed sections', async () => {
    const todaySession: WorkoutSessionSummary = {
      ...ALICE_SESSION,
      id: 'sess-today',
      scheduled_for: todayStr(),
    }
    const upcomingSession: WorkoutSessionSummary = {
      ...BOB_SESSION,
      id: 'sess-upcoming',
      scheduled_for: futureStr(),
    }
    const completedSession: WorkoutSessionSummary = {
      ...ALICE_SESSION,
      id: 'sess-done',
      completed_at: '2025-03-01T10:00:00Z',
    }

    setupCoach([todaySession, upcomingSession, completedSession])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    await waitFor(() => {
      const todaySection = screen.getByRole('region', { name: /^today$/i })
      expect(within(todaySection).getByText('Strength Block A')).toBeInTheDocument()

      const upcomingSection = screen.getByRole('region', { name: /^upcoming$/i })
      expect(within(upcomingSection).getByText('Cardio Day')).toBeInTheDocument()

      const completedSection = screen.getByRole('region', { name: /^completed$/i })
      expect(within(completedSection).getByText('Strength Block A')).toBeInTheDocument()
    })
  })

  it('hides empty status sections', async () => {
    // Only pending sessions, no completed
    setupCoach([{ ...ALICE_SESSION, scheduled_for: futureStr() }])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /^upcoming$/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole('region', { name: /^today$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /^completed$/i })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Session card content
// ---------------------------------------------------------------------------

describe('SessionsPage — session card content', () => {
  it('displays athlete name and exercise count on COACH cards', async () => {
    setupCoach([{ ...ALICE_SESSION, scheduled_for: futureStr(), exercise_count: 6 }])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    await waitFor(() => {
      // Athlete name appears in card (also in filter dropdown — use getAllByText)
      expect(screen.getAllByText('Alice Johnson').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('6 exercises')).toBeInTheDocument()
    })
  })

  it('does not show athlete name for ATHLETE role', async () => {
    setupAthlete([{ ...ALICE_SESSION, scheduled_for: futureStr() }])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    await waitFor(() => {
      expect(screen.getByText('Strength Block A')).toBeInTheDocument()
    })
    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument()
  })

  it('shows workout name and date on separate lines', async () => {
    setupCoach([{ ...ALICE_SESSION, scheduled_for: '2026-03-03' }])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    await waitFor(() => {
      // Title is in an h3
      const heading = screen.getByRole('heading', { name: 'Strength Block A', level: 3 })
      expect(heading).toBeInTheDocument()
      // Date is in a separate <p> element
      expect(screen.getByText('Mar 3, 2026')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Quick actions menu
// ---------------------------------------------------------------------------

describe('SessionsPage — kebab menu', () => {
  it('shows kebab menu button for COACH role', async () => {
    setupCoach([{ ...ALICE_SESSION, scheduled_for: futureStr() }])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /actions for strength block a/i })).toBeInTheDocument()
    })
  })

  it('does not show kebab menu for ATHLETE role', async () => {
    setupAthlete([ALICE_SESSION])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    await waitFor(() => {
      expect(screen.getByText('Strength Block A')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument()
  })

  it('opens menu with only Unassign option for pending sessions', async () => {
    setupCoach([{ ...ALICE_SESSION, scheduled_for: futureStr() }])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    const kebab = await screen.findByRole('button', { name: /actions for strength block a/i })
    fireEvent.click(kebab)

    expect(screen.getByRole('menuitem', { name: /unassign/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /reschedule/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /duplicate/i })).not.toBeInTheDocument()
  })

  it('does not show kebab menu for completed sessions', async () => {
    const completed: WorkoutSessionSummary = {
      ...ALICE_SESSION,
      completed_at: '2025-03-01T10:00:00Z',
    }
    setupCoach([completed])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    await waitFor(() => {
      expect(screen.getByText('Strength Block A')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument()
  })

  it('opens unassign dialog from kebab menu', async () => {
    setupCoach([{ ...ALICE_SESSION, scheduled_for: futureStr() }])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    const kebab = await screen.findByRole('button', { name: /actions for strength block a/i })
    fireEvent.click(kebab)
    fireEvent.click(screen.getByRole('menuitem', { name: /unassign/i }))

    expect(screen.getByRole('dialog', { name: /confirm unassign/i })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// COACH athlete filter
// ---------------------------------------------------------------------------

describe('SessionsPage — COACH athlete filter', () => {
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
    setupCoach([
      { ...ALICE_SESSION, scheduled_for: futureStr() },
      { ...BOB_SESSION, scheduled_for: futureStr() },
    ])
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

  it('removes session from calendar after successful unassign', async () => {
    const CAL_BOB: WorkoutSessionSummary = { ...BOB_SESSION, scheduled_for: THIS_MONTH }
    mockActivation.mockReturnValue(COACH_STATE)
    let cancelled = false
    mockRequest.mockImplementation((url: string) => {
      if (url.endsWith('/cancel')) { cancelled = true; return Promise.resolve(undefined) }
      return Promise.resolve(cancelled ? [CAL_BOB] : [CAL_SESSION, CAL_BOB])
    })

    render(<SessionsPage />)

    fireEvent.click(await screen.findByRole('button', { name: /unassign alice johnson/i }))
    const dialog = screen.getByRole('dialog', { name: /confirm unassign/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /^unassign$/i }))

    await waitFor(() => {
      expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument()
    })
    expect(screen.getAllByText('Bob Smith').length).toBeGreaterThanOrEqual(1)
  })

  it('shows error message on 409 conflict from calendar unassign', async () => {
    mockActivation.mockReturnValue(COACH_STATE)
    const { ConflictError } = await import('@/app/_shared/api/httpClient')
    mockRequest.mockImplementation((url: string) => {
      if (url === '/v1/workout-sessions') return Promise.resolve([CAL_SESSION])
      return Promise.reject(new ConflictError('Session has activity'))
    })

    render(<SessionsPage />)

    fireEvent.click(await screen.findByRole('button', { name: /unassign alice johnson/i }))
    const dialog = screen.getByRole('dialog', { name: /confirm unassign/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /^unassign$/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /can't be unassigned because it has activity or logs/i,
      )
    })
  })
})

describe('SessionsPage — Unassign (list)', () => {
  it('shows Unassign in kebab menu for coach on pending session', async () => {
    setupCoach([{ ...ALICE_SESSION, scheduled_for: futureStr() }])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    const kebab = await screen.findByRole('button', { name: /actions for strength block a/i })
    fireEvent.click(kebab)
    expect(screen.getByRole('menuitem', { name: /unassign/i })).toBeInTheDocument()
  })

  it('does not show kebab menu for athlete', async () => {
    setupAthlete([ALICE_SESSION])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))
    await waitFor(() => screen.getByText(/strength block a/i))
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument()
  })

  it('does not show kebab menu for completed session', async () => {
    setupCoach([COMPLETED_SESSION])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    await waitFor(() => screen.getByText(/strength block a/i))
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument()
  })

  it('shows confirmation dialog when Unassign is clicked from kebab', async () => {
    setupCoach([{ ...ALICE_SESSION, scheduled_for: futureStr() }])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    const kebab = await screen.findByRole('button', { name: /actions for strength block a/i })
    fireEvent.click(kebab)
    fireEvent.click(screen.getByRole('menuitem', { name: /unassign/i }))

    expect(screen.getByRole('dialog', { name: /confirm unassign/i })).toBeInTheDocument()
    expect(screen.getByText(/the athlete will no longer see this session/i)).toBeInTheDocument()
  })

  it('removes session from list after successful unassign', async () => {
    mockActivation.mockReturnValue(COACH_STATE)
    let cancelled = false
    mockRequest.mockImplementation((url: string) => {
      if (url.endsWith('/cancel')) { cancelled = true; return Promise.resolve(undefined) }
      return Promise.resolve(cancelled
        ? [{ ...BOB_SESSION, scheduled_for: futureStr() }]
        : [{ ...ALICE_SESSION, scheduled_for: futureStr() }, { ...BOB_SESSION, scheduled_for: futureStr() }])
    })

    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    // Open kebab on Alice's session and click Unassign
    const kebab = await screen.findByRole('button', { name: /actions for strength block a/i })
    fireEvent.click(kebab)
    fireEvent.click(screen.getByRole('menuitem', { name: /unassign/i }))

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
    mockRequest.mockImplementation((url: string) => {
      if (url === '/v1/workout-sessions') return Promise.resolve([{ ...ALICE_SESSION, scheduled_for: futureStr() }])
      return Promise.reject(new ConflictError('Session has activity'))
    })

    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    // Open kebab and click Unassign
    const kebab = await screen.findByRole('button', { name: /actions for strength block a/i })
    fireEvent.click(kebab)
    fireEvent.click(screen.getByRole('menuitem', { name: /unassign/i }))

    const dialog = screen.getByRole('dialog', { name: /confirm unassign/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /^unassign$/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /can't be unassigned because it has activity or logs/i,
      )
    })
    // Session still visible
    expect(screen.getAllByText(/strength block a/i).length).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// Overdue status group
// ---------------------------------------------------------------------------

describe('SessionsPage — Overdue section', () => {
  it('shows overdue section for past-due pending sessions', async () => {
    const overdueSession: WorkoutSessionSummary = {
      ...ALICE_SESSION,
      id: 'sess-overdue',
      scheduled_for: pastStr(),
    }
    setupCoach([overdueSession])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /^overdue$/i })).toBeInTheDocument()
      const section = screen.getByRole('region', { name: /^overdue$/i })
      expect(within(section).getByText('Strength Block A')).toBeInTheDocument()
    })
  })

  it('shows Overdue badge for past-due pending sessions', async () => {
    const overdueSession: WorkoutSessionSummary = {
      ...ALICE_SESSION,
      id: 'sess-overdue',
      scheduled_for: pastStr(),
    }
    setupCoach([overdueSession])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    await waitFor(() => {
      // "Overdue" appears both as section heading (h2) and badge (span) — check both exist
      expect(screen.getAllByText('Overdue').length).toBe(2)
    })
  })

  it('does not put completed past sessions in overdue', async () => {
    const completedPast: WorkoutSessionSummary = {
      ...ALICE_SESSION,
      id: 'sess-past-done',
      scheduled_for: pastStr(),
      completed_at: pastStr(1) + 'T10:00:00Z',
    }
    setupCoach([completedPast])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /^completed$/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole('region', { name: /^overdue$/i })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Exercise progress display
// ---------------------------------------------------------------------------

describe('SessionsPage — exercise progress', () => {
  it('shows "X / Y exercises" when exercises have been logged', async () => {
    const inProgressSession: WorkoutSessionSummary = {
      ...ALICE_SESSION,
      id: 'sess-progress',
      scheduled_for: futureStr(),
      exercise_count: 6,
      exercises_logged_count: 4,
    }
    setupCoach([inProgressSession])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    await waitFor(() => {
      expect(screen.getByText('4 / 6 exercises')).toBeInTheDocument()
    })
  })

  it('shows "Y exercises" when no exercises logged', async () => {
    setupCoach([{ ...ALICE_SESSION, scheduled_for: futureStr(), exercise_count: 6, exercises_logged_count: 0 }])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    await waitFor(() => {
      expect(screen.getByText('6 exercises')).toBeInTheDocument()
    })
  })

  it('shows In progress badge when exercises have been logged', async () => {
    const inProgressSession: WorkoutSessionSummary = {
      ...ALICE_SESSION,
      id: 'sess-ip',
      scheduled_for: futureStr(),
      exercise_count: 6,
      exercises_logged_count: 2,
    }
    setupCoach([inProgressSession])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    await waitFor(() => {
      expect(screen.getByText('In progress')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Chronological sorting within sections
// ---------------------------------------------------------------------------

describe('SessionsPage — chronological sorting', () => {
  it('sorts upcoming sessions by date ascending', async () => {
    const laterSession: WorkoutSessionSummary = {
      ...ALICE_SESSION,
      id: 'sess-later',
      template_title: 'Later Session',
      scheduled_for: futureStr(10),
    }
    const soonerSession: WorkoutSessionSummary = {
      ...BOB_SESSION,
      id: 'sess-sooner',
      template_title: 'Sooner Session',
      scheduled_for: futureStr(2),
    }
    setupCoach([laterSession, soonerSession])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    await waitFor(() => {
      const section = screen.getByRole('region', { name: /^upcoming$/i })
      const headings = within(section).getAllByRole('heading', { level: 3 })
      expect(headings[0]).toHaveTextContent('Sooner Session')
      expect(headings[1]).toHaveTextContent('Later Session')
    })
  })

  it('sorts completed sessions by date descending (most recent first)', async () => {
    const olderDone: WorkoutSessionSummary = {
      ...ALICE_SESSION,
      id: 'sess-older',
      template_title: 'Older Done',
      completed_at: '2025-01-01T10:00:00Z',
    }
    const newerDone: WorkoutSessionSummary = {
      ...BOB_SESSION,
      id: 'sess-newer',
      template_title: 'Newer Done',
      completed_at: '2025-03-01T10:00:00Z',
    }
    setupCoach([olderDone, newerDone])
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }))

    await waitFor(() => {
      const section = screen.getByRole('region', { name: /^completed$/i })
      const headings = within(section).getAllByRole('heading', { level: 3 })
      expect(headings[0]).toHaveTextContent('Newer Done')
      expect(headings[1]).toHaveTextContent('Older Done')
    })
  })
})
