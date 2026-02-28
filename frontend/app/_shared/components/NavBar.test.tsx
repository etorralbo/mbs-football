import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { NavBar } from './NavBar'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockUseAuth, mockReplace, mockSignOut } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockReplace: vi.fn(),
  mockSignOut: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/src/shared/auth/AuthContext', () => ({ useAuth: mockUseAuth }))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: mockReplace }),
}))

vi.mock('@/app/_shared/auth/supabaseClient', () => ({
  supabase: { auth: { signOut: mockSignOut } },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authAs(role: 'COACH' | 'ATHLETE' | null) {
  mockUseAuth.mockReturnValue({
    me: null,
    role,
    activeTeamId: null,
    loading: role === null,
    error: null,
    refreshMe: vi.fn(),
  })
}

afterEach(() => {
  cleanup()
  mockUseAuth.mockReset()
  mockReplace.mockReset()
})

// ---------------------------------------------------------------------------
// Coach nav
// ---------------------------------------------------------------------------

describe('NavBar — COACH', () => {
  beforeEach(() => authAs('COACH'))

  it('renders the Templates link', () => {
    render(<NavBar />)
    expect(screen.getByRole('link', { name: /templates/i })).toHaveAttribute('href', '/templates')
  })

  it('renders the Sessions link', () => {
    render(<NavBar />)
    expect(screen.getByRole('link', { name: /sessions/i })).toHaveAttribute('href', '/sessions')
  })

  it('renders the Team link', () => {
    render(<NavBar />)
    expect(screen.getByRole('link', { name: /^team$/i })).toHaveAttribute('href', '/team')
  })

  it('renders the Sign out button', () => {
    render(<NavBar />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('redirects to /login when Sign out is clicked', async () => {
    render(<NavBar />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'))
  })
})

// ---------------------------------------------------------------------------
// Athlete nav
// ---------------------------------------------------------------------------

describe('NavBar — ATHLETE', () => {
  beforeEach(() => authAs('ATHLETE'))

  it('renders the Sessions link', () => {
    render(<NavBar />)
    expect(screen.getByRole('link', { name: /sessions/i })).toHaveAttribute('href', '/sessions')
  })

  it('does NOT render the Templates link', () => {
    render(<NavBar />)
    expect(screen.queryByRole('link', { name: /templates/i })).not.toBeInTheDocument()
  })

  it('does NOT render the Team link', () => {
    render(<NavBar />)
    expect(screen.queryByRole('link', { name: /^team$/i })).not.toBeInTheDocument()
  })

  it('renders the Sign out button', () => {
    render(<NavBar />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Loading state (role not yet resolved)
// ---------------------------------------------------------------------------

describe('NavBar — loading', () => {
  beforeEach(() => authAs(null))

  it('renders the Sessions link while loading', () => {
    render(<NavBar />)
    expect(screen.getByRole('link', { name: /sessions/i })).toBeInTheDocument()
  })

  it('does not render coach-only links while loading', () => {
    render(<NavBar />)
    expect(screen.queryByRole('link', { name: /templates/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^team$/i })).not.toBeInTheDocument()
  })
})
