import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { MeResponse, WorkoutTemplate, WorkoutSessionSummary } from '@/app/_shared/api/types'

// Must be declared before importing the module under test so vitest hoists it.
vi.mock('@/app/_shared/api/httpClient', () => ({
  request: vi.fn(),
}))

import { request } from '@/app/_shared/api/httpClient'
import { useActivationState } from './useActivationState'

const mockRequest = vi.mocked(request)

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeMeCoach(): MeResponse {
  return {
    user_id: 'user-coach',
    memberships: [{ team_id: 'team-1', team_name: 'Alpha FC', role: 'COACH' }],
    active_team_id: 'team-1',
  }
}

function makeMeAthlete(): MeResponse {
  return {
    user_id: 'user-athlete',
    memberships: [{ team_id: 'team-1', team_name: 'Alpha FC', role: 'ATHLETE' }],
    active_team_id: 'team-1',
  }
}

function setupMocks(
  me: MeResponse,
  templates: WorkoutTemplate[] = [],
  sessions: WorkoutSessionSummary[] = [],
) {
  mockRequest.mockImplementation((path: string) => {
    if (path === '/v1/me') return Promise.resolve(me)
    if (path === '/v1/workout-templates') return Promise.resolve(templates)
    if (path === '/v1/workout-sessions') return Promise.resolve(sessions)
    return Promise.resolve([])
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useActivationState', () => {
  beforeEach(() => {
    mockRequest.mockReset()
  })

it('starts with isLoading: true before any fetch resolves', () => {
    mockRequest.mockReturnValue(new Promise(() => {})) // never resolves

    const { result } = renderHook(() => useActivationState())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.role).toBeNull()
    expect(result.current.steps).toHaveLength(0)
    expect(result.current.nextAction).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('returns create_template as nextAction for a coach with membership but no templates', async () => {
    setupMocks(makeMeCoach(), /* templates */ [], /* sessions */ [])

    const { result } = renderHook(() => useActivationState())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBeNull()
    expect(result.current.role).toBe('COACH')
    expect(result.current.nextAction?.key).toBe('create_template')
  })

  it('returns view_session as nextAction for an athlete with membership but no sessions', async () => {
    setupMocks(makeMeAthlete(), /* templates */ [], /* sessions */ [])

    const { result } = renderHook(() => useActivationState())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBeNull()
    expect(result.current.role).toBe('ATHLETE')
    expect(result.current.nextAction?.key).toBe('view_session')
  })

  it('degrades templates/sessions to [] and still resolves when they time out', async () => {
    // withTimeout rejects slow fetches — simulate that outcome directly.
    // Testing the rejection-handling path is what matters; the timer
    // mechanism of withTimeout is an implementation detail.
    mockRequest.mockImplementation((path: string) => {
      if (path === '/v1/me') return Promise.resolve(makeMeCoach())
      return Promise.reject(new Error('Timeout after 2000ms'))
    })

    const { result } = renderHook(() => useActivationState())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Timeout is a soft failure — no hard error surfaced.
    expect(result.current.error).toBeNull()
    expect(result.current.role).toBe('COACH')
    // templates=[] → first incomplete step is create_template (membership done)
    expect(result.current.nextAction?.key).toBe('create_template')
  })

  it('surfaces the error and clears steps when /v1/me fails', async () => {
    const boom = new Error('Unauthorized')
    mockRequest.mockImplementation((path: string) => {
      if (path === '/v1/me') return Promise.reject(boom)
      return Promise.resolve([])
    })

    const { result } = renderHook(() => useActivationState())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe(boom)
    expect(result.current.role).toBeNull()
    expect(result.current.steps).toHaveLength(0)
  })
})
