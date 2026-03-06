/**
 * Tests for /join/[token] page.
 *
 * Contract:
 *   valid token   → shows preview (team name, coach, role) + accept/login button
 *   invalid token → shows "Invalid invite" error
 *   expired token → shows "Invite expired" error
 *   used token    → shows "Invite already used" error
 *   logged in     → "Join team" button → calls accept → shows success
 *   not logged in → "Log in to join this team" button → redirects to /login?next=...
 *   accept: joined        → shows "You joined <team>" + "View your sessions"
 *   accept: already_member → shows "Already a member"
 *   accept: not_eligible  → shows "Cannot join as athlete"
 *   accept: error         → shows "Invalid invite"
 */
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { ForbiddenError } from '@/app/_shared/api/httpClient'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockReplace, mockPush, mockParams, mockGetSession, mockGetUser, mockRequest } =
  vi.hoisted(() => ({
    mockReplace: vi.fn(),
    mockPush: vi.fn(),
    mockParams: vi.fn(),
    mockGetSession: vi.fn(),
    mockGetUser: vi.fn(),
    mockRequest: vi.fn(),
  }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useParams: mockParams,
}))

vi.mock('@/app/_shared/auth/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
    },
  },
}))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = (await importOriginal()) as object
  return { ...actual, request: mockRequest }
})

const VALID_TOKEN = 'abcdefghijklmnopqrstu' // >= 20 chars

const PREVIEW_RESPONSE = {
  team_name: 'Coaching SL',
  coach_name: 'Estibaliz',
  role: 'ATHLETE',
  email: 'athlete@example.com',
  expires_at: '2026-03-20T00:00:00Z',
}

const USER = {
  data: {
    user: {
      user_metadata: { name: 'Alice' },
      email: 'alice@example.com',
    },
  },
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetModules()
  mockReplace.mockReset()
  mockPush.mockReset()
  mockParams.mockReset()
  mockGetSession.mockReset()
  mockGetUser.mockReset()
  mockRequest.mockReset()

  // Default: valid token param
  mockParams.mockReturnValue({ token: VALID_TOKEN })
  // Default: logged in
  mockGetSession.mockResolvedValue({ data: { session: { user: {} } } })
  mockGetUser.mockResolvedValue(USER)

  // Default: successful preview fetch
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(PREVIEW_RESPONSE),
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function renderPage() {
  const { default: JoinTokenPage } = await import('./page')
  render(<JoinTokenPage />)
}

// ---------------------------------------------------------------------------
// Preview states
// ---------------------------------------------------------------------------

describe('JoinTokenPage — preview (logged in)', () => {
  it('shows team name, coach name, role, and join button', async () => {
    await renderPage()

    await screen.findByText(/Join Coaching SL/i)
    expect(screen.getByText(/Coach: Estibaliz/)).toBeInTheDocument()
    expect(screen.getByText(/Role: Athlete/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /join team/i }),
    ).toBeInTheDocument()
  })

  it('shows relative expiration', async () => {
    await renderPage()

    await screen.findByText(/Expires in \d+ days/)
  })

  it('shows invited email', async () => {
    await renderPage()

    await screen.findByText(/Invited: athlete@example.com/)
  })

  it('does not show invited email when null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...PREVIEW_RESPONSE, email: null }),
      }),
    )

    await renderPage()

    await screen.findByText(/Join Coaching SL/i)
    expect(screen.queryByText(/Invited:/)).not.toBeInTheDocument()
  })
})

describe('JoinTokenPage — preview (not logged in)', () => {
  it('shows login button instead of accept', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })

    await renderPage()

    await screen.findByText(/Join Coaching SL/i)
    expect(
      screen.getByRole('button', { name: /log in to join this team/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /join team/i }),
    ).not.toBeInTheDocument()
  })

  it('login button navigates to /login with next param', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })

    await renderPage()

    const btn = await screen.findByRole('button', { name: /log in to join this team/i })
    fireEvent.click(btn)

    expect(mockPush).toHaveBeenCalledWith(
      `/login?next=/join/${encodeURIComponent(VALID_TOKEN)}`,
    )
  })
})

// ---------------------------------------------------------------------------
// Error states on preview
// ---------------------------------------------------------------------------

describe('JoinTokenPage — invalid token', () => {
  it('shows error for short token', async () => {
    mockParams.mockReturnValue({ token: 'short' })

    await renderPage()

    await screen.findByText(/invalid invite/i)
  })

  it('shows error when preview returns 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    )

    await renderPage()

    await screen.findByText(/invalid invite/i)
  })
})

describe('JoinTokenPage — expired invite', () => {
  it('shows expired message when preview returns 410', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 410 }),
    )

    await renderPage()

    await screen.findByText(/invite expired/i)
  })
})

describe('JoinTokenPage — used invite', () => {
  it('shows used message when preview returns 409', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 409 }),
    )

    await renderPage()

    await screen.findByText(/invite already used/i)
  })
})

