import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import TeamPage from './page'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockUseAuth, mockRequest, mockWriteText, mockRouter } = vi.hoisted(() => {
  const replace = vi.fn()
  return {
    mockUseAuth: vi.fn(),
    mockRequest: vi.fn(),
    mockWriteText: vi.fn().mockResolvedValue(undefined),
    mockRouter: { replace },
  }
})

vi.mock('@/src/shared/auth/AuthContext', () => ({ useAuth: mockUseAuth }))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = await importOriginal() as object
  return { ...actual, request: mockRequest }
})

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEAM_A = 't1'

const coachMe = {
  user_id: 'u1',
  memberships: [{ team_id: TEAM_A, team_name: 'Mettle FC', role: 'COACH' }],
  active_team_id: TEAM_A,
}

const athleteMe = {
  user_id: 'u2',
  memberships: [{ team_id: TEAM_A, team_name: 'Mettle FC', role: 'ATHLETE' }],
  active_team_id: TEAM_A,
}

const inviteResponse = {
  token: 'ABC123-token-xyz',
  join_url: 'https://app.com/join/ABC123-token-xyz',
  team_id: TEAM_A,
  expires_at: '2026-03-10T00:00:00Z',
}

const athletesList = [
  { athlete_id: 'a1', display_name: 'John Doe' },
  { athlete_id: 'a2', display_name: 'Jane Smith' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authAs(
  me: typeof coachMe | typeof athleteMe | null,
  role: 'COACH' | 'ATHLETE' | null,
  overrides?: Record<string, unknown>,
) {
  mockUseAuth.mockReturnValue({
    me,
    role,
    activeTeamId: me?.active_team_id ?? null,
    loading: false,
    error: null,
    refreshMe: vi.fn(),
    setActiveTeamId: vi.fn(),
    clearActiveTeam: vi.fn(),
    ...overrides,
  })
}

/**
 * Routes mockRequest by URL so tests can control each endpoint independently.
 *  GET /v1/athletes      → athletes (default: [])
 *  POST /v1/team-invites → invite (default: rejected)
 */
function setupRequest({
  athletes = [] as typeof athletesList,
  invite = null as typeof inviteResponse | null,
  athletesError = false,
} = {}) {
  mockRequest.mockImplementation((url: string) => {
    if (url === '/v1/athletes') {
      return athletesError
        ? Promise.reject(new Error('network error'))
        : Promise.resolve(athletes)
    }
    if (url === '/v1/team-invites') {
      return invite
        ? Promise.resolve(invite)
        : Promise.reject(new Error('invite not configured'))
    }
    return Promise.reject(new Error(`unexpected: ${url}`))
  })
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mockWriteText },
  })
  setupRequest() // default: athletes=[], invite fails
})

afterEach(() => {
  cleanup()
  mockUseAuth.mockReset()
  mockRequest.mockReset()
  mockRouter.replace.mockReset()
  mockWriteText.mockReset()
})

// ---------------------------------------------------------------------------

