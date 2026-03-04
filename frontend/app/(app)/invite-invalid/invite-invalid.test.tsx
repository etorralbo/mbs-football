import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import InviteInvalidPage from './page'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

afterEach(() => cleanup())

describe('InviteInvalidPage', () => {
  it('shows the invalid invite message', () => {
    render(<InviteInvalidPage />)
    expect(screen.getByText(/invite link is invalid or expired/i)).toBeInTheDocument()
  })

  it('shows a message to ask coach for new link', () => {
    render(<InviteInvalidPage />)
    expect(screen.getByText(/ask your coach for a new one/i)).toBeInTheDocument()
  })

  it('has a link to /sessions', () => {
    render(<InviteInvalidPage />)
    const link = screen.getByRole('link', { name: /go to dashboard/i })
    expect(link).toHaveAttribute('href', '/sessions')
  })
})
