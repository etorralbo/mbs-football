import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'

afterEach(cleanup)
import { NavBar } from './NavBar'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
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
})
