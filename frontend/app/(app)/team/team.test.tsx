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

// FunnelStatsCard and TeamOverviewCards make their own requests — stub them.
vi.mock('@/src/features/analytics/FunnelStatsCard', () => ({
  FunnelStatsCard: () => null,
}))
vi.mock('@/src/features/dashboard/TeamOverviewCards', () => ({
  TeamOverviewCards: () => null,
}))

// ---------------------------------------------------------------------------

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mockWriteText },
  })
})

afterEach(() => {
  cleanup()
  mockUseAuth.mockReset()
  mockRequest.mockReset()
  mockRouter.replace.mockReset()
  mockWriteText.mockReset()
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEAM_A = 't1'
const TEAM_B = 't2'

const coachMe = {
  user_id: 'u1',
  memberships: [{ team_id: TEAM_A, team_name: 'Mettle FC', role: 'COACH' }],
  active_team_id: TEAM_A,
}

const multiTeamCoachMe = {
  user_id: 'u1',
  memberships: [
    { team_id: TEAM_A, team_name: 'Mettle FC', role: 'COACH' },
    { team_id: TEAM_B, team_name: 'Elite FC', role: 'COACH' },
  ],
  active_team_id: null,
}

const athleteMe = {
  user_id: 'u2',
  memberships: [{ team_id: TEAM_A, team_name: 'Mettle FC', role: 'ATHLETE' }],
  active_team_id: TEAM_A,
}

const inviteResponse = {
  code: 'ABC123',
  join_url: 'https://app.com/join?code=ABC123',
  team_id: TEAM_A,
}

function authAs(
  me: typeof coachMe | typeof athleteMe | typeof multiTeamCoachMe | null,
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
    mockRequest.mockResolvedValue(inviteResponse)
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /generate invite link/i }))

    expect(
      await screen.findByDisplayValue('https://app.com/join?code=ABC123'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate new link/i })).toBeInTheDocument()
  })

  it('copies the invite URL to clipboard when Copy is clicked', async () => {
    authAs(coachMe, 'COACH')
    mockRequest.mockResolvedValue(inviteResponse)
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /generate invite link/i }))
    fireEvent.click(await screen.findByRole('button', { name: /copy/i }))

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('https://app.com/join?code=ABC123')
    })
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument()
  })

  it('shows an error message if invite generation fails', async () => {
    authAs(coachMe, 'COACH')
    mockRequest.mockRejectedValue(new Error('Server error'))
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /generate invite link/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not generate/i)
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

  it('renders a card for each team in memberships', async () => {
    mockUseAuth.mockReturnValue({
      me: multiTeamCoachMe,
      role: 'COACH',
      activeTeamId: TEAM_A,
      loading: false,
      error: null,
      refreshMe: vi.fn(),
      setActiveTeamId: vi.fn(),
      clearActiveTeam: vi.fn(),
    })
    render(<TeamPage />)
    expect((await screen.findAllByText('Mettle FC')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('Elite FC')).length).toBeGreaterThan(0)
    // Both teams show their own invite button
    expect(screen.getAllByRole('button', { name: /generate invite link/i })).toHaveLength(2)
  })

  it('generates invite for the correct team when clicked', async () => {
    mockUseAuth.mockReturnValue({
      me: multiTeamCoachMe,
      role: 'COACH',
      activeTeamId: TEAM_A,
      loading: false,
      error: null,
      refreshMe: vi.fn(),
      setActiveTeamId: vi.fn(),
      clearActiveTeam: vi.fn(),
    })
    const inviteB = { code: 'XYZ', join_url: 'https://app.com/join?code=XYZ', team_id: TEAM_B }
    mockRequest.mockResolvedValue(inviteB)
    render(<TeamPage />)

    const [, secondButton] = screen.getAllByRole('button', { name: /generate invite link/i })
    fireEvent.click(secondButton)

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        '/v1/invites',
        expect.objectContaining({
          body: JSON.stringify({ team_id: TEAM_B }),
        }),
      )
    })
  })




  it('shows active badge on the selected team card', async () => {
    authAs(multiTeamCoachMe, 'COACH', { activeTeamId: TEAM_A })
    render(<TeamPage />)

    expect(await screen.findByText('Active')).toBeInTheDocument()
  })
})
