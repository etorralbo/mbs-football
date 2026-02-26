import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'

afterEach(cleanup)
import { NavBar } from './NavBar'

const { mockReplace } = vi.hoisted(() => ({ mockReplace: vi.fn() }))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: mockReplace }),
}))

vi.mock('@/app/_shared/auth/tokenStorage', () => ({
  clearToken: vi.fn(),
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

  it('redirects to /login when Sign out is clicked', () => {
    render(<NavBar />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(mockReplace).toHaveBeenCalledWith('/login')
  })
})
