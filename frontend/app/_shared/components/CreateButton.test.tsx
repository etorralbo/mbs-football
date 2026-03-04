import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { CreateButton } from './CreateButton'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

afterEach(() => cleanup())

describe('CreateButton', () => {
  it('renders as <button> when onClick is provided', () => {
    render(<CreateButton onClick={() => {}}>New Item</CreateButton>)
    const btn = screen.getByRole('button', { name: /new item/i })
    expect(btn.tagName).toBe('BUTTON')
  })

  it('renders as <a> (Link) when href is provided', () => {
    render(<CreateButton href="/create">New Item</CreateButton>)
    const link = screen.getByRole('link', { name: /new item/i })
    expect(link).toHaveAttribute('href', '/create')
  })

  it('applies custom className', () => {
    render(<CreateButton onClick={() => {}} className="mt-4">Create</CreateButton>)
    expect(screen.getByRole('button')).toHaveClass('mt-4')
  })

  it('disables the button when disabled={true}', () => {
    render(<CreateButton onClick={() => {}} disabled>Create</CreateButton>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<CreateButton onClick={onClick}>Create</CreateButton>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn()
    render(<CreateButton onClick={onClick} disabled>Create</CreateButton>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })
})
