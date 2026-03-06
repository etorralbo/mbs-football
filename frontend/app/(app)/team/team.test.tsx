import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import TeamPage from './page'
import { ForbiddenError } from '@/app/_shared/api/httpClient'

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
  memberships: [{ team_id: TEAM_A, team_name: 'Mettle FC', role: 'COACH', is_owner: true }],
  active_team_id: TEAM_A,
}

const coachNotOwnerMe = {
  user_id: 'u1',
  memberships: [{ team_id: TEAM_A, team_name: 'Mettle FC', role: 'COACH', is_owner: false }],
  active_team_id: TEAM_A,
}

const athleteMe = {
  user_id: 'u2',
  memberships: [{ team_id: TEAM_A, team_name: 'Mettle FC', role: 'ATHLETE', is_owner: false }],
  active_team_id: TEAM_A,
}

const inviteResponse = {
  token: 'ABC123-token-xyz',
  join_url: 'https://app.com/join?token=ABC123-token-xyz',
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
  me: typeof coachMe | typeof athleteMe | typeof coachNotOwnerMe | null,
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
 *  DELETE /v1/teams/:id  → deleteResult (default: rejected)
 */
function setupRequest({
  athletes = [] as typeof athletesList,
  invite = null as typeof inviteResponse | null,
  athletesError = false,
  deleteResult = null as 'success' | { error: string; status: number } | null,
} = {}) {
  mockRequest.mockImplementation((url: string, opts?: { method?: string }) => {
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
    if (url.startsWith('/v1/teams/') && opts?.method === 'DELETE') {
      if (deleteResult === 'success') return Promise.resolve(undefined)
      if (deleteResult && typeof deleteResult === 'object') {
        return Promise.reject(new ForbiddenError(deleteResult.error))
      }
      return Promise.reject(new Error('delete not configured'))
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

  /** Type an email into the invite input and click generate. */
  async function fillEmailAndGenerate(email = 'athlete@test.com') {
    const input = await screen.findByLabelText(/athlete email/i)
    fireEvent.change(input, { target: { value: email } })
    fireEvent.click(screen.getByRole('button', { name: /generate invite link/i }))
  }

  it('shows the invite panel only for a coach', async () => {
    authAs(coachMe, 'COACH')
    render(<TeamPage />)
    expect(
      await screen.findByRole('button', { name: /generate invite link/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/athlete email/i)).toBeInTheDocument()
  })

  it('does not show the invite panel for an athlete', async () => {
    authAs(athleteMe, 'ATHLETE')
    render(<TeamPage />)
    await screen.findByText('Mettle FC')
    expect(
      screen.queryByRole('button', { name: /generate invite link/i }),
    ).not.toBeInTheDocument()
  })

  it('shows validation error when generating without email', async () => {
    authAs(coachMe, 'COACH')
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /generate invite link/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/valid email/i)
    expect(mockRequest).not.toHaveBeenCalledWith('/v1/team-invites', expect.anything())
  })

  it('shows validation error for invalid email format', async () => {
    authAs(coachMe, 'COACH')
    render(<TeamPage />)

    await fillEmailAndGenerate('not-an-email')

    expect(await screen.findByRole('alert')).toHaveTextContent(/valid email/i)
  })

  it('shows the invite URL after entering email and clicking generate', async () => {
    authAs(coachMe, 'COACH')
    setupRequest({ invite: inviteResponse })
    render(<TeamPage />)

    await fillEmailAndGenerate()

    expect(
      await screen.findByDisplayValue('https://app.com/join?token=ABC123-token-xyz'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy invite link/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate new link/i })).toBeInTheDocument()
  })

  it('copies the invite URL to clipboard when Copy is clicked', async () => {
    authAs(coachMe, 'COACH')
    setupRequest({ invite: inviteResponse })
    render(<TeamPage />)

    await fillEmailAndGenerate()
    fireEvent.click(await screen.findByRole('button', { name: /copy invite link/i }))

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('https://app.com/join?token=ABC123-token-xyz')
    })
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument()
  })

  it('shows an error message if invite generation fails', async () => {
    authAs(coachMe, 'COACH')
    render(<TeamPage />)

    await fillEmailAndGenerate()

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not generate/i)
  })

  it('sends team_id and email in the invite request', async () => {
    authAs(coachMe, 'COACH')
    setupRequest({ invite: inviteResponse })
    render(<TeamPage />)

    await fillEmailAndGenerate('  Athlete@Test.COM  ')

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        '/v1/team-invites',
        expect.objectContaining({
          body: JSON.stringify({ team_id: TEAM_A, email: 'athlete@test.com' }),
        }),
      )
    })
  })

  it('clears email input after successful invite generation', async () => {
    authAs(coachMe, 'COACH')
    setupRequest({ invite: inviteResponse })
    render(<TeamPage />)

    await fillEmailAndGenerate()

    await screen.findByDisplayValue('https://app.com/join?token=ABC123-token-xyz')
    expect(screen.getByLabelText(/athlete email/i)).toHaveValue('')
  })

  // ---------------------------------------------------------------------------
  // Delete Team
  // ---------------------------------------------------------------------------

  it('shows danger zone only for team owner', async () => {
    authAs(coachMe, 'COACH')
    render(<TeamPage />)
    expect(await screen.findByText(/danger zone/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete team/i })).toBeInTheDocument()
  })

  it('does not show danger zone for coach who is not owner', async () => {
    authAs(coachNotOwnerMe, 'COACH')
    render(<TeamPage />)
    await screen.findByText('Mettle FC')
    expect(screen.queryByText(/danger zone/i)).not.toBeInTheDocument()
  })

  it('does not show danger zone for athlete', async () => {
    authAs(athleteMe, 'ATHLETE')
    render(<TeamPage />)
    await screen.findByText('Mettle FC')
    expect(screen.queryByText(/danger zone/i)).not.toBeInTheDocument()
  })

  it('opens confirmation modal on delete button click', async () => {
    authAs(coachMe, 'COACH')
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /delete team/i }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(/this action cannot be undone/i)).toBeInTheDocument()
  })

  it('delete button disabled until team name typed', async () => {
    authAs(coachMe, 'COACH')
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /delete team/i }))

    // The "Delete team" button inside the modal
    const deleteBtn = screen.getAllByRole('button', { name: /delete team/i })[1]
    expect(deleteBtn).toBeDisabled()

    // Type wrong name
    const input = screen.getByPlaceholderText(/type the team name/i)
    fireEvent.change(input, { target: { value: 'Wrong Name' } })
    expect(deleteBtn).toBeDisabled()

    // Type correct name
    fireEvent.change(input, { target: { value: 'Mettle FC' } })
    expect(deleteBtn).toBeEnabled()
  })

  it('successful delete redirects to /team/select', async () => {
    const mockClearActiveTeam = vi.fn()
    const mockRefreshMe = vi.fn().mockResolvedValue({
      user_id: 'u1',
      memberships: [{ team_id: 't2', team_name: 'Other Team', role: 'COACH', is_owner: true }],
      active_team_id: null,
    })
    authAs(coachMe, 'COACH', { clearActiveTeam: mockClearActiveTeam, refreshMe: mockRefreshMe })
    setupRequest({ deleteResult: 'success' })
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /delete team/i }))
    const input = screen.getByPlaceholderText(/type the team name/i)
    fireEvent.change(input, { target: { value: 'Mettle FC' } })
    fireEvent.click(screen.getAllByRole('button', { name: /delete team/i })[1])

    await waitFor(() => {
      expect(mockClearActiveTeam).toHaveBeenCalled()
      expect(mockRefreshMe).toHaveBeenCalled()
      expect(mockRouter.replace).toHaveBeenCalledWith('/team/select')
    })
  })

  it('successful delete redirects to /create-team when no teams left', async () => {
    const mockClearActiveTeam = vi.fn()
    const mockRefreshMe = vi.fn().mockResolvedValue({
      user_id: 'u1',
      memberships: [],
      active_team_id: null,
    })
    authAs(coachMe, 'COACH', { clearActiveTeam: mockClearActiveTeam, refreshMe: mockRefreshMe })
    setupRequest({ deleteResult: 'success' })
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /delete team/i }))
    const input = screen.getByPlaceholderText(/type the team name/i)
    fireEvent.change(input, { target: { value: 'Mettle FC' } })
    fireEvent.click(screen.getAllByRole('button', { name: /delete team/i })[1])

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith('/create-team')
    })
  })

  it('shows 403 error message when backend blocks deletion', async () => {
    authAs(coachMe, 'COACH')
    setupRequest({
      deleteResult: { error: 'Cannot delete team: remove all athletes first.', status: 403 },
    })
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /delete team/i }))
    const input = screen.getByPlaceholderText(/type the team name/i)
    fireEvent.change(input, { target: { value: 'Mettle FC' } })
    fireEvent.click(screen.getAllByRole('button', { name: /delete team/i })[1])

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /remove all athletes first/i,
    )
  })
})