describe('TeamPage', () => {
  it('renders loading state when auth is loading', () => {
    mockUseAuth.mockReturnValue({
      me: null, role: null, activeTeamId: null, loading: true, error: null, refreshMe: vi.fn(), setActiveTeamId: vi.fn(), clearActiveTeam: vi.fn(),
    })
    render(<TeamPage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders team name and role for a coach', async () => {
    authAs(coachMe, 'COACH')
    render(<TeamPage />)
    expect(await screen.findByText('Mettle FC')).toBeInTheDocument()
    expect(screen.getByText('coach')).toBeInTheDocument()
  })

  it('renders team name and role for an athlete', async () => {
    authAs(athleteMe, 'ATHLETE')
    render(<TeamPage />)
    expect(await screen.findByText('Mettle FC')).toBeInTheDocument()
    expect(screen.getByText('athlete')).toBeInTheDocument()
  })

  it('shows empty state when user has no memberships', async () => {
    mockUseAuth.mockReturnValue({
      me: { user_id: 'u3', memberships: [], active_team_id: null },
      role: null, activeTeamId: null, loading: false, error: null, refreshMe: vi.fn(), setActiveTeamId: vi.fn(), clearActiveTeam: vi.fn(),
    })
    render(<TeamPage />)
    expect(await screen.findByText(/no team found/i)).toBeInTheDocument()
  })

  it('redirects ATHLETE to /sessions', async () => {
    authAs(athleteMe, 'ATHLETE')
    render(<TeamPage />)
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/sessions'))
  })

  it('shows "+ New team" button for coaches', async () => {
    authAs(coachMe, 'COACH')
    render(<TeamPage />)
    const link = await screen.findByRole('link', { name: /new team/i })
    expect(link).toHaveAttribute('href', '/create-team')
  })

  it('does not show "+ New team" button for athletes', async () => {
    authAs(athleteMe, 'ATHLETE')
    render(<TeamPage />)
    await screen.findByText('Mettle FC')
    expect(screen.queryByRole('link', { name: /new team/i })).not.toBeInTheDocument()
  })

  // ---------------------------------------------------------------------------
  // Athletes roster
  // ---------------------------------------------------------------------------

  it('shows athletes when loaded', async () => {
    authAs(coachMe, 'COACH')
    setupRequest({ athletes: athletesList })
    render(<TeamPage />)
    expect(await screen.findByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
  })

  it('shows athlete count badge when there are athletes', async () => {
    authAs(coachMe, 'COACH')
    setupRequest({ athletes: athletesList })
    render(<TeamPage />)
    expect(await screen.findByText('2')).toBeInTheDocument()
  })

  it('shows empty-roster message when no athletes have joined', async () => {
    authAs(coachMe, 'COACH')
    setupRequest({ athletes: [] })
    render(<TeamPage />)
    expect(await screen.findByText(/no athletes yet/i)).toBeInTheDocument()
  })

  it('shows athletes load error when the request fails', async () => {
    authAs(coachMe, 'COACH')
    setupRequest({ athletesError: true })
    render(<TeamPage />)
    expect(await screen.findByText(/could not load athletes/i)).toBeInTheDocument()
  })

  it('does not show the athletes section for an athlete role', async () => {
    authAs(athleteMe, 'ATHLETE')
    render(<TeamPage />)
    await screen.findByText('Mettle FC')
    expect(screen.queryByText(/^athletes$/i)).not.toBeInTheDocument()
  })

  // ---------------------------------------------------------------------------
  // Invite
  // ---------------------------------------------------------------------------

  it('shows the invite panel only for a coach', async () => {
    authAs(coachMe, 'COACH')
    render(<TeamPage />)
    expect(
      await screen.findByRole('button', { name: /generate invite link/i }),
    ).toBeInTheDocument()
  })

  it('does not show the invite panel for an athlete', async () => {
    authAs(athleteMe, 'ATHLETE')
    render(<TeamPage />)
    await screen.findByText('Mettle FC')
    expect(
      screen.queryByRole('button', { name: /generate invite link/i }),
    ).not.toBeInTheDocument()
  })

  it('shows the invite URL after clicking generate', async () => {
    authAs(coachMe, 'COACH')
    setupRequest({ invite: inviteResponse })
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /generate invite link/i }))

    expect(
      await screen.findByDisplayValue('https://app.com/join/ABC123-token-xyz'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy invite link/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate new link/i })).toBeInTheDocument()
  })

  it('copies the invite URL to clipboard when Copy is clicked', async () => {
    authAs(coachMe, 'COACH')
    setupRequest({ invite: inviteResponse })
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /generate invite link/i }))
    fireEvent.click(await screen.findByRole('button', { name: /copy invite link/i }))

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('https://app.com/join/ABC123-token-xyz')
    })
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument()
  })

  it('shows an error message if invite generation fails', async () => {
    authAs(coachMe, 'COACH')
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /generate invite link/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not generate/i)
  })

  it('generates invite for the active team', async () => {
    authAs(coachMe, 'COACH')
    setupRequest({ invite: inviteResponse })
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /generate invite link/i }))

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        '/v1/team-invites',
        expect.objectContaining({
          body: JSON.stringify({ team_id: TEAM_A }),
        }),
      )
    })
  })
})
