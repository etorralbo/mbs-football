import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Greeting } from './Greeting'

describe('Greeting', () => {
  it('renders the greeting message', () => {
    render(<Greeting name="World" />)
    expect(screen.getByText('Hello, World!')).toBeInTheDocument()
  })
})