// ---------------------------------------------------------------------------
// Auto-accept flow
// ---------------------------------------------------------------------------

describe('JoinTokenPage — auto-accept', () => {
  it('auto-accepts when logged-in email matches invite email', async () => {
    // Make user email match invite email
    mockGetUser.mockResolvedValue({
      data: { user: { user_metadata: { name: 'Athlete' }, email: 'athlete@example.com' } },
    })
    mockRequest.mockResolvedValue({
      status: 'joined',
      team_id: 'team-1',
      team_name: 'Coaching SL',
    })

    await renderPage()

    // Should go straight to success — no button click needed
    await screen.findByText(/You joined Coaching SL/i)
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it('does not auto-accept when invite has no email', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...PREVIEW_RESPONSE, email: null }),
      }),
    )

    await renderPage()

    // Should show preview with accept button
    await screen.findByRole('button', { name: /join team/i })
  })

  it('does not auto-accept when emails differ', async () => {
    // Default: user email is alice@example.com, invite email is athlete@example.com
    await renderPage()

    // Should show preview with accept button
    await screen.findByRole('button', { name: /join team/i })
  })
})

// ---------------------------------------------------------------------------
// Accept flow
// ---------------------------------------------------------------------------

describe('JoinTokenPage — accept: button disabled while joining', () => {
  it('disables button and shows "Joining..." while request is in-flight', async () => {
    // Never resolve — keep the request in-flight
    mockRequest.mockReturnValue(new Promise(() => {}))

    await renderPage()

    const btn = await screen.findByRole('button', { name: /join team/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(btn).toBeDisabled()
      expect(btn).toHaveTextContent('Joining...')
    })
  })
})

describe('JoinTokenPage — accept: joined', () => {
  it('shows success state with team name and sessions button', async () => {
    mockRequest.mockResolvedValue({
      status: 'joined',
      team_id: 'team-1',
      team_name: 'Coaching SL',
    })

    await renderPage()

    const acceptBtn = await screen.findByRole('button', {
      name: /join team/i,
    })
    fireEvent.click(acceptBtn)

    await screen.findByText(/You joined Coaching SL/i)
    expect(
      screen.getByRole('button', { name: /view your sessions/i }),
    ).toBeInTheDocument()
  })

  it('clicking "View your sessions" navigates to /sessions', async () => {
    mockRequest.mockResolvedValue({
      status: 'joined',
      team_id: 'team-1',
      team_name: 'Coaching SL',
    })

    await renderPage()

    const acceptBtn = await screen.findByRole('button', {
      name: /join team/i,
    })
    fireEvent.click(acceptBtn)

    const sessionsBtn = await screen.findByRole('button', {
      name: /view your sessions/i,
    })
    fireEvent.click(sessionsBtn)

    expect(mockReplace).toHaveBeenCalledWith('/sessions')
  })
})

describe('JoinTokenPage — accept: already_member', () => {
  it('shows friendly already-member message with sessions CTA', async () => {
    mockRequest.mockResolvedValue({
      status: 'already_member',
      team_id: 'team-1',
      team_name: 'Coaching SL',
    })

    await renderPage()

    const btn = await screen.findByRole('button', { name: /join team/i })
    fireEvent.click(btn)

    await screen.findByRole('heading', { name: /already part of Coaching SL/i })
    expect(
      screen.getByRole('button', { name: /go to your sessions/i }),
    ).toBeInTheDocument()
  })
})

describe('JoinTokenPage — accept: not_eligible', () => {
  it('shows not eligible message for coaches', async () => {
    mockRequest.mockResolvedValue({
      status: 'not_eligible',
      team_id: 'team-1',
      team_name: 'Coaching SL',
    })

    await renderPage()

    const btn = await screen.findByRole('button', { name: /join team/i })
    fireEvent.click(btn)

    await screen.findByText(/cannot join as athlete/i)
  })
})

describe('JoinTokenPage — accept: email mismatch', () => {
  it('shows wrong account message on 403 ForbiddenError', async () => {
    mockRequest.mockRejectedValue(
      new ForbiddenError(
        'This invitation was sent to athlete@example.com. Please sign in with that account.',
      ),
    )

    await renderPage()

    const btn = await screen.findByRole('button', { name: /join team/i })
    fireEvent.click(btn)

    await screen.findByRole('heading', { name: /wrong account/i })
    expect(
      screen.getByText(/This invitation was sent to athlete@example.com/),
    ).toBeInTheDocument()
  })
})

describe('JoinTokenPage — accept: error', () => {
  it('shows invalid state on accept failure', async () => {
    mockRequest.mockRejectedValue(new Error('network error'))

    await renderPage()

    const btn = await screen.findByRole('button', { name: /join team/i })
    fireEvent.click(btn)

    await screen.findByText(/invalid invite/i)
  })
})
