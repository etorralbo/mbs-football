import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import type { WorkoutSessionSummary } from '@/app/_shared/api/types'
import type { TeamOverviewState } from '@/src/features/dashboard/useTeamOverview'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/src/shared/auth/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/app/_shared/api/httpClient', () => ({
  request: vi.fn(),
}))

vi.mock('@/src/features/dashboard/useTeamOverview', () => ({
  useTeamOverview: vi.fn(),
}))

vi.mock('@/src/features/athlete/components/ProgressSection', () => ({
  ProgressSection: () => <div data-testid="progress-section" />,
}))

const mockReplace = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  usePathname: () => '/home',
  useSearchParams: () => ({ get: () => null }),
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

// ---------------------------------------------------------------------------
// Import subjects (after mocks are declared)
// ---------------------------------------------------------------------------

import { useAuth } from '@/src/shared/auth/AuthContext'
import { request } from '@/app/_shared/api/httpClient'
import { useTeamOverview } from '@/src/features/dashboard/useTeamOverview'
import HomePage from './page'

const mockUseAuth = vi.mocked(useAuth)
const mockRequest = vi.mocked(request)
const mockUseTeamOverview = vi.mocked(useTeamOverview)

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const PENDING_SESSION: WorkoutSessionSummary = {
  id: 'sess-1',
  assignment_id: 'assign-1',
  athlete_id: 'ath-1',
  workout_template_id: 'tpl-1',
  template_title: 'Strength Block A',
  athlete_name: 'Alice',
  scheduled_for: '2025-03-01',
  completed_at: null,
}

const COMPLETED_SESSION: WorkoutSessionSummary = {
  id: 'sess-2',
  assignment_id: 'assign-2',
  athlete_id: 'ath-1',
  workout_template_id: 'tpl-1',
  template_title: 'Cardio Day',
  athlete_name: 'Alice',
  scheduled_for: '2025-02-28',
  completed_at: '2025-02-28T10:00:00Z',
}

const COACH_TEAM_STATE: TeamOverviewState = {
  status: 'ok',
  data: {
    athletes: [{ athlete_id: 'ath-1', display_name: 'Alice' }],
    sessions: [COMPLETED_SESSION],
    pendingCount: 0,
    completedCount: 1,
    lowAdherenceAthletes: [],
  },
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function setupCoach() {
  mockUseAuth.mockReturnValue({
    role: 'COACH',
    loading: false,
    me: null,
    activeTeamId: 'team-1',
    error: null,
    refreshMe: vi.fn(),
    setActiveTeamId: vi.fn(),
    clearActiveTeam: vi.fn(),
  })
  mockUseTeamOverview.mockReturnValue(COACH_TEAM_STATE)
}

function setupAthlete() {
  mockUseAuth.mockReturnValue({
    role: 'ATHLETE',
    loading: false,
    me: null,
    activeTeamId: 'team-1',
    error: null,
    refreshMe: vi.fn(),
    setActiveTeamId: vi.fn(),
    clearActiveTeam: vi.fn(),
  })
  // useTeamOverview should not be called for ATHLETE, but provide a safe default
  mockUseTeamOverview.mockReturnValue({ status: 'loading' })
}

afterEach(() => {
  vi.clearAllMocks()
  mockReplace.mockReset()
  cleanup()
})

// ---------------------------------------------------------------------------
// COACH tests
// ---------------------------------------------------------------------------

// COACH home page: redirects to /templates and shows skeleton while doing so.
describe('HomePage — COACH role', () => {
  it('redirects to /templates', async () => {
    setupCoach()

    render(<HomePage />)

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/templates'))
  })

  it('shows skeleton while redirecting', () => {
    setupCoach()

    render(<HomePage />)

    // The skeleton renders before the redirect effect fires
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('does not render athlete-specific sections', () => {
    setupCoach()

    render(<HomePage />)

    expect(screen.queryByText("Today's Training")).not.toBeInTheDocument()
    expect(screen.queryByTestId('progress-section')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ATHLETE tests
// ---------------------------------------------------------------------------

describe('HomePage — ATHLETE role', () => {
  it('renders Training, Recent Sessions, and Progress sections', async () => {
    setupAthlete()
    mockRequest.mockResolvedValue([PENDING_SESSION, COMPLETED_SESSION])

    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText("Today's Training")).toBeInTheDocument()
      expect(screen.getByText('Recent Sessions')).toBeInTheDocument()
      expect(screen.getByTestId('progress-section')).toBeInTheDocument()
    })
  })

  it('shows "Start workout" link when a pending session exists', async () => {
    setupAthlete()
    mockRequest.mockResolvedValue([PENDING_SESSION])

    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /start workout/i })).toBeInTheDocument()
    })
  })

  it('shows "All caught up" when no pending sessions', async () => {
    setupAthlete()
    mockRequest.mockResolvedValue([COMPLETED_SESSION])

    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
    })
  })

  it('shows completed session in Recent Sessions', async () => {
    setupAthlete()
    mockRequest.mockResolvedValue([COMPLETED_SESSION])

    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('Cardio Day')).toBeInTheDocument()
    })
  })

  it('shows "No completed sessions yet" when athlete has no completed sessions', async () => {
    setupAthlete()
    mockRequest.mockResolvedValue([PENDING_SESSION])

    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText(/no completed sessions yet/i)).toBeInTheDocument()
    })
  })

  it('"View all" links in athlete home point to /athlete and /sessions', async () => {
    setupAthlete()
    mockRequest.mockResolvedValue([PENDING_SESSION])

    render(<HomePage />)

    await waitFor(() => {
      const links = screen.getAllByRole('link', { name: /view all/i })
      const hrefs = links.map((l) => l.getAttribute('href'))
      expect(hrefs).toContain('/athlete')
      expect(hrefs).toContain('/sessions')
    })
  })

  it('does not render coach-specific sections', async () => {
    setupAthlete()
    mockRequest.mockResolvedValue([])

    render(<HomePage />)

    await waitFor(() => {
      expect(screen.queryByText('Workout Templates')).not.toBeInTheDocument()
      expect(screen.queryByText('Exercise Library')).not.toBeInTheDocument()
      expect(screen.queryByText('Team')).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('HomePage — loading state', () => {
  it('renders nothing role-specific while auth is loading', () => {
    mockUseAuth.mockReturnValue({
      role: null,
      loading: true,
      me: null,
      activeTeamId: null,
      error: null,
      refreshMe: vi.fn(),
      setActiveTeamId: vi.fn(),
      clearActiveTeam: vi.fn(),
    })
    mockUseTeamOverview.mockReturnValue({ status: 'loading' })

    render(<HomePage />)

    expect(screen.queryByText('Workout Templates')).not.toBeInTheDocument()
    expect(screen.queryByText("Today's Training")).not.toBeInTheDocument()
  })
})
