import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./useFunnelStats', () => ({
  useFunnelStats: vi.fn(),
}))

import { useFunnelStats } from './useFunnelStats'
import { FunnelStatsCard } from './FunnelStatsCard'

const mockUseFunnelStats = vi.mocked(useFunnelStats)

describe('FunnelStatsCard', () => {
  beforeEach(() => {
    mockUseFunnelStats.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders a loading skeleton while fetching', () => {
    mockUseFunnelStats.mockReturnValue({ status: 'loading' })

    render(<FunnelStatsCard />)

    expect(screen.getByLabelText('Loading team activity')).toBeInTheDocument()
  })

  it('renders stat counts on success', () => {
    mockUseFunnelStats.mockReturnValue({
      status: 'success',
      data: { team_created: 1, invite_created: 2, invite_accepted: 3, template_created_ai: 1, assignment_created: 2, session_first_log_added: 4, session_completed: 5 },
    })

    render(<FunnelStatsCard />)

    expect(screen.getByLabelText('Team activity')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Invites accepted')).toBeInTheDocument()
    expect(screen.getByText('Sessions completed')).toBeInTheDocument()
  })

  it('renders nothing on error', () => {
    mockUseFunnelStats.mockReturnValue({ status: 'error' })

    const { container } = render(<FunnelStatsCard />)

    expect(container).toBeEmptyDOMElement()
  })
})
