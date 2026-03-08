import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { MobileNav } from './MobileNav'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}))

vi.mock('@/src/shared/auth/AuthContext', () => ({ useAuth: mockUseAuth }))

vi.mock('next/link', () => ({
  default: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>{children}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/sessions',
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('@/app/_shared/auth/supabaseClient', () => ({
  supabase: { auth: { signOut: vi.fn().mockResolvedValue({}) } },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authAs(role: 'COACH' | 'ATHLETE') {
  mockUseAuth.mockReturnValue({
    me: { user_id: 'u1', memberships: [{ team_id: 't1', team_name: 'FC', role }], active_team_id: 't1' },
    role,
    activeTeamId: 't1',
    loading: false,
    error: null,
    refreshMe: vi.fn(),
    setActiveTeamId: vi.fn(),
    clearActiveTeam: vi.fn(),
  })
}

afterEach(() => {
  cleanup()
  mockUseAuth.mockReset()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MobileNav', () => {
  it('renders the hamburger button', () => {
    authAs('COACH')
    render(<MobileNav />)
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument()
  })

  it('shows the brand name in the mobile top bar', () => {
    authAs('COACH')
    render(<MobileNav />)
    // The top bar has a span with the brand; NavBar inside drawer also has it.
    // Check the top-bar span specifically.
    const topBar = screen.getByRole('button', { name: /open menu/i }).parentElement!
    expect(topBar).toHaveTextContent('Mettle Performance')
  })

  it('opens the drawer when hamburger is clicked', () => {
    authAs('COACH')
    render(<MobileNav />)

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))

    expect(screen.getByRole('dialog', { name: /navigation menu/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /close menu/i })).toBeInTheDocument()
  })

  it('closes the drawer when close button is clicked', () => {
    authAs('COACH')
    render(<MobileNav />)

    // Open
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Close
    fireEvent.click(screen.getByRole('button', { name: /close menu/i }))

    // Drawer container becomes invisible
    const wrapper = screen.getByRole('dialog', { hidden: true }).closest('[aria-hidden]')
    expect(wrapper).toHaveAttribute('aria-hidden', 'true')
  })

  it('closes the drawer when a nav link is clicked', () => {
    authAs('ATHLETE')
    render(<MobileNav />)

    // Open drawer
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))

    // Click the Sessions link inside the drawer
    fireEvent.click(screen.getByRole('link', { name: /sessions/i }))

    // Drawer becomes invisible
    const wrapper = screen.getByRole('dialog', { hidden: true }).closest('[aria-hidden]')
    expect(wrapper).toHaveAttribute('aria-hidden', 'true')
  })

  it('closes the drawer when overlay is clicked', () => {
    authAs('COACH')
    render(<MobileNav />)

    // Open drawer
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))

    // Click the overlay (the element right before the panel)
    const dialog = screen.getByRole('dialog')
    const overlay = dialog.previousElementSibling as HTMLElement
    fireEvent.click(overlay)

    const wrapper = screen.getByRole('dialog', { hidden: true }).closest('[aria-hidden]')
    expect(wrapper).toHaveAttribute('aria-hidden', 'true')
  })

  it('closes the drawer on Escape key', () => {
    authAs('COACH')
    render(<MobileNav />)

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    const wrapper = screen.getByRole('dialog', { hidden: true }).closest('[aria-hidden]')
    expect(wrapper).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders the NavBar inside the drawer with nav links', () => {
    authAs('COACH')
    render(<MobileNav />)

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))

    expect(screen.getByRole('link', { name: /sessions/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /templates/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /exercises/i })).toBeInTheDocument()
  })
})
