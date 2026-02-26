import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'

afterEach(cleanup)
import { NavBar } from './NavBar'

const { mockReplace, mockSignOut } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockSignOut: vi.fn().mockResolvedValue({}),
}))

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

describe('NavBar', () => {
  it('renders the Templates link', () => {
    render(<NavBar />)
    const link = screen.getByRole('link', { name: /templates/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/templates')
  })

  it('renders the Sessions link', () => {
    render(<NavBar />)
    const link = screen.getByRole('link', { name: /sessions/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/sessions')
  })

  it('renders the Sign out button', () => {
    render(<NavBar />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('redirects to /login when Sign out is clicked', async () => {
    render(<NavBar />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login')
    })
  })
})
