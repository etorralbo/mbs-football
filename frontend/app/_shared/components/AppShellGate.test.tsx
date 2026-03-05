/**
 * Tests for AppShellGate — bootstrap skeleton vs real navbar.
 *
 * Verifies that during app bootstrap (loading, onboarding, etc.) the real
 * NavBar is NOT rendered and the skeleton placeholder is shown instead.
 */
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockUseAuth, mockUsePathname } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUsePathname: vi.fn().mockReturnValue('/sessions'),
}))

vi.mock('@/src/shared/auth/AuthContext', () => ({ useAuth: mockUseAuth }))

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('@/app/_shared/auth/supabaseClient', () => ({
  supabase: { auth: { signOut: vi.fn().mockResolvedValue({}) } },
}))

import { AppShellGate } from './AppShellGate'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authValue(overrides: Partial<ReturnType<typeof mockUseAuth>> = {}) {
  return {
    me: null,
    role: null,
    activeTeamId: null,
    loading: false,
    error: null,
    isAppBootstrapping: false,
    refreshMe: vi.fn(),
    setActiveTeamId: vi.fn(),
    clearActiveTeam: vi.fn(),
    setOnboardingResolving: vi.fn(),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  mockUseAuth.mockReset()
  mockUsePathname.mockReturnValue('/sessions')
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppShellGate — bootstrapping', () => {
  it('shows skeleton when loading=true (AuthProvider fetching /v1/me)', () => {
    mockUseAuth.mockReturnValue(authValue({ loading: true, isAppBootstrapping: true }))

    render(<AppShellGate><p>child</p></AppShellGate>)

    expect(screen.getByTestId('app-shell-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('app-navbar')).not.toBeInTheDocument()
    // Children not mounted during loading
    expect(screen.queryByText('child')).not.toBeInTheDocument()
  })

  it('shows skeleton when onboardingResolving=true', () => {
    mockUseAuth.mockReturnValue(authValue({ isAppBootstrapping: true }))

    render(<AppShellGate><p>child</p></AppShellGate>)

    expect(screen.getByTestId('app-shell-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('app-navbar')).not.toBeInTheDocument()
  })

  it('shows skeleton on /onboarding route and mounts children hidden', () => {
    mockUsePathname.mockReturnValue('/onboarding')
    mockUseAuth.mockReturnValue(authValue({ loading: false }))

    render(<AppShellGate><p>child</p></AppShellGate>)

    expect(screen.getByTestId('app-shell-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('app-navbar')).not.toBeInTheDocument()
    // Children are mounted (hidden) so router-guard effects can run
    expect(screen.getByText('child')).toBeInTheDocument()
  })

  it('does NOT show Sessions link during bootstrap', () => {
    mockUseAuth.mockReturnValue(authValue({ loading: true, isAppBootstrapping: true }))

    render(<AppShellGate><p>child</p></AppShellGate>)

    expect(screen.queryByRole('link', { name: /sessions/i })).not.toBeInTheDocument()
  })
})

describe('AppShellGate — ready', () => {
  it('shows real NavBar when not bootstrapping', () => {
    mockUseAuth.mockReturnValue(
      authValue({
        me: {
          user_id: 'u1',
          memberships: [{ team_id: 't1', team_name: 'FC', role: 'COACH', is_owner: true }],
          active_team_id: 't1',
        },
        role: 'COACH',
        activeTeamId: 't1',
        loading: false,
        isAppBootstrapping: false,
      }),
    )

    render(<AppShellGate><p>child</p></AppShellGate>)

    expect(screen.queryByTestId('app-shell-skeleton')).not.toBeInTheDocument()
    expect(screen.getByTestId('app-navbar')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /sessions/i })).toBeInTheDocument()
    expect(screen.getByText('child')).toBeInTheDocument()
  })
})
