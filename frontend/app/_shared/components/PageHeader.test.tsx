import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect } from 'vitest'
import { PageHeader } from './PageHeader'

afterEach(() => cleanup())

describe('PageHeader', () => {
  it('renders the title as an h1', () => {
    render(<PageHeader title="My Page" />)
    expect(screen.getByRole('heading', { level: 1, name: 'My Page' })).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    render(<PageHeader title="My Page" subtitle="A short description" />)
    expect(screen.getByText('A short description')).toBeInTheDocument()
  })

  it('does not render subtitle when omitted', () => {
    const { container } = render(<PageHeader title="My Page" />)
    expect(container.querySelector('p')).toBeNull()
  })

  it('renders actions slot', () => {
    render(
      <PageHeader
        title="My Page"
        actions={<button type="button">Do something</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Do something' })).toBeInTheDocument()
  })

  it('does not render actions wrapper when actions is omitted', () => {
    const { container } = render(<PageHeader title="My Page" />)
    // Only the title wrapper div and the root div should exist
    const rootDiv = container.firstElementChild!
    expect(rootDiv.children).toHaveLength(1)
  })
})
